"""Prompt 5 item 4: the response envelope must preserve distinct, correct error
codes (401/403/503) and a clean 200 for BOTH services — never collapsing
everything to BAD_REQUEST.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

EXPECTED_MAP = {
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
}


# ---- shared fakes -------------------------------------------------------------

class _FailQuery:
    def __getattr__(self, _n):
        return lambda *_a, **_k: self

    def execute(self):
        raise RuntimeError("connection refused")


class FailingSupabase:
    def table(self, _n):
        return _FailQuery()


class _OkResult:
    data: list = []
    count = 0


class _OkQuery:
    def __getattr__(self, _n):
        return lambda *_a, **_k: self

    def execute(self):
        return _OkResult()


class OkSupabase:
    def table(self, _n):
        return _OkQuery()


def _ctx(dbobj):
    class _Ctx:
        user_id = "44444444-4444-4444-4444-444444444444"
        email = "a@b.c"
        role = "user"
        token = "t"
        db = dbobj

    return _Ctx()


# ---- the shared status->code map is identical & correct on both services ------

def test_both_services_share_the_correct_status_map():
    from correlation_response.main import _STATUS_TO_CODE as b_map
    from ingestion_detection.main import _STATUS_TO_CODE as a_map

    assert a_map == EXPECTED_MAP
    assert b_map == EXPECTED_MAP


# ---- service B (correlation) --------------------------------------------------

def test_b_health_200_success_envelope():
    from correlation_response.main import app

    resp = TestClient(app).get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["error"] is None


def test_b_401_unauthorized_code():
    from correlation_response.main import app

    resp = TestClient(app).get("/api/v1/anomalies")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_b_503_service_unavailable_code():
    from correlation_response.main import app
    from shared.auth import require_scoped

    app.dependency_overrides[require_scoped] = lambda: _ctx(FailingSupabase())
    try:
        resp = TestClient(app, raise_server_exceptions=False).get("/api/v1/anomalies")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    finally:
        app.dependency_overrides.pop(require_scoped, None)


def test_b_200_authenticated_success():
    from correlation_response.main import app
    from shared.auth import require_scoped

    app.dependency_overrides[require_scoped] = lambda: _ctx(OkSupabase())
    try:
        resp = TestClient(app).get("/api/v1/anomalies")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["error"] is None
    finally:
        app.dependency_overrides.pop(require_scoped, None)


# ---- service A (ingestion) ----------------------------------------------------

def test_a_401_unauthorized_code():
    from ingestion_detection.main import app

    resp = TestClient(app).get("/api/v1/signals")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_a_403_forbidden_code():
    from ingestion_detection.main import app

    # Signup is closed by default (no invite token) -> 403 FORBIDDEN. Unique IP +
    # email keep the per-IP/per-email rate limiter from interfering.
    resp = TestClient(app).post(
        "/api/v1/auth/signup",
        json={"email": "envelope-test@example.com", "password": "x"},
        headers={"X-Forwarded-For": "203.0.113.199"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_a_503_service_unavailable_code():
    from ingestion_detection.main import app
    from shared.auth import require_scoped

    app.dependency_overrides[require_scoped] = lambda: _ctx(FailingSupabase())
    try:
        resp = TestClient(app, raise_server_exceptions=False).get("/api/v1/signals")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    finally:
        app.dependency_overrides.pop(require_scoped, None)


def test_a_200_authenticated_success():
    from ingestion_detection.main import app
    from shared.auth import require_scoped

    app.dependency_overrides[require_scoped] = lambda: _ctx(OkSupabase())
    try:
        resp = TestClient(app).get("/api/v1/signals")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["error"] is None
    finally:
        app.dependency_overrides.pop(require_scoped, None)
