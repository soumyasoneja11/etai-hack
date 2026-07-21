"""Structured logging + request-id correlation.

- JSON formatter emits parseable lines carrying the request id;
- the middleware reuses an inbound X-Request-ID (or mints one), echoes it on the
  response, and the same id lands in the response envelope's meta.request_id;
- configure_logging() is idempotent (no duplicate handlers).
"""

from __future__ import annotations

import json
import logging

from fastapi.testclient import TestClient

from shared.logging_config import (
    JsonFormatter,
    configure_logging,
    request_id_var,
)


def test_json_formatter_includes_request_id_and_fields():
    token = request_id_var.set("rid-abc")
    try:
        rec = logging.makeLogRecord(
            {"name": "t", "levelname": "INFO", "msg": "hello %s", "args": ("world",)}
        )
        out = json.loads(JsonFormatter().format(rec))
    finally:
        request_id_var.reset(token)

    assert out["message"] == "hello world"
    assert out["level"] == "INFO"
    assert out["logger"] == "t"
    assert out["request_id"] == "rid-abc"
    assert "timestamp" in out


def test_configure_logging_is_idempotent():
    configure_logging()
    configure_logging()
    assert len(logging.getLogger().handlers) == 1


def test_inbound_request_id_is_echoed_and_in_envelope():
    from correlation_response.main import app

    client = TestClient(app)
    resp = client.get("/health", headers={"X-Request-ID": "trace-123"})
    assert resp.status_code == 200
    assert resp.headers.get("X-Request-ID") == "trace-123"
    assert resp.json()["meta"]["request_id"] == "trace-123"


def test_request_id_is_generated_when_absent():
    from correlation_response.main import app

    client = TestClient(app)
    resp = client.get("/health")
    generated = resp.headers.get("X-Request-ID")
    assert generated
    # The envelope's correlation id matches the response header.
    assert resp.json()["meta"]["request_id"] == generated
