"""P1 regression: missing model is a loud 503, not a silent 200.

- deps acceptance: `import lightgbm, joblib` works.
- /health returns 503 with model_loaded=false when the artifact can't load.
- scored ingest returns 503 (not 200 pass-through) when the model isn't ready.
- an env-gated check (CYBERSHIELD_REQUIRE_MODEL=1) hard-fails if the real
  artifact can't load (mirrors scripts/model_smoke.py as a CI gate).
"""

from __future__ import annotations

import os

import pytest


def test_dependencies_importable():
    import joblib  # noqa: F401
    import lightgbm  # noqa: F401


def test_model_status_shape():
    from ingestion_detection.predict import model_artifacts_status

    status = model_artifacts_status()
    assert set(["model_loaded", "model_path", "model_version", "error"]).issubset(status)
    assert isinstance(status["model_loaded"], bool)


@pytest.fixture
def a_app(monkeypatch):
    main = pytest.importorskip("ingestion_detection.main")
    from fastapi.testclient import TestClient

    return main, TestClient(main.app, raise_server_exceptions=False)


def test_health_503_when_model_missing(a_app, monkeypatch):
    main, client = a_app
    monkeypatch.setattr(
        main,
        "model_artifacts_status",
        lambda: {
            "model_loaded": False,
            "model_path": "/x/model.joblib",
            "model_version": None,
            "error": "model.joblib: not found",
        },
    )
    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["data"]["model_loaded"] is False


def test_health_200_when_model_loaded(a_app, monkeypatch):
    main, client = a_app
    monkeypatch.setattr(
        main,
        "model_artifacts_status",
        lambda: {
            "model_loaded": True,
            "model_path": "/x/model.joblib",
            "model_version": "123-456",
            "feature_count": 40,
            "label_count": 7,
            "error": None,
        },
    )
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["model_loaded"] is True
    assert body["data"]["model_version"] == "123-456"


def test_scored_ingest_503_when_model_not_ready(a_app, monkeypatch):
    main, client = a_app
    from shared.auth import ScopedContext, require_scoped
    from ingestion_detection.predict import ModelNotReadyError

    # Bypass JWT auth for the test.
    def _fake_ctx():
        return ScopedContext({"sub": "u1", "email": "u@x.com"}, "tok")

    main.app.dependency_overrides[require_scoped] = _fake_ctx

    def _raise(**_kwargs):
        raise ModelNotReadyError("model.joblib not found")

    monkeypatch.setattr(main, "detect_signal", _raise)

    try:
        resp = client.post(
            "/api/v1/signals/ingest",
            json={
                "asset_id": "asset-1",
                "source_file": "test.csv",
                "row_index": 0,
                "features": {"f1": 1.0},
            },
        )
    finally:
        main.app.dependency_overrides.pop(require_scoped, None)

    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_real_model_loads_when_required():
    """Hard gate: fail if the model can't load AND enforcement is requested."""
    from ingestion_detection.predict import model_artifacts_status

    if os.getenv("CYBERSHIELD_REQUIRE_MODEL") != "1":
        pytest.skip("set CYBERSHIELD_REQUIRE_MODEL=1 to enforce model presence")

    status = model_artifacts_status()
    assert status["model_loaded"], f"model failed to load: {status.get('error')}"
