"""A's ingestion + detection FastAPI service (port 8000) — CyberShield NIC aligned."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
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
from ingestion_detection.supabase_store import signal_store
from shared.auth import require_admin, require_auth
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
from shared.supabase_client import get_supabase_admin

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


# ---------------------------------------------------------------------------
# Health (public — no auth)
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return success_response({"status": "ok", "service": "ingestion-detection"})


# ---------------------------------------------------------------------------
# Auth endpoints (public — no auth required)
# ---------------------------------------------------------------------------

@app.post("/api/v1/auth/signup")
def signup(request_body: dict):
    """Create a new Supabase user account."""
    email = request_body.get("email")
    password = request_body.get("password")
    if not email or not password:
        raise HTTPException(status_code=422, detail="email and password required")

    try:
        client = get_supabase_admin()
        result = client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"role": "user"},
        })
        return success_response({
            "user_id": result.user.id,
            "email": result.user.email,
            "role": "user",
            "message": "Account created successfully",
        })
    except Exception as exc:
        logger.error("Signup failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/auth/login")
def login(request_body: dict):
    """Sign in with email + password, returns JWT tokens."""
    email = request_body.get("email")
    password = request_body.get("password")
    if not email or not password:
        raise HTTPException(status_code=422, detail="email and password required")

    try:
        from shared.supabase_client import get_supabase
        client = get_supabase()
        result = client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
        return success_response({
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "expires_in": result.session.expires_in,
            "token_type": "Bearer",
            "user": {
                "id": result.user.id,
                "email": result.user.email,
                "role": (result.user.user_metadata or {}).get("role", "user"),
            },
        })
    except Exception as exc:
        logger.error("Login failed: %s", exc)
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.post("/api/v1/auth/refresh")
def refresh_token(request_body: dict):
    """Refresh an access token using a refresh_token."""
    refresh = request_body.get("refresh_token")
    if not refresh:
        raise HTTPException(status_code=422, detail="refresh_token required")

    try:
        from shared.supabase_client import get_supabase
        client = get_supabase()
        result = client.auth.refresh_session(refresh)
        return success_response({
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "expires_in": result.session.expires_in,
            "token_type": "Bearer",
        })
    except Exception as exc:
        logger.error("Token refresh failed: %s", exc)
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.post("/api/v1/auth/make-admin")
def make_admin(request_body: dict, _admin: dict = Depends(require_admin)):
    """Promote a user to admin. Requires existing admin auth."""
    user_id = request_body.get("user_id")
    if not user_id:
        raise HTTPException(status_code=422, detail="user_id required")

    try:
        client = get_supabase_admin()
        client.auth.admin.update_user_by_id(
            user_id,
            {"user_metadata": {"role": "admin"}},
        )
        return success_response({"user_id": user_id, "role": "admin"})
    except Exception as exc:
        logger.error("Make admin failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Signal ingest (authenticated)
# ---------------------------------------------------------------------------

def _ingest_signal(
    signal: SignalIngestRequest,
    *,
    score: bool,
    user_payload: dict[str, Any],
) -> dict[str, Any]:
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

    # Persist to Supabase
    user_id = user_payload.get("sub")
    stored = signal_store.enqueue(normalized, detection=detection, user_id=user_id)

    if settings.log_requests:
        logger.info(
            "ingest signal_id=%s asset=%s row=%s attack=%s",
            stored["signal_id"],
            asset_id,
            signal.row_index,
            detection.attack if detection else "n/a",
        )

    data = SignalIngestData(signal_id=stored["signal_id"])
    out: dict[str, Any] = success_response(data.model_dump())
    if detection:
        out["data"]["detection"] = detection.model_dump(mode="json")
    return out


@app.post("/api/v1/signals/ingest")
def ingest_signal(
    signal: SignalIngestRequest,
    score: bool = True,
    user: dict = Depends(require_auth),
):
    """CyberShield-aligned signal ingest (A internal)."""
    return _ingest_signal(signal, score=score, user_payload=user)


@app.post("/api/v1/events/ingest")
def ingest_event_legacy(
    event: FlowEventIn,
    score: bool = True,
    user: dict = Depends(require_auth),
):
    """Legacy Day 2 path — wraps FlowEventIn → SignalIngestRequest."""
    return _ingest_signal(event.to_signal_request(), score=score, user_payload=user)


@app.post("/api/v1/predict")
def predict(body: PredictRequest, _user: dict = Depends(require_auth)):
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
def list_signals(limit: int = 20, _user: dict = Depends(require_auth)):
    items = signal_store.list_recent(limit=limit)
    return success_response({"items": items, "total": len(items), "limit": limit, "offset": 0})


@app.get("/api/v1/signals/{signal_id}/detection", response_model=None)
def get_signal_detection(signal_id: str, _user: dict = Depends(require_auth)):
    stored = signal_store.get(signal_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="signal not found")
    detection = stored.get("detection")
    if detection is None:
        raise HTTPException(status_code=404, detail="no detection for signal")
    return success_response(detection)


@app.get("/api/v1/events/{event_id}/anomaly")
def preview_anomaly_legacy(event_id: str, _user: dict = Depends(require_auth)):
    """Legacy Day 3 baseline preview."""
    stored = signal_store.get(event_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="event not found")
    asset_id = stored.get("asset_id") or derive_entity_id(stored.get("features", {}))
    profiles = load_baseline_profiles()
    score = z_score_anomaly(asset_id, stored.get("features", {}), profiles)
    return success_response(
        {
            "signal_id": event_id,
            "asset_id": asset_id,
            "anomaly_score": score,
            "has_baseline": asset_id in profiles,
            "ground_truth_label": stored.get("ground_truth_label"),
        }
    )


@app.post("/api/v1/baseline/build")
def build_baseline(
    scenario: str | None = None,
    _user: dict = Depends(require_admin),
):
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
def baseline_manifest(_user: dict = Depends(require_auth)):
    manifest = load_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="baseline not built")
    return success_response(manifest.model_dump(mode="json"))


@app.get("/api/v1/baseline/{entity_id}")
def get_entity_baseline(entity_id: str, _user: dict = Depends(require_auth)):
    profiles = load_baseline_profiles()
    profile = profiles.get(entity_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="entity not in baseline")
    return success_response(profile.model_dump())


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

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
