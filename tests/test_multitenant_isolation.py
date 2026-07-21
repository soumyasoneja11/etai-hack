"""P0-1 regression: authenticated users must not read other tenants' data.

Scenario: user A creates an anomaly, user B lists anomalies — B's list must not
contain A's row. The fixed data-access path (user-scoped client + explicit
``user_id`` filter) isolates tenants; the old service-role path leaked
everything, which this test also demonstrates so a regression is caught.
"""

from __future__ import annotations

import pytest

from correlation_response.supabase_store import SupabaseAnomalyStore

USER_A = "11111111-1111-1111-1111-111111111111"
USER_B = "22222222-2222-2222-2222-222222222222"


def _detail(asset_id: str, detected_at: str) -> dict:
    return {
        "title": "Port Scan",
        "description": "d",
        "severity": "high",
        "status": "new",
        "asset_id": asset_id,
        "detected_at": detected_at,
        "score": 0.9,
        "baseline_deviation": 0.5,
        "reason": "scan",
        "raw_signal_ref": None,
    }


def _attribution() -> dict:
    return {
        "mitre_technique_id": "T1046",
        "mitre_tactic": "discovery",
        "technique_name": "Network Service Scanning",
        "matched_campaign": None,
        "confidence": 0.9,
    }


@pytest.fixture
def store() -> SupabaseAnomalyStore:
    return SupabaseAnomalyStore()


def _seed_two_tenants(store, user_client_factory):
    client_a = user_client_factory(USER_A)
    client_b = user_client_factory(USER_B)

    store.put(
        "anomaly-A",
        list_item=None,
        detail=_detail("asset-A", "2026-01-01T00:00:00Z"),
        attribution=_attribution(),
        user_id=USER_A,
        client=client_a,
    )
    store.put(
        "anomaly-B",
        list_item=None,
        detail=_detail("asset-B", "2026-01-02T00:00:00Z"),
        attribution=_attribution(),
        user_id=USER_B,
        client=client_b,
    )
    return client_a, client_b


def test_list_items_is_tenant_scoped(store, user_client_factory):
    _client_a, client_b = _seed_two_tenants(store, user_client_factory)

    # B lists anomalies exactly as the handler does: user-scoped client + filter.
    b_items = store.list_items(user_id=USER_B, client=client_b)
    ids = {item["anomaly_id"] for item in b_items}

    assert ids == {"anomaly-B"}
    assert "anomaly-A" not in ids  # A's row must never appear in B's list


def test_get_is_tenant_scoped(store, user_client_factory):
    client_a, client_b = _seed_two_tenants(store, user_client_factory)

    # A can read its own anomaly...
    assert store.get("anomaly-A", user_id=USER_A, client=client_a) is not None
    # ...but B cannot read A's anomaly by id.
    assert store.get("anomaly-A", user_id=USER_B, client=client_b) is None


def test_count_is_tenant_scoped(store, user_client_factory):
    client_a, client_b = _seed_two_tenants(store, user_client_factory)

    assert store.count(user_id=USER_A, client=client_a) == 1
    assert store.count(user_id=USER_B, client=client_b) == 1


def test_service_role_path_leaks_without_fix(store, user_client_factory, admin_client):
    """Documents the vulnerability the fix closes.

    The pre-fix code used the service-role client with no ``user_id`` filter,
    which bypasses RLS and returns *every* tenant's rows. If a future change
    reverts the handlers to this path, tenant isolation is broken.
    """
    _seed_two_tenants(store, user_client_factory)

    leaked = store.list_items(client=admin_client)  # no user_id, service-role
    leaked_ids = {item["anomaly_id"] for item in leaked}

    assert leaked_ids == {"anomaly-A", "anomaly-B"}
