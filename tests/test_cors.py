"""P1 regression: CORS is env-driven, credentialed, and rejects unknown origins."""

from __future__ import annotations

import importlib

import pytest


def test_wildcard_is_stripped_with_credentials(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://a.example.com,*")
    import shared.cors as cors

    importlib.reload(cors)
    origins = cors.get_cors_allowed_origins()
    assert "*" not in origins
    assert "https://a.example.com" in origins


def test_default_origins_when_unset(monkeypatch):
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    import shared.cors as cors

    importlib.reload(cors)
    origins = cors.get_cors_allowed_origins()
    assert "http://localhost:3000" in origins


def test_custom_origins_parsed(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://soc.example.com, https://admin.example.com")
    import shared.cors as cors

    importlib.reload(cors)
    origins = cors.get_cors_allowed_origins()
    assert origins == ["https://soc.example.com", "https://admin.example.com"]


def test_correlation_service_rejects_unknown_origin():
    """Preflight from an origin not in the allow-list gets no allow-origin header."""
    main = pytest.importorskip("correlation_response.main")
    from fastapi.testclient import TestClient

    client = TestClient(main.app)

    disallowed = client.options(
        "/api/v1/anomalies",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert disallowed.headers.get("access-control-allow-origin") is None

    allowed = client.options(
        "/api/v1/anomalies",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
