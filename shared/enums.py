"""CyberShield NIC enum values — source: docs/CyberShield_NIC_API_Schema.xlsx"""

from __future__ import annotations

from typing import Literal

Severity = Literal["low", "medium", "high", "critical"]
AnomalyStatus = Literal["new", "investigating", "acknowledged", "contained", "false_positive"]
ActionStatus = Literal["pending", "approved", "escalated", "rejected", "executed", "failed"]
ActionType = Literal["isolate_endpoint", "revoke_credential", "block_ip", "snapshot_vm"]
# Canonical MITRE ATT&CK Enterprise tactics in snake_case. This is the single
# source of truth for the tactic vocabulary; `mitre_tactic` is always persisted
# in this form (see normalize_tactic + correlate.py). "unknown" is emitted for
# unclassified detections (T0000 fallback). Keep frontend/src/types/api.ts
# MitreTactic in sync (enforced by tests/test_tactic_casing.py).
MitreTactic = Literal[
    "reconnaissance",
    "resource_development",
    "initial_access",
    "execution",
    "persistence",
    "privilege_escalation",
    "defense_evasion",
    "credential_access",
    "discovery",
    "lateral_movement",
    "collection",
    "command_and_control",
    "exfiltration",
    "impact",
    "unknown",
]


def normalize_tactic(value: str | None) -> str:
    """Normalize any tactic spelling to canonical snake_case.

    Accepts Title Case (as stored in label_to_mitre.json, e.g. "Command and
    Control", "Discovery") or already-normalized values and returns the
    snake_case form used everywhere in the API/DB/frontend.
    """
    if not value:
        return "unknown"
    return value.strip().lower().replace(" ", "_")
DecisionLevel = Literal["auto_execute", "recommend", "alert_only", "monitor"]
SOARStatus = Literal["pending", "executed", "failed", "simulated"]
AuditActionType = Literal[
    "isolate_endpoint",
    "block_ip",
    "revoke_credential",
    "narrative_generated",
    "decision_computed",
    "human_approved",
    "human_rejected",
]

# CICIDS2017 label → display title for anomalies
ATTACK_TITLES: dict[str, str] = {
    "BENIGN": "Benign Traffic",
    "PortScan": "Port Scan Activity",
    "DDoS": "Distributed Denial of Service",
    "Bot": "Botnet Activity",
    "DoS Hulk": "DoS Hulk Attack",
    "DoS GoldenEye": "DoS GoldenEye Attack",
    "DoS slowloris": "DoS Slowloris Attack",
    "DoS Slowhttptest": "DoS SlowHTTPTest Attack",
    "Heartbleed": "Heartbleed Exploit Attempt",
}


def severity_from_confidence(confidence: float, attack: str) -> Severity:
    if attack == "BENIGN":
        return "low"
    if confidence >= 90:
        return "critical"
    if confidence >= 75:
        return "high"
    if confidence >= 50:
        return "medium"
    return "low"
