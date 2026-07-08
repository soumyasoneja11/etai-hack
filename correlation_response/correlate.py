"""Core correlation logic — map CICIDS labels → MITRE ATT&CK attributions."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent / "data"
_LABEL_MAP: dict[str, dict[str, Any]] | None = None
_TECHNIQUES: list[dict[str, Any]] | None = None


def _load_label_map() -> dict[str, dict[str, Any]]:
    global _LABEL_MAP
    if _LABEL_MAP is None:
        path = _DATA_DIR / "label_to_mitre.json"
        with open(path, encoding="utf-8") as f:
            _LABEL_MAP = json.load(f)
        logger.info("Loaded %d label→MITRE mappings from %s", len(_LABEL_MAP), path.name)
    return _LABEL_MAP


def _load_techniques() -> list[dict[str, Any]]:
    global _TECHNIQUES
    if _TECHNIQUES is None:
        path = _DATA_DIR / "attack_techniques.json"
        with open(path, encoding="utf-8") as f:
            _TECHNIQUES = json.load(f)
        logger.info("Loaded %d attack techniques from %s", len(_TECHNIQUES), path.name)
    return _TECHNIQUES


def get_techniques() -> list[dict[str, Any]]:
    """Return all loaded MITRE techniques."""
    return _load_techniques()


def correlate_detection(
    *,
    attack: str,
    confidence: float,
) -> dict[str, Any]:
    """
    Map a CICIDS attack label to MITRE ATT&CK attribution.

    Returns dict with:
      mitre_technique_id, mitre_tactic, technique_name,
      matched_campaign, confidence
    """
    label_map = _load_label_map()
    mapping = label_map.get(attack)

    if mapping is None:
        # Fallback for unknown labels — mark as unclassified
        logger.warning("No MITRE mapping for label '%s', returning unclassified", attack)
        return {
            "mitre_technique_id": "T0000",
            "mitre_tactic": "unknown",
            "technique_name": "Unclassified",
            "matched_campaign": f"CICIDS2017-{attack}",
            "confidence": confidence,
        }

    return {
        "mitre_technique_id": mapping["mitre_id"],
        "mitre_tactic": mapping["tactic"],
        "technique_name": mapping["technique"],
        "matched_campaign": f"CICIDS2017-{attack}",
        "confidence": confidence,
    }
