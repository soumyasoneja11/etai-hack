"""B's correlation & response FastAPI service (port 8001) — CyberShield NIC aligned."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from correlation_response.config import settings
from correlation_response.correlate import correlate_detection, get_threat_intel_bundle
from correlation_response.supabase_store import anomaly_store
from shared.auth import require_auth
from shared.envelope import error_response, success_response
from shared.schemas import DetectionResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("correlation-response starting on %s:%s", settings.host, settings.port)
    yield


app = FastAPI(
    title="CyberShield — Correlation & Response (B)",
    version="0.1.0",
    description="MITRE ATT&CK correlation, anomaly persistence, Neo4j graph. Aligns with CyberShield_NIC_API_Schema.",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Exception handlers (mirror A's pattern)
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=error_response("VALIDATION_ERROR", str(exc.errors())),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code = "NOT_FOUND" if exc.status_code == 404 else "BAD_REQUEST"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(code, str(exc.detail)),
    )


# ---------------------------------------------------------------------------
# Health (public — no auth)
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return success_response({"status": "ok", "service": "correlation-response"})


# ---------------------------------------------------------------------------
# POST /api/v1/correlate (authenticated)
# ---------------------------------------------------------------------------

@app.post("/api/v1/correlate")
def correlate(
    detection: DetectionResult,
    user: dict = Depends(require_auth),
):
    """
    Accept a DetectionResult from A and produce:
      1. MITRE ATT&CK attribution
      2. Persisted anomaly record (Supabase)
      3. Neo4j graph update (if configured)

    Returns CyberShield /attributions shape.
    """
    # Skip BENIGN detections
    if detection.attack == "BENIGN":
        return success_response({
            "status": "skipped",
            "reason": "BENIGN traffic not correlated",
            "signal_id": detection.signal_id,
        })

    # 1. Correlate → MITRE attribution
    attribution = correlate_detection(
        attack=detection.attack,
        confidence=detection.confidence,
    )
    anomaly_id = str(uuid4())
    attribution["anomaly_id"] = anomaly_id

    # 2. Persist anomaly + attribution to Supabase
    list_item = detection.to_anomaly_list_item(anomaly_id=anomaly_id)
    detail = detection.to_anomaly_detail(anomaly_id=anomaly_id)

    user_id = user.get("sub")
    anomaly_store.put(
        anomaly_id=anomaly_id,
        list_item=list_item,
        detail=detail,
        attribution=attribution,
        user_id=user_id,
    )

    # 3. Neo4j graph update (best-effort, non-blocking)
    _try_neo4j_update(detection, attribution, anomaly_id)

    # 4. Enrich with threat intel
    threat_bundle = get_threat_intel_bundle(detection.attack)
    attribution["related_cves"] = [
        {
            "doc_id": d["doc_id"],
            "type": d["type"],
            "title": d["title"],
            "severity": d["severity"],
            "cvss_score": d.get("cvss_score"),
            "source_url": d.get("source_url"),
            "remediation": d.get("remediation"),
            "cert_in_ref": d.get("cert_in_ref"),
        }
        for d in threat_bundle["related_cves"]
    ]
    attribution["cert_in_advisories"] = [
        {
            "doc_id": d["doc_id"],
            "type": d["type"],
            "title": d["title"],
            "severity": d["severity"],
            "source_url": d.get("source_url"),
            "remediation": d.get("remediation"),
            "cert_in_ref": d.get("cert_in_ref"),
        }
        for d in threat_bundle["cert_in_advisories"]
    ]
    attribution["threat_intel"] = threat_bundle

    logger.info(
        "correlated signal=%s attack=%s → %s (%s) anomaly=%s threat_intel=%d",
        detection.signal_id,
        detection.attack,
        attribution["mitre_technique_id"],
        attribution["mitre_tactic"],
        anomaly_id,
        threat_bundle["total"],
    )

    return success_response(attribution)


def _try_neo4j_update(
    detection: DetectionResult,
    attribution: dict[str, Any],
    anomaly_id: str,
) -> None:
    """Best-effort Neo4j update — log and continue on failure."""
    try:
        from correlation_response.graph.neo4j_loader import create_exhibited_relationship

        create_exhibited_relationship(
            asset_id=detection.asset_id,
            technique_id=attribution["mitre_technique_id"],
            confidence=detection.confidence,
            anomaly_id=anomaly_id,
        )
    except Exception as exc:
        logger.debug("Neo4j update skipped: %s", exc)


# ---------------------------------------------------------------------------
# GET /api/v1/anomalies (authenticated)
# ---------------------------------------------------------------------------

@app.get("/api/v1/anomalies")
def list_anomalies(
    limit: int = 50,
    offset: int = 0,
    _user: dict = Depends(require_auth),
):
    """Return persisted anomalies matching CyberShield Excel schema."""
    items = anomaly_store.list_items(limit=limit, offset=offset)
    return success_response({
        "items": items,
        "total": anomaly_store.count(),
        "limit": limit,
        "offset": offset,
    })


# ---------------------------------------------------------------------------
# GET /api/v1/threat-intel/{attack_label} (public)
# ---------------------------------------------------------------------------

@app.get("/api/v1/threat-intel/{attack_label}")
def threat_intel(attack_label: str):
    """Return CVE and CERT-In threat intel for a CICIDS attack label."""
    bundle = get_threat_intel_bundle(attack_label)
    if bundle["total"] == 0:
        raise HTTPException(status_code=404, detail=f"no threat intel found for attack label '{attack_label}'")
    return success_response(bundle)


# ---------------------------------------------------------------------------
# GET /api/v1/anomalies/{anomaly_id} (authenticated)
# ---------------------------------------------------------------------------

@app.get("/api/v1/anomalies/{anomaly_id}")
def get_anomaly(anomaly_id: str, _user: dict = Depends(require_auth)):
    """Return full anomaly detail for a single anomaly."""
    stored = anomaly_store.get(anomaly_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="anomaly not found")
    return success_response(stored)


# ---------------------------------------------------------------------------
# GET /api/v1/attributions (authenticated)
# ---------------------------------------------------------------------------

@app.get("/api/v1/attributions")
def list_attributions(
    limit: int = 50,
    offset: int = 0,
    _user: dict = Depends(require_auth),
):
    """Return MITRE ATT&CK attributions."""
    items = anomaly_store.list_attributions(limit=limit, offset=offset)
    return success_response({
        "items": items,
        "total": anomaly_store.count(),
        "limit": limit,
        "offset": offset,
    })


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

def run() -> None:
    import uvicorn

    uvicorn.run(
        "correlation_response.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()