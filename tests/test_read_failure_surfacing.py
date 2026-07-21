"""Regression: read failures surface as 503, not a silent empty 200; and the
error envelope preserves the real status code (401/403/503) instead of
collapsing everything to BAD_REQUEST.

Acceptance covered:
  * killing the datastore produces a 503 with a SERVICE_UNAVAILABLE envelope
    (frontend can show "failed to load"), while genuinely-empty tables still
    return [] / None;
  * a 401 reaches the client as a distinguishable UNAUTHORIZED code.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from correlation_response import audit
from correlation_response.supabase_store import anomaly_store
from ingestion_detection.supabase_store import signal_store
from shared.errors import StoreUnavailableError


class _FailingQuery:
    """Every builder verb chains; execute() blows up like a dead connection."""

    def __getattr__(self, _name):
        def _chain(*_a, **_k):
            return self

        return _chain

    def execute(self):
        raise RuntimeError("connection refused")


class FailingSupabase:
    def table(self, _name):
        return _FailingQuery()


# ---------------------------------------------------------------------------
# Store layer: query failure raises; no-rows does not.
# ---------------------------------------------------------------------------

def test_anomaly_reads_raise_on_query_failure():
    fc = FailingSupabase()
    with pytest.raises(StoreUnavailableError):
        anomaly_store.list_items(client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        anomaly_store.list_attributions(client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        anomaly_store.count(client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        anomaly_store.get("abc", client=fc, user_id="u1")


def test_signal_reads_raise_on_query_failure():
    fc = FailingSupabase()
    with pytest.raises(StoreUnavailableError):
        signal_store.list_recent(client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        signal_store.get("s1", client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        signal_store.size(client=fc, user_id="u1")


def test_audit_reads_raise_on_query_failure():
    fc = FailingSupabase()
    with pytest.raises(StoreUnavailableError):
        audit.list_audit_logs(client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        audit.get_audit_trail("a1", client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        audit.list_soar_actions(client=fc, user_id="u1")
    with pytest.raises(StoreUnavailableError):
        audit.get_soar_action("x1", client=fc, user_id="u1")


def test_empty_tables_return_empty_not_error(admin_client):
    # "genuinely no rows" must stay [] / None, never StoreUnavailableError.
    assert anomaly_store.list_items(client=admin_client) == []
    assert anomaly_store.get("missing", client=admin_client) is None
    assert anomaly_store.count(client=admin_client) == 0
    assert signal_store.list_recent(client=admin_client) == []
    assert audit.list_audit_logs(client=admin_client) == []


# ---------------------------------------------------------------------------
# HTTP layer: envelope preserves the real status code.
# ---------------------------------------------------------------------------

def test_unauthorized_is_not_flattened_to_bad_request():
    from correlation_response.main import app

    client = TestClient(app)
    resp = client.get("/api/v1/anomalies")  # no Authorization header
    assert resp.status_code == 401
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHORIZED"


def test_store_failure_returns_503_service_unavailable():
    from correlation_response.main import app
    from shared.auth import require_scoped

    class _Ctx:
        user_id = "u1"
        email = "analyst@example.com"
        role = "user"
        token = "t"
        db = FailingSupabase()

    app.dependency_overrides[require_scoped] = lambda: _Ctx()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/api/v1/anomalies")
        assert resp.status_code == 503
        body = resp.json()
        assert body["success"] is False
        assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    finally:
        app.dependency_overrides.pop(require_scoped, None)
