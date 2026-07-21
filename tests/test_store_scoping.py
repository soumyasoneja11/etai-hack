"""Prompt 5 item 3 (+ Prompt 1 item 1): store reads are user-scoped and genuine
query failures propagate as errors, not empty-success.

Complements test_multitenant_isolation.py (anomalies) and
test_read_failure_surfacing.py by covering attribution + signal scoping.
"""

from __future__ import annotations

import pytest

from correlation_response.supabase_store import SupabaseAnomalyStore
from ingestion_detection.supabase_store import SupabaseSignalStore
from shared.errors import StoreUnavailableError
from shared.schemas import SignalIngestRequest

USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class _FailQuery:
    def __getattr__(self, _n):
        return lambda *_a, **_k: self

    def execute(self):
        raise RuntimeError("connection refused")


class FailingSupabase:
    def table(self, _n):
        return _FailQuery()


def _detail(asset_id: str) -> dict:
    return {
        "title": "Port Scan",
        "severity": "high",
        "status": "new",
        "asset_id": asset_id,
        "detected_at": "2026-01-01T00:00:00Z",
        "score": 0.9,
        "baseline_deviation": 0.5,
        "reason": "scan",
    }


def _attr(technique: str) -> dict:
    return {
        "mitre_technique_id": technique,
        "mitre_tactic": "discovery",
        "technique_name": "Network Service Scanning",
        "matched_campaign": None,
        "confidence": 0.9,
    }


# ---- attributions -------------------------------------------------------------

def test_list_attributions_is_tenant_scoped(user_client_factory):
    store = SupabaseAnomalyStore()
    ca, cb = user_client_factory(USER_A), user_client_factory(USER_B)

    store.put("an-A", None, _detail("asset-A"), _attr("T1046"), user_id=USER_A, client=ca)
    store.put("an-B", None, _detail("asset-B"), _attr("T1595"), user_id=USER_B, client=cb)

    a_techs = {a["mitre_technique_id"] for a in store.list_attributions(user_id=USER_A, client=ca)}
    b_techs = {a["mitre_technique_id"] for a in store.list_attributions(user_id=USER_B, client=cb)}

    assert a_techs == {"T1046"}
    assert b_techs == {"T1595"}  # B never sees A's attribution


def test_list_attributions_raises_on_query_failure():
    with pytest.raises(StoreUnavailableError):
        SupabaseAnomalyStore().list_attributions(user_id=USER_A, client=FailingSupabase())


# ---- signals ------------------------------------------------------------------

def _signal(asset_id: str) -> SignalIngestRequest:
    return SignalIngestRequest(
        asset_id=asset_id,
        source_file="test.csv",
        row_index=1,
        features={"f": 1.0},
    )


def test_signal_list_recent_and_get_are_tenant_scoped(user_client_factory):
    store = SupabaseSignalStore()
    ca, cb = user_client_factory(USER_A), user_client_factory(USER_B)

    a = store.enqueue(_signal("asset-A"), user_id=USER_A, client=ca)
    store.enqueue(_signal("asset-B"), user_id=USER_B, client=cb)

    b_assets = {s["asset_id"] for s in store.list_recent(user_id=USER_B, client=cb)}
    assert b_assets == {"asset-B"}  # A's signal must not leak into B's list

    # B cannot fetch A's signal by id.
    assert store.get(a["signal_id"], user_id=USER_B, client=cb) is None
    # A can.
    assert store.get(a["signal_id"], user_id=USER_A, client=ca) is not None


def test_signal_reads_raise_on_query_failure():
    store = SupabaseSignalStore()
    fc = FailingSupabase()
    with pytest.raises(StoreUnavailableError):
        store.list_recent(user_id=USER_A, client=fc)
    with pytest.raises(StoreUnavailableError):
        store.get("s1", user_id=USER_A, client=fc)
