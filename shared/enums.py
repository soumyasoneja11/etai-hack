"""CyberShield NIC enum values — source: docs/CyberShield_NIC_API_Schema.xlsx"""

from __future__ import annotations

from typing import Literal

Severity = Literal["low", "medium", "high", "critical"]
AnomalyStatus = Literal["new", "investigating", "acknowledged", "contained", "false_positive"]
ActionStatus = Literal["pending", "approved", "escalated", "rejected", "executed", "failed"]
ActionType = Literal["isolate_endpoint", "revoke_credential", "block_ip", "snapshot_vm"]
MitreTactic = Literal[
    "reconnaissance",
    "initial_access",
    "execution",
    "persistence",
    "privilege_escalation",
    "lateral_movement",
    "exfiltration",
    "impact",
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
