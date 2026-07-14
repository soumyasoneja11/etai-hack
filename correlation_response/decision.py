"""Decision engine — confidence × blast radius → recommended response action.

Uses a simple, explainable matrix that judges can understand:

| Confidence  | Blast Radius | Decision              |
|:-----------:|:------------:|:----------------------|
| ≥ 90%       | Low (≤ 3)    | auto_execute          |
| ≥ 90%       | High (> 3)   | recommend (human)     |
| 75–89%      | Any          | recommend (human)     |
| 50–74%      | Any          | alert_only            |
| < 50%       | Any          | monitor               |
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from shared.schemas import DecisionResult

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent / "data"

# Pre-built mapping from orchestration.blast_radius string → numeric estimate
_BLAST_RADIUS_ESTIMATES: dict[str, int] = {
    "Isolated Network Segment": 1,
    "Web Application Server": 2,
    "Local Internal Endpoint": 3,
    "Core Host / Database Layer": 5,
    "Data Center / Multi-State Infrastructure": 10,
}

# Attack type → default SOAR action mapping
_ACTION_MAP: dict[str, str] = {
    "PortScan": "block_ip",
    "DDoS": "block_ip",
    "DoS Hulk": "block_ip",
    "DoS GoldenEye": "block_ip",
    "DoS Slowhttptest": "block_ip",
    "DoS slowloris": "block_ip",
    "Heartbleed": "isolate_endpoint",
    "Bot": "isolate_endpoint",
}


def _load_label_map() -> dict[str, Any]:
    """Load label_to_mitre.json for orchestration metadata."""
    path = _DATA_DIR / "label_to_mitre.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_blast_radius_from_graph(technique_id: str) -> int | None:
    """Query Neo4j for count of assets connected to a technique.

    Returns None if Neo4j is unavailable or not configured.
    """
    try:
        from correlation_response.config import settings

        if not settings.neo4j_enabled:
            return None

        # Verify neo4j package is actually installed
        try:
            import neo4j  # noqa: F401
        except ImportError:
            return None

        from correlation_response.graph.neo4j_loader import count_connected_assets
        return count_connected_assets(technique_id)
    except Exception as exc:
        logger.debug("Neo4j blast radius query failed: %s", exc)
        return None


def get_blast_radius_static(attack: str) -> int:
    """Fallback blast radius from label_to_mitre.json orchestration data."""
    try:
        label_map = _load_label_map()
        mapping = label_map.get(attack, {})
        orch = mapping.get("orchestration", {})
        blast_str = orch.get("blast_radius", "")
        return _BLAST_RADIUS_ESTIMATES.get(blast_str, 1)
    except Exception:
        return 1


def compute_decision(
    *,
    anomaly_id: str,
    attack: str,
    confidence: float,
    mitre_technique_id: str = "",
    mitre_tactic: str = "",
) -> DecisionResult:
    """Evaluate the decision matrix and return a recommendation.

    1. Try Neo4j for blast radius (real asset count).
    2. Fall back to static estimate from label_to_mitre.json.
    3. Apply decision matrix.
    """
    # --- Blast radius ---
    blast_radius = get_blast_radius_from_graph(mitre_technique_id)
    if blast_radius is None:
        blast_radius = get_blast_radius_static(attack)
        source = "static"
    else:
        source = "neo4j"

    blast_label = f"{blast_radius} connected asset{'s' if blast_radius != 1 else ''} ({source})"

    # --- Playbook ---
    try:
        label_map = _load_label_map()
        playbook_id = label_map.get(attack, {}).get("orchestration", {}).get("playbook_id")
    except Exception:
        playbook_id = None

    # --- Recommended action ---
    recommended_action = _ACTION_MAP.get(attack)

    # --- Decision matrix ---
    if confidence >= 90 and blast_radius <= 3:
        decision = "auto_execute"
        requires_human = False
        reasoning = (
            f"High confidence ({confidence:.1f}%) with low blast radius "
            f"({blast_radius} assets) — safe for automated response."
        )
    elif confidence >= 90 and blast_radius > 3:
        decision = "recommend"
        requires_human = True
        reasoning = (
            f"High confidence ({confidence:.1f}%) but elevated blast radius "
            f"({blast_radius} assets) — recommend human approval before execution."
        )
    elif confidence >= 75:
        decision = "recommend"
        requires_human = True
        reasoning = (
            f"Moderate-high confidence ({confidence:.1f}%) — recommend human review. "
            f"Blast radius: {blast_radius} assets."
        )
    elif confidence >= 50:
        decision = "alert_only"
        requires_human = True
        reasoning = (
            f"Moderate confidence ({confidence:.1f}%) — alert generated, no automatic action. "
            f"Analyst review recommended."
        )
        recommended_action = None
    else:
        decision = "monitor"
        requires_human = False
        reasoning = (
            f"Low confidence ({confidence:.1f}%) — monitoring only, no action needed."
        )
        recommended_action = None

    return DecisionResult(
        anomaly_id=anomaly_id,
        recommended_action=recommended_action,
        decision=decision,
        confidence=confidence,
        blast_radius=blast_radius,
        blast_radius_label=blast_label,
        requires_human_approval=requires_human,
        reasoning=reasoning,
        playbook_id=playbook_id,
    )
