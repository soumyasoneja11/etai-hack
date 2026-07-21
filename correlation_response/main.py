"""B's correlation & response FastAPI service (port 8001) — CyberShield NIC aligned."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from correlation_response.config import settings
from correlation_response.correlate import correlate_detection, get_threat_intel, get_threat_intel_bundle
from correlation_response.supabase_store import anomaly_store
from shared.auth import ScopedContext, require_scoped
from shared.cors import get_cors_allowed_origins
from shared.envelope import error_response, success_response
from shared.errors import StoreUnavailableError
from shared.logging_config import configure_logging
from shared.request_context import install_request_context
from shared.schemas import (
    BlockRequest,
    DetectionResult,
    IsolateRequest,
    NarrativeRequest,
    ReviewNoteRequest,
    RevokeRequest,
)

configure_logging()
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reuse the inbound X-Request-ID (set by A on the forward call) or mint one, so
# a single request is traceable across both services.
install_request_context(app)


# ---------------------------------------------------------------------------
# Exception handlers (mirror A's pattern)
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=error_response("VALIDATION_ERROR", str(exc.errors())),
    )


# Preserve the real status code/error type through the envelope so the frontend
# can act on it specifically (e.g. trigger re-login on 401/403) instead of
# seeing every failure collapse to BAD_REQUEST.
_STATUS_TO_CODE = {
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code = _STATUS_TO_CODE.get(exc.status_code, "BAD_REQUEST")
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(code, str(exc.detail)),
    )


@app.exception_handler(StoreUnavailableError)
async def store_unavailable_handler(request: Request, exc: StoreUnavailableError):
    # A read/query genuinely failed (DB down, bad connection) — surface 503 so
    # the dashboard shows "failed to load" rather than a silent empty list.
    logger.error("datastore unavailable on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content=error_response(
            "SERVICE_UNAVAILABLE",
            "Backend datastore is unavailable. Please retry shortly.",
        ),
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
    ctx: ScopedContext = Depends(require_scoped),
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

    # 2. Compute the decision NOW so the authoritative correlate-time
    #    recommendation is persisted with the anomaly (previously it was only
    #    recomputed by /decide and never stored, so it was lost on reload).
    from correlation_response.decision import compute_decision

    decision_result = compute_decision(
        anomaly_id=anomaly_id,
        attack=detection.attack,
        confidence=detection.confidence,
        mitre_technique_id=attribution["mitre_technique_id"],
        mitre_tactic=attribution["mitre_tactic"],
    )
    attribution["decision"] = decision_result.model_dump(mode="json")

    # 3. Persist anomaly (with decision) + attribution to Supabase
    list_item = detection.to_anomaly_list_item(anomaly_id=anomaly_id)
    detail = detection.to_anomaly_detail(anomaly_id=anomaly_id)

    user_id = ctx.user_id
    anomaly_store.put(
        anomaly_id=anomaly_id,
        list_item=list_item,
        detail=detail,
        attribution=attribution,
        decision=attribution["decision"],
        user_id=user_id,
        client=ctx.db,
    )

    # 4. Neo4j graph update (best-effort, non-blocking)
    _try_neo4j_update(detection, attribution, anomaly_id)

    # 5. Enrich with threat intel
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
    ctx: ScopedContext = Depends(require_scoped),
):
    """Return persisted anomalies matching CyberShield Excel schema."""
    items = anomaly_store.list_items(
        limit=limit, offset=offset, user_id=ctx.user_id, client=ctx.db
    )
    return success_response({
        "items": items,
        "total": anomaly_store.count(user_id=ctx.user_id, client=ctx.db),
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
# GET /api/v1/graph (authenticated)
# ---------------------------------------------------------------------------

@app.get("/api/v1/graph")
def get_graph(
    limit: int = 50,
    ctx: ScopedContext = Depends(require_scoped),
):
    """
    Attack-path topology for the dashboard GraphViewer.

    Contract (matches frontend GraphNode / GraphLink):
      { nodes: [{id, label, type: "asset"|"attack"|"mitre", severity?, details?}],
        links: [{source, target, label, animated?}] }
    Built from recent anomalies + attributions; Neo4j preferred when configured.
    Empty store → 200 with nodes=[], links=[].
    """
    from correlation_response.graph.builder import get_attack_graph

    return success_response(
        get_attack_graph(
            limit=max(1, min(limit, 200)),
            user_id=ctx.user_id,
            client=ctx.db,
        )
    )


# ---------------------------------------------------------------------------
# GET /api/v1/anomalies/{anomaly_id} (authenticated)
# ---------------------------------------------------------------------------

@app.get("/api/v1/anomalies/{anomaly_id}")
def get_anomaly(anomaly_id: str, ctx: ScopedContext = Depends(require_scoped)):
    """Return full anomaly detail for a single anomaly."""
    stored = anomaly_store.get(anomaly_id, user_id=ctx.user_id, client=ctx.db)
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
    ctx: ScopedContext = Depends(require_scoped),
):
    """Return MITRE ATT&CK attributions."""
    items = anomaly_store.list_attributions(
        limit=limit, offset=offset, user_id=ctx.user_id, client=ctx.db
    )
    return success_response({
        "items": items,
        "total": anomaly_store.count(user_id=ctx.user_id, client=ctx.db),
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
    ctx: ScopedContext = Depends(require_scoped),
):
    """Generate an analyst-style RAG narrative for an anomaly.

    Retrieves threat intel docs, calls LLM (Gemini), returns structured
    narrative. Falls back to template if LLM is unavailable.
    Persists narrative on the anomaly row for later GET.
    """
    from correlation_response.narrative import generate_narrative

    # Fetch anomaly from store
    stored = anomaly_store.get(req.anomaly_id, user_id=ctx.user_id, client=ctx.db)
    if stored is None:
        raise HTTPException(status_code=404, detail="anomaly not found")

    # Get attribution (direct query, not scan)
    attribution = anomaly_store.get_attribution(
        req.anomaly_id, user_id=ctx.user_id, client=ctx.db
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

    user_id = ctx.user_id
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
        client=ctx.db,
    )

    # Persist (template fallback included) so GET survives FE reload
    try:
        generated_at = result.generated_at
        generated_at_str = (
            generated_at.isoformat()
            if hasattr(generated_at, "isoformat")
            else str(generated_at)
        )
        anomaly_store.save_narrative(
            req.anomaly_id,
            narrative=result.narrative,
            sources=list(result.sources or []),
            generated_at=generated_at_str,
            user_id=ctx.user_id,
            client=ctx.db,
        )
    except Exception as exc:
        logger.warning("Failed to persist narrative for %s: %s", req.anomaly_id, exc)

    return success_response(result.model_dump(mode="json"))


@app.get("/api/v1/narrative/{anomaly_id}")
def get_narrative_endpoint(
    anomaly_id: str,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Return persisted NarrativeResponse for an anomaly (404 if not generated yet)."""
    stored = anomaly_store.get(anomaly_id, user_id=ctx.user_id, client=ctx.db)
    if stored is None:
        raise HTTPException(status_code=404, detail="anomaly not found")
    text = stored.get("narrative")
    if not text:
        raise HTTPException(status_code=404, detail="narrative not generated yet")
    return success_response({
        "anomaly_id": anomaly_id,
        "narrative": text,
        "sources": stored.get("narrative_sources") or [],
        "generated_at": stored.get("narrative_generated_at"),
    })


# ---------------------------------------------------------------------------
# POST /api/v1/decide (authenticated) — Day 7
# ---------------------------------------------------------------------------

@app.post("/api/v1/decide")
def decide_endpoint(
    req: NarrativeRequest,  # reuse — only needs anomaly_id
    ctx: ScopedContext = Depends(require_scoped),
):
    """Compute a decision recommendation for an anomaly.

    Combines ML confidence with blast radius (from Neo4j or static fallback)
    to produce an actionable recommendation.
    """
    from correlation_response.audit import log_action
    from correlation_response.decision import compute_decision

    stored = anomaly_store.get(req.anomaly_id, user_id=ctx.user_id, client=ctx.db)
    if stored is None:
        raise HTTPException(status_code=404, detail="anomaly not found")

    attribution = anomaly_store.get_attribution(
        req.anomaly_id, user_id=ctx.user_id, client=ctx.db
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
            actor=ctx.email or "system",
            target=stored.get("asset_id", ""),
            decision=result.decision,
            status="success",
            details=result.model_dump(mode="json"),
        ),
        user_id=ctx.user_id,
        client=ctx.db,
    )

    return success_response(result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# POST /api/v1/soar/* (authenticated) — Day 8
# ---------------------------------------------------------------------------

@app.post("/api/v1/soar/isolate")
async def soar_isolate(
    req: IsolateRequest,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Simulate network isolation of a compromised endpoint."""
    from correlation_response import soar

    result = await soar.isolate_endpoint(
        anomaly_id=req.anomaly_id,
        asset_id=req.asset_id,
        actor=ctx.email or "system",
        user_id=ctx.user_id,
        client=ctx.db,
    )
    return success_response(result.model_dump(mode="json"))


@app.post("/api/v1/soar/block")
async def soar_block(
    req: BlockRequest,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Simulate firewall block of a malicious IP."""
    from correlation_response import soar

    result = await soar.block_ip(
        anomaly_id=req.anomaly_id,
        ip_address=req.ip_address,
        actor=ctx.email or "system",
        user_id=ctx.user_id,
        client=ctx.db,
    )
    return success_response(result.model_dump(mode="json"))


@app.post("/api/v1/soar/revoke")
async def soar_revoke(
    req: RevokeRequest,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Simulate credential revocation for a compromised asset."""
    from correlation_response import soar

    result = await soar.revoke_credential(
        anomaly_id=req.anomaly_id,
        asset_id=req.asset_id,
        actor=ctx.email or "system",
        user_id=ctx.user_id,
        client=ctx.db,
    )
    return success_response(result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# GET /api/v1/soar/actions (authenticated) — Day 8
# ---------------------------------------------------------------------------

@app.get("/api/v1/soar/actions")
def list_soar_actions(
    limit: int = 50,
    offset: int = 0,
    ctx: ScopedContext = Depends(require_scoped),
):
    """List recent SOAR actions."""
    from correlation_response.audit import list_soar_actions as _list

    items = _list(limit=limit, offset=offset, user_id=ctx.user_id, client=ctx.db)
    return success_response({
        "items": items,
        "limit": limit,
        "offset": offset,
    })


@app.get("/api/v1/soar/actions/{action_id}")
def get_soar_action_endpoint(
    action_id: str,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Get a single SOAR action by ID."""
    from correlation_response.audit import get_soar_action

    action = get_soar_action(action_id, user_id=ctx.user_id, client=ctx.db)
    if action is None:
        raise HTTPException(status_code=404, detail="SOAR action not found")
    return success_response(action)


# ---------------------------------------------------------------------------
# Human review (authenticated) — approve / reject / queue
# ---------------------------------------------------------------------------

def _apply_human_review(
    *,
    anomaly_id: str,
    new_status: str,
    action_type: str,
    decision: str,
    note: str | None,
    ctx: ScopedContext,
) -> dict[str, Any]:
    from correlation_response.audit import log_action
    from shared.schemas import AuditEntry

    existing = anomaly_store.get(anomaly_id, user_id=ctx.user_id, client=ctx.db)
    if existing is None:
        raise HTTPException(status_code=404, detail="anomaly not found")

    previous_status = existing.get("status", "new")
    updated = anomaly_store.update_status(
        anomaly_id, new_status, user_id=ctx.user_id, client=ctx.db
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="anomaly not found")

    actor = ctx.email or ctx.user_id or "analyst"
    details: dict[str, Any] = {
        "previous_status": previous_status,
        "new_status": new_status,
    }
    if note:
        details["note"] = note

    log_action(
        AuditEntry(
            anomaly_id=anomaly_id,
            action_type=action_type,
            actor=str(actor),
            target=str(updated.get("asset_id") or ""),
            decision=decision,
            status="success",
            details=details,
        ),
        user_id=ctx.user_id,
        client=ctx.db,
    )
    return updated


@app.get("/api/v1/review/queue")
def review_queue(
    status: str = "new",
    limit: int = 50,
    offset: int = 0,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Anomalies needing human review (default status=new)."""
    items = anomaly_store.list_items(
        limit=limit, offset=offset, status=status, user_id=ctx.user_id, client=ctx.db
    )
    return success_response({
        "items": items,
        "total": len(items),
        "limit": limit,
        "offset": offset,
        "status": status,
    })


@app.post("/api/v1/review/{anomaly_id}/approve")
def review_approve(
    anomaly_id: str,
    body: ReviewNoteRequest | None = None,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Human approve → anomaly status acknowledged + audit human_approved."""
    note = body.note if body else None
    updated = _apply_human_review(
        anomaly_id=anomaly_id,
        new_status="acknowledged",
        action_type="human_approved",
        decision="approved",
        note=note,
        ctx=ctx,
    )
    return success_response({
        "anomaly_id": anomaly_id,
        "status": updated.get("status"),
        "action": "human_approved",
    })


@app.post("/api/v1/review/{anomaly_id}/reject")
def review_reject(
    anomaly_id: str,
    body: ReviewNoteRequest | None = None,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Human reject → anomaly status false_positive + audit human_rejected."""
    note = body.note if body else None
    updated = _apply_human_review(
        anomaly_id=anomaly_id,
        new_status="false_positive",
        action_type="human_rejected",
        decision="rejected",
        note=note,
        ctx=ctx,
    )
    return success_response({
        "anomaly_id": anomaly_id,
        "status": updated.get("status"),
        "action": "human_rejected",
    })


# ---------------------------------------------------------------------------
# GET /api/v1/audit (authenticated) — Day 8
# ---------------------------------------------------------------------------

@app.get("/api/v1/audit")
def list_audit_endpoint(
    limit: int = 50,
    offset: int = 0,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Paginated list of audit log entries."""
    from correlation_response.audit import list_audit_logs

    items = list_audit_logs(limit=limit, offset=offset, user_id=ctx.user_id, client=ctx.db)
    return success_response({
        "items": items,
        "limit": limit,
        "offset": offset,
    })


@app.get("/api/v1/audit/{anomaly_id}")
def get_audit_trail_endpoint(
    anomaly_id: str,
    ctx: ScopedContext = Depends(require_scoped),
):
    """Audit trail for a specific anomaly."""
    from correlation_response.audit import get_audit_trail

    items = get_audit_trail(anomaly_id, user_id=ctx.user_id, client=ctx.db)
    return success_response({
        "anomaly_id": anomaly_id,
        "items": items,
        "total": len(items),
    })


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

def run() -> None:
    """Local/dev entrypoint.

    Honours ``PORT``/``HOST`` (falling back to ``CORR_PORT``/``CORR_HOST``
    config defaults) and ``WEB_CONCURRENCY`` for worker count. Production runs
    under Gunicorn + uvicorn workers (deploy/gunicorn_conf.py).
    """
    import os

    import uvicorn

    host = os.getenv("HOST", settings.host)
    port = int(os.getenv("PORT", str(settings.port)))
    workers = int(os.getenv("WEB_CONCURRENCY", "1"))

    uvicorn.run(
        "correlation_response.main:app",
        host=host,
        port=port,
        workers=workers,
        reload=False,
        log_config=None,  # keep our JSON logging (configure_logging) intact
    )


if __name__ == "__main__":
    run()