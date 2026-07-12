"""Core correlation logic — map CICIDS labels → MITRE ATT&CK attributions."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent / "data"
_THREAT_INTEL_DIR = Path(__file__).resolve().parent.parent / "data" / "threat_intel"
_LABEL_MAP: dict[str, dict[str, Any]] | None = None
_TECHNIQUES: list[dict[str, Any]] | None = None
_CORPUS: list[dict[str, Any]] | None = None
_CORPUS_INDEX: dict[str, list[dict[str, Any]]] | None = None


def _normalize_attack_label(label: str) -> str:
    return label.strip().casefold()


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


def _load_corpus() -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """Load the CVE/CERT-In threat intel corpus and build a CICIDS-label index."""
    global _CORPUS, _CORPUS_INDEX
    if _CORPUS is None:
        path = _THREAT_INTEL_DIR / "corpus.json"
        with open(path, encoding="utf-8") as f:
            _CORPUS = json.load(f)

        # Build index: cicids_label → list of matching docs
        _CORPUS_INDEX = {}
        for doc in _CORPUS:
            label = doc.get("attack_mapping", {}).get("cicids_label", "")
            if label:
                _CORPUS_INDEX.setdefault(_normalize_attack_label(label), []).append(doc)

        logger.info(
            "Loaded %d threat intel docs (%d attack labels) from %s",
            len(_CORPUS), len(_CORPUS_INDEX), path.name,
        )
    return _CORPUS, _CORPUS_INDEX


def get_techniques() -> list[dict[str, Any]]:
    """Return all loaded MITRE techniques."""
    return _load_techniques()


def get_threat_intel(attack_label: str) -> list[dict[str, Any]]:
    """Return CVE/CERT-In docs matching a CICIDS attack label."""
    _, index = _load_corpus()
    return index.get(_normalize_attack_label(attack_label), [])


def get_threat_intel_bundle(attack_label: str) -> dict[str, Any]:
    """Return threat intel for an attack label, grouped by document type."""
    docs = get_threat_intel(attack_label)
    related_cves = [doc for doc in docs if doc.get("type") == "CVE"]
    cert_in_advisories = [doc for doc in docs if doc.get("type") == "CERT-In"]
    return {
        "attack_label": attack_label,
        "related_cves": related_cves,
        "cert_in_advisories": cert_in_advisories,
        "total": len(docs),
    }


def get_all_threat_intel() -> list[dict[str, Any]]:
    """Return all threat intel docs."""
    corpus, _ = _load_corpus()
    return corpus


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
