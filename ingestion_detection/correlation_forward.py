"""Best-effort A → B correlate handoff after scored ingest."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ingestion_detection.config import settings
from shared.logging_config import REQUEST_ID_HEADER, get_request_id
from shared.schemas import DetectionResult

logger = logging.getLogger(__name__)


def forward_detection_to_correlate(
    detection: DetectionResult | None,
    *,
    authorization: str | None,
) -> dict[str, Any]:
    """
    POST DetectionResult to B's /api/v1/correlate when appropriate.

    Never raises — ingest must still return 200 if B is down.
    Returns correlation_forward payload for the ingest response data.
    """
    if not settings.correlation_forward_enabled:
        return {"status": "skipped", "detail": "correlation_forward_enabled=false"}

    if detection is None:
        return {"status": "skipped", "detail": "no detection to forward"}

    if detection.attack == "BENIGN":
        return {"status": "skipped", "detail": "BENIGN"}

    if not authorization:
        return {"status": "error", "detail": "missing Authorization header"}

    url = f"{settings.correlation_base_url.rstrip('/')}/api/v1/correlate"
    headers = {
        "Authorization": authorization,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    # Propagate the correlation id so B logs the handoff under the same request.
    rid = get_request_id()
    if rid:
        headers[REQUEST_ID_HEADER] = rid

    try:
        with httpx.Client(timeout=settings.correlation_forward_timeout_sec) as client:
            resp = client.post(
                url,
                json=detection.model_dump(mode="json"),
                headers=headers,
            )
    except Exception as exc:
        logger.warning(
            "correlation forward failed signal=%s attack=%s: %s",
            detection.signal_id,
            detection.attack,
            exc,
        )
        return {"status": "error", "detail": f"network: {exc}"}

    if resp.status_code >= 400:
        detail = f"HTTP {resp.status_code}"
        try:
            body = resp.json()
            err = body.get("error") or {}
            if isinstance(err, dict) and err.get("message"):
                detail = f"HTTP {resp.status_code}: {err['message']}"
            elif body.get("detail"):
                detail = f"HTTP {resp.status_code}: {body['detail']}"
        except Exception:
            detail = f"HTTP {resp.status_code}: {resp.text[:200]}"
        logger.warning(
            "correlation forward rejected signal=%s: %s",
            detection.signal_id,
            detail,
        )
        return {"status": "error", "detail": detail}

    try:
        body = resp.json()
    except Exception as exc:
        return {"status": "error", "detail": f"invalid JSON from B: {exc}"}

    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        return {"status": "error", "detail": "unexpected correlate response shape"}

    if data.get("status") == "skipped":
        return {
            "status": "skipped",
            "detail": data.get("reason") or "skipped by B",
        }

    anomaly_id = data.get("anomaly_id")
    result: dict[str, Any] = {"status": "ok"}
    if anomaly_id:
        result["anomaly_id"] = str(anomaly_id)
    logger.info(
        "correlation forward ok signal=%s attack=%s anomaly=%s",
        detection.signal_id,
        detection.attack,
        anomaly_id,
    )
    return result
