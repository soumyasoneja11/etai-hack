"""P1 regression: MITRE tactic casing is consistent across the stack.

Every tactic stored in label_to_mitre.json (Title Case) must, after
normalization, be a member of both the Python ``MitreTactic`` enum and the
frontend ``MitreTactic`` type union — otherwise the FE union never matches
persisted data.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import get_args

from shared.enums import MitreTactic, normalize_tactic

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LABEL_MAP_PATH = PROJECT_ROOT / "correlation_response" / "data" / "label_to_mitre.json"
FE_TYPES_PATH = PROJECT_ROOT / "frontend" / "src" / "types" / "api.ts"


def _python_tactics() -> set[str]:
    return set(get_args(MitreTactic))


def _frontend_tactics() -> set[str]:
    text = FE_TYPES_PATH.read_text(encoding="utf-8")
    match = re.search(r"export type MitreTactic\s*=\s*(.+?);", text, re.DOTALL)
    assert match, "MitreTactic union not found in frontend/src/types/api.ts"
    return set(re.findall(r'"([a-z_]+)"', match.group(1)))


def _label_map_tactics() -> set[str]:
    data = json.loads(LABEL_MAP_PATH.read_text(encoding="utf-8"))
    return {normalize_tactic(entry["tactic"]) for entry in data.values()}


def test_normalize_tactic_examples():
    assert normalize_tactic("Discovery") == "discovery"
    assert normalize_tactic("Impact") == "impact"
    assert normalize_tactic("Initial Access") == "initial_access"
    assert normalize_tactic("Command and Control") == "command_and_control"
    assert normalize_tactic("") == "unknown"
    assert normalize_tactic(None) == "unknown"


def test_python_and_frontend_unions_match():
    assert _python_tactics() == _frontend_tactics()


def test_every_label_map_tactic_is_in_the_enum():
    label_tactics = _label_map_tactics()
    assert label_tactics, "label_to_mitre.json had no tactics"
    missing_py = label_tactics - _python_tactics()
    assert not missing_py, f"tactics missing from shared.enums.MitreTactic: {missing_py}"
    missing_fe = label_tactics - _frontend_tactics()
    assert not missing_fe, f"tactics missing from frontend MitreTactic: {missing_fe}"


def test_correlate_emits_snake_case_tactic_for_known_labels():
    from correlation_response.correlate import _load_label_map, correlate_detection

    py_tactics = _python_tactics()
    for label in _load_label_map():
        result = correlate_detection(attack=label, confidence=99.0)
        tactic = result["mitre_tactic"]
        assert tactic == tactic.lower(), f"{label} -> non-snake_case tactic {tactic!r}"
        assert tactic in py_tactics, f"{label} -> unknown tactic {tactic!r}"
