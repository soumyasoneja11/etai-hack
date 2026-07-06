"""A's ingestion + detection FastAPI service (port 8000) — CyberShield NIC aligned."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ingestion_detection.baseline.builder import (
    build_baseline_profiles,
    load_baseline_profiles,
    load_manifest,
    save_baseline,
    z_score_anomaly,
)
from ingestion_detection.config import settings
from ingestion_detection.features import derive_entity_id
from ingestion_detection.predict import ModelNotReadyError, detect_signal, predict_features_list
from ingestion_detection.queue_store import signal_queue
from shared.envelope import error_response, success_response
from shared.schemas import (
    BaselineManifest,
    DetectionResult,
    EntityBaseline,
    FlowEventIn,
    PredictData,
    PredictRequest,
    SignalIngestData,
    SignalIngestRequest,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("ingestion-detection starting on %s:%s", settings.host, settings.port)
    yield


app = FastAPI(
    title="CyberShield — Ingestion & Detection (A)",
    version="0.2.0",
    description="Signal ingest, ML predict, baseline profiling. Aligns with CyberShield_NIC_API_Schema.",
    lifespan=lifespan,
)


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


@app.get("/health")
def health():
    return success_response({"status": "ok", "service": "ingestion-detection"})


def _ingest_signal(signal: SignalIngestRequest, *, score: bool) -> dict[str, Any]:
    asset_id = signal.asset_id or derive_entity_id(signal.features)
    normalized = signal.model_copy(update={"asset_id": asset_id})

    detection: DetectionResult | None = None
    if score:
        try:
            detection = detect_signal(
                signal_id=normalized.signal_id,
                asset_id=asset_id,
                features=normalized.features,
                detected_at=normalized.detected_at,
            )
        except ModelNotReadyError as exc:
            logger.warning("Model not ready, ingest without score: %s", exc)

    stored = signal_queue.enqueue(normalized, detection=detection)

    if settings.log_requests:
        logger.info(
            "ingest signal_id=%s asset=%s row=%s attack=%s queue=%s",
            stored.signal_id,
            asset_id,
            signal.row_index,
            detection.attack if detection else "n/a",
            signal_queue.size(),
        )

    data = SignalIngestData(signal_id=stored.signal_id)
    out: dict[str, Any] = success_response(data.model_dump())
    if detection:
        out["data"]["detection"] = detection.model_dump(mode="json")
    return out


@app.post("/api/v1/signals/ingest")
def ingest_signal(signal: SignalIngestRequest, score: bool = True):
    """CyberShield-aligned signal ingest (A internal)."""
    return _ingest_signal(signal, score=score)


@app.post("/api/v1/events/ingest")
def ingest_event_legacy(event: FlowEventIn, score: bool = True):
    """Legacy Day 2 path — wraps FlowEventIn → SignalIngestRequest."""
    return _ingest_signal(event.to_signal_request(), score=score)


@app.post("/api/v1/predict")
def predict(body: PredictRequest):
    """
    Guide for A §8 — ordered feature vector → attack + confidence.
    Response uses CyberShield success envelope.
    """
    try:
        result = predict_features_list(body.features)
        return success_response(result.model_dump())
    except ModelNotReadyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/signals")
def list_signals(limit: int = 20):
    items = [
        {
            "signal_id": s.signal_id,
            "received_at": s.received_at.isoformat(),
            "asset_id": s.payload.asset_id,
            "source_file": s.payload.source_file,
            "row_index": s.payload.row_index,
            "ground_truth_label": s.payload.ground_truth_label,
            "detection": s.detection.model_dump(mode="json") if s.detection else None,
        }
        for s in signal_queue.list_recent(limit=limit)
    ]
    return success_response({"items": items, "total": len(items), "limit": limit, "offset": 0})


@app.get("/api/v1/signals/{signal_id}/detection", response_model=None)
def get_signal_detection(signal_id: str):
    stored = signal_queue.get(signal_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="signal not found")
    if stored.detection is None:
        raise HTTPException(status_code=404, detail="no detection for signal")
    return success_response(stored.detection.model_dump(mode="json"))


@app.get("/api/v1/events/{event_id}/anomaly")
def preview_anomaly_legacy(event_id: str):
    """Legacy Day 3 baseline preview."""
    stored = signal_queue.get(event_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="event not found")
    asset_id = stored.payload.asset_id or derive_entity_id(stored.payload.features)
    profiles = load_baseline_profiles()
    score = z_score_anomaly(asset_id, stored.payload.features, profiles)
    return success_response(
        {
            "signal_id": event_id,
            "asset_id": asset_id,
            "anomaly_score": score,
            "has_baseline": asset_id in profiles,
            "ground_truth_label": stored.payload.ground_truth_label,
        }
    )


@app.post("/api/v1/baseline/build")
def build_baseline(scenario: str | None = None):
    profiles, manifest = build_baseline_profiles(scenario)
    save_baseline(profiles, manifest)
    return success_response(
        {
            "status": "built",
            "entity_count": manifest.entity_count,
            "rows_used": manifest.baseline_sources[0]["rows_used"],
            "scenario": manifest.primary_scenario,
        }
    )


@app.get("/api/v1/baseline/manifest")
def baseline_manifest():
    manifest = load_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="baseline not built")
    return success_response(manifest.model_dump(mode="json"))


@app.get("/api/v1/baseline/{entity_id}")
def get_entity_baseline(entity_id: str):
    profiles = load_baseline_profiles()
    profile = profiles.get(entity_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="entity not in baseline")
    return success_response(profile.model_dump())


def run() -> None:
    import uvicorn

    uvicorn.run(
        "ingestion_detection.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
