import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from . import store
from .correlate import correlate
from .schemas import DetectionResult

app = FastAPI(title="CyberShield NIC - Correlation & Response Service")
store.init_db()


def envelope(data: dict) -> dict:
    return {
        "success": True,
        "data": data,
        "error": None,
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat(), "request_id": str(uuid.uuid4())},
    }


def error_envelope(code: str, message: str) -> dict:
    return {
        "success": False,
        "data": None,
        "error": {"code": code, "message": message},
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat(), "request_id": str(uuid.uuid4())},
    }


@app.post("/api/v1/correlate")
def post_correlate(detection: DetectionResult):
    try:
        anomaly, attribution = correlate(detection)
    except Exception as e:
        return JSONResponse(status_code=422, content=error_envelope("VALIDATION_ERROR", str(e)))

    store.insert_anomaly({
        "anomaly_id": anomaly.anomaly_id,
        "title": anomaly.title,
        "severity": anomaly.severity,
        "status": anomaly.status,
        "asset_id": anomaly.asset_id,
        "detected_at": anomaly.detected_at.isoformat(),
        "score": anomaly.score,
        "reason": anomaly.reason,
    })
    store.insert_attribution({
        "attribution_id": attribution.attribution_id,
        "anomaly_id": attribution.anomaly_id,
        "mitre_technique_id": attribution.mitre_technique_id,
        "mitre_tactic": attribution.mitre_tactic,
        "matched_campaign": attribution.matched_campaign,
        "confidence": attribution.confidence,
        "created_at": attribution.created_at.isoformat(),
    })

    # response matches CyberShield's /attributions single-item shape
    return envelope(attribution.model_dump(mode="json"))


@app.get("/api/v1/anomalies")
def get_anomalies(
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    severity: str | None = None,
    status: str | None = None,
):
    items, total = store.list_anomalies(limit=limit, offset=offset, severity=severity, status=status)
    return envelope({"items": items, "total": total, "limit": limit, "offset": offset})


@app.get("/api/v1/anomalies/{anomaly_id}")
def get_anomaly(anomaly_id: str):
    items, _ = store.list_anomalies(limit=1, offset=0)
    match = next((a for a in items if a["anomaly_id"] == anomaly_id), None)
    if not match:
        return JSONResponse(status_code=404, content=error_envelope("NOT_FOUND", "Anomaly not found"))
    return envelope(match)


@app.get("/api/v1/attributions")
def get_attributions(
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    anomaly_id: str | None = None,
    campaign: str | None = None,
):
    items, total = store.list_attributions(limit=limit, offset=offset, anomaly_id=anomaly_id, campaign=campaign)
    return envelope({"items": items, "total": total, "limit": limit, "offset": offset})


if __name__ == "__main__":
    import uvicorn
    # Port 8001: keep 8000 free for the detection/events service the replay script reads from.
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, reload=True)