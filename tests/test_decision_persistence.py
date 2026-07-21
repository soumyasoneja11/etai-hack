"""Prompt 3/4 coverage: the A->B correlation path.

Using the known PortScan detection fixture (what service A forwards to B), the
/correlate endpoint must:
  * emit the MITRE tactic in canonical snake_case ("discovery", not "Discovery");
  * persist the decision computed at correlate-time so it survives a reload
    (previously only /decide computed a decision and it was never stored).

The persistence assertion FAILS against the pre-fix code (put() dropped the
decision) and PASSES once the decision is stored on the anomaly.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIXTURE = Path(__file__).parent / "fixtures" / "detection_result_portscan.json"
USER = "33333333-3333-3333-3333-333333333333"

_VALID_DECISIONS = {"auto_execute", "recommend", "alert_only", "monitor"}


@pytest.fixture
def portscan_detection() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def scoped_client(db, user_client_factory):
    """A TestClient whose require_scoped is overridden to a single user-scoped
    fake DB shared across requests (so POST /correlate and the follow-up GET hit
    the same rows)."""
    from correlation_response.main import app
    from shared.auth import require_scoped

    client_db = user_client_factory(USER)

    class _Ctx:
        user_id = USER
        email = "analyst@example.com"
        role = "user"
        token = "t"
        db = client_db

    app.dependency_overrides[require_scoped] = lambda: _Ctx()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_scoped, None)


def test_correlate_emits_snake_case_tactic(scoped_client, portscan_detection):
    resp = scoped_client.post("/api/v1/correlate", json=portscan_detection)
    assert resp.status_code == 200, resp.text

    data = resp.json()["data"]
    assert data["mitre_technique_id"] == "T1046"
    # Canonical snake_case (label_to_mitre.json stores Title Case "Discovery").
    assert data["mitre_tactic"] == "discovery"


def test_correlate_time_decision_is_persisted(scoped_client, portscan_detection):
    resp = scoped_client.post("/api/v1/correlate", json=portscan_detection)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]

    # Decision is present in the correlate response...
    assert "decision" in data and data["decision"], "correlate must return a decision"
    resp_decision = data["decision"]["decision"]
    assert resp_decision in _VALID_DECISIONS

    anomaly_id = data["anomaly_id"]

    # ...and it must be PERSISTED on the anomaly (the actual gap being fixed).
    got = scoped_client.get(f"/api/v1/anomalies/{anomaly_id}")
    assert got.status_code == 200, got.text
    stored = got.json()["data"]

    assert stored.get("decision") is not None, (
        "correlate-time decision was not persisted on the anomaly"
    )
    assert stored["decision"]["decision"] == resp_decision
    assert stored["decision"]["confidence"] == pytest.approx(
        portscan_detection["confidence"]
    )


def test_high_confidence_portscan_decision_shape(scoped_client, portscan_detection):
    # confidence 99.5 with a small static blast radius -> matrix yields a
    # concrete, human-explainable recommendation (not "monitor").
    resp = scoped_client.post("/api/v1/correlate", json=portscan_detection)
    decision = resp.json()["data"]["decision"]

    assert decision["decision"] in _VALID_DECISIONS
    assert decision["decision"] != "monitor"  # 99.5% confidence is not "monitor"
    assert "reasoning" in decision and decision["reasoning"]
    assert isinstance(decision["blast_radius"], int)
