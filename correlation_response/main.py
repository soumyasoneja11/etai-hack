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
from correlation_response.correlate import correlate_detection, get_threat_intel, get_threat_intel_bundle
from correlation_response.supabase_store import anomaly_store
from shared.auth import require_auth
from shared.envelope import error_response, success_response
from shared.schemas import (
    BlockRequest,
    DetectionResult,
    IsolateRequest,
    NarrativeRequest,
    RevokeRequest,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("correlation-response starting on %s:%s", settings.host, settings.port)
    yield


app = FastAPI(
    title="CyberShield — Correlation & Response (B)",
    version="0.2.0",
    description=(
        "MITRE ATT&CK correlation, anomaly persistence, Neo4j graph, "
        "RAG narrative, decision engine, mock SOAR, audit trail. "
        "Aligns with CyberShield_NIC_API_Schema."
    ),
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

    # 5. Decision engine (auto-compute recommendation)
    from correlation_response.decision import compute_decision

    decision_result = compute_decision(
        anomaly_id=anomaly_id,
        attack=detection.attack,
        confidence=detection.confidence,
        mitre_technique_id=attribution["mitre_technique_id"],
        mitre_tactic=attribution["mitre_tactic"],
    )
    attribution["decision"] = decision_result.model_dump(mode="json")

    logger.info(
        "correlated signal=%s attack=%s → %s (%s) anomaly=%s threat_intel=%d decision=%s",
        detection.signal_id,
        detection.attack,
        attribution["mitre_technique_id"],
        attribution["mitre_tactic"],
        anomaly_id,
        threat_bundle["total"],
        decision_result.decision,
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


# ===================================================================
# NEW ENDPOINTS — Day 6–8
# ===================================================================


# ---------------------------------------------------------------------------
# POST /api/v1/narrative (authenticated) — Day 6
# ---------------------------------------------------------------------------

@app.post("/api/v1/narrative")
def generate_narrative_endpoint(
    req: NarrativeRequest,
    user: dict = Depends(require_auth),
):
    """Generate an analyst-style RAG narrative for an anomaly.

    Retrieves threat intel docs, calls LLM (Gemini), returns structured
    narrative. Falls back to template if LLM is unavailable.
    """
    from correlation_response.narrative import generate_narrative

    # Fetch anomaly from store
    stored = anomaly_store.get(req.anomaly_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="anomaly not found")

    # Get attribution
    attrs = anomaly_store.list_attributions(limit=1000, offset=0)
    attribution = next(
        (a for a in attrs if a.get("anomaly_id") == req.anomaly_id),
        None,
    )

    attack = stored.get("title", "Unknown")
    mitre_technique_id = attribution.get("mitre_technique_id", "T0000") if attribution else "T0000"
    technique_name = attribution.get("technique_name", "Unknown") if attribution else "Unknown"
    mitre_tactic = attribution.get("mitre_tactic", "unknown") if attribution else "unknown"
    confidence = attribution.get("confidence", 0.0) if attribution else 0.0
    asset_id = stored.get("asset_id", "unknown")
    detected_at = stored.get("detected_at", "unknown")

    # Derive attack label for threat intel lookup
    # Try to map title back to CICIDS label via reverse lookup
    from shared.enums import ATTACK_TITLES
    attack_label = next(
        (k for k, v in ATTACK_TITLES.items() if v == attack),
        attack,
    )

    # Retrieve threat intel docs
    threat_docs = get_threat_intel(attack_label)

    user_id = user.get("sub")
    result = generate_narrative(
        anomaly_id=req.anomaly_id,
        attack=attack_label,
        mitre_technique_id=mitre_technique_id,
        technique_name=technique_name,
        mitre_tactic=mitre_tactic,
        confidence=confidence,
        asset_id=asset_id,
        detected_at=str(detected_at),
        threat_docs=threat_docs,
        user_id=user_id,
    )

    return success_response(result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# POST /api/v1/decide (authenticated) — Day 7
# ---------------------------------------------------------------------------

@app.post("/api/v1/decide")
def decide_endpoint(
    req: NarrativeRequest,  # reuse — only needs anomaly_id
    user: dict = Depends(require_auth),
):
    """Compute a decision recommendation for an anomaly.

    Combines ML confidence with blast radius (from Neo4j or static fallback)
    to produce an actionable recommendation.
    """
    from correlation_response.audit import log_action
    from correlation_response.decision import compute_decision

    stored = anomaly_store.get(req.anomaly_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="anomaly not found")

    attrs = anomaly_store.list_attributions(limit=1000, offset=0)
    attribution = next(
        (a for a in attrs if a.get("anomaly_id") == req.anomaly_id),
        None,
    )

    attack = stored.get("title", "Unknown")
    from shared.enums import ATTACK_TITLES
    attack_label = next(
        (k for k, v in ATTACK_TITLES.items() if v == attack),
        attack,
    )

    confidence = attribution.get("confidence", 0.0) if attribution else 0.0
    mitre_technique_id = attribution.get("mitre_technique_id", "") if attribution else ""
    mitre_tactic = attribution.get("mitre_tactic", "") if attribution else ""

    result = compute_decision(
        anomaly_id=req.anomaly_id,
        attack=attack_label,
        confidence=confidence,
        mitre_technique_id=mitre_technique_id,
        mitre_tactic=mitre_tactic,
    )

    # Audit trail
    from shared.schemas import AuditEntry
    log_action(
        AuditEntry(
            anomaly_id=req.anomaly_id,
            action_type="decision_computed",
            actor=user.get("email", "system"),
            target=stored.get("asset_id", ""),
            decision=result.decision,
            status="success",
            details=result.model_dump(mode="json"),
        ),
        user_id=user.get("sub"),
    )

    return success_response(result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# POST /api/v1/soar/* (authenticated) — Day 8
# ---------------------------------------------------------------------------

@app.post("/api/v1/soar/isolate")
async def soar_isolate(
    req: IsolateRequest,
    user: dict = Depends(require_auth),
):
    """Simulate network isolation of a compromised endpoint."""
    from correlation_response import soar

    result = await soar.isolate_endpoint(
        anomaly_id=req.anomaly_id,
        asset_id=req.asset_id,
        actor=user.get("email", "system"),
        user_id=user.get("sub"),
    )
    return success_response(result.model_dump(mode="json"))


@app.post("/api/v1/soar/block")
async def soar_block(
    req: BlockRequest,
    user: dict = Depends(require_auth),
):
    """Simulate firewall block of a malicious IP."""
    from correlation_response import soar

    result = await soar.block_ip(
        anomaly_id=req.anomaly_id,
        ip_address=req.ip_address,
        actor=user.get("email", "system"),
        user_id=user.get("sub"),
    )
    return success_response(result.model_dump(mode="json"))


@app.post("/api/v1/soar/revoke")
async def soar_revoke(
    req: RevokeRequest,
    user: dict = Depends(require_auth),
):
    """Simulate credential revocation for a compromised asset."""
    from correlation_response import soar

    result = await soar.revoke_credential(
        anomaly_id=req.anomaly_id,
        asset_id=req.asset_id,
        actor=user.get("email", "system"),
        user_id=user.get("sub"),
    )
    return success_response(result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# GET /api/v1/soar/actions (authenticated) — Day 8
# ---------------------------------------------------------------------------

@app.get("/api/v1/soar/actions")
def list_soar_actions(
    limit: int = 50,
    offset: int = 0,
    _user: dict = Depends(require_auth),
):
    """List recent SOAR actions."""
    from correlation_response.audit import list_soar_actions as _list

    items = _list(limit=limit, offset=offset)
    return success_response({
        "items": items,
        "limit": limit,
        "offset": offset,
    })


@app.get("/api/v1/soar/actions/{action_id}")
def get_soar_action_endpoint(
    action_id: str,
    _user: dict = Depends(require_auth),
):
    """Get a single SOAR action by ID."""
    from correlation_response.audit import get_soar_action

    action = get_soar_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="SOAR action not found")
    return success_response(action)


# ---------------------------------------------------------------------------
# GET /api/v1/audit (authenticated) — Day 8
# ---------------------------------------------------------------------------

@app.get("/api/v1/audit")
def list_audit_endpoint(
    limit: int = 50,
    offset: int = 0,
    _user: dict = Depends(require_auth),
):
    """Paginated list of audit log entries."""
    from correlation_response.audit import list_audit_logs

    items = list_audit_logs(limit=limit, offset=offset)
    return success_response({
        "items": items,
        "limit": limit,
        "offset": offset,
    })


@app.get("/api/v1/audit/{anomaly_id}")
def get_audit_trail_endpoint(
    anomaly_id: str,
    _user: dict = Depends(require_auth),
):
    """Audit trail for a specific anomaly."""
    from correlation_response.audit import get_audit_trail

    items = get_audit_trail(anomaly_id)
    return success_response({
        "anomaly_id": anomaly_id,
        "items": items,
        "total": len(items),
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