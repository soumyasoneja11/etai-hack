"""CICIDS2017 feature metadata and entity helpers."""

from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
LABEL_COL = "Label"

BASELINE_FEATURE_KEYS = [
    "Destination Port",
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Total Length of Fwd Packets",
    "Total Length of Bwd Packets",
    "Flow Bytes/s",
    "Flow Packets/s",
    "SYN Flag Count",
    "ACK Flag Count",
    "Fwd Packets/s",
    "Bwd Packets/s",
    "Init_Win_bytes_forward",
    "Init_Win_bytes_backward",
]

ENTITY_PORT_KEY = "Destination Port"
ENTITY_WIN_KEY = "Init_Win_bytes_forward"


def load_flow_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    df.columns = df.columns.str.strip()
    return df


def sanitize_value(value: object) -> float:
    """Coerce to float; NaN/Inf → 0.0 (matches training preprocess)."""
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return 0.0
    return float(value)


def _coerce_feature_value(value: object, *, field: str) -> float:
    """Strict coerce for inference — rejects non-numeric; NaN/Inf → 0.0."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        raise ValueError(f"Feature '{field}' must be numeric, got bool")
    if isinstance(value, (int, float)):
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return 0.0
        try:
            f = float(text)
        except ValueError as exc:
            raise ValueError(f"Feature '{field}' is not numeric: {value!r}") from exc
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Feature '{field}' is not numeric: {value!r}") from exc
    if math.isnan(f) or math.isinf(f):
        return 0.0
    return f


def validate_feature_list(features: list[float], feature_order: list[str]) -> list[float]:
    """Validate ordered feature vector for /predict."""
    expected = len(feature_order)
    if not features:
        raise ValueError(f"Feature list is empty; expected {expected} values (see feature_order.json)")
    if len(features) != expected:
        raise ValueError(f"Expected {expected} features, got {len(features)}")
    return [_coerce_feature_value(v, field=feature_order[i]) for i, v in enumerate(features)]


def validate_feature_dict(features: dict[str, float], feature_order: list[str]) -> dict[str, float]:
    """
    Validate named feature map for ingest / detect_signal.

    Requires a non-empty dict and every key in feature_order (missing fields fail).
    Extra keys are ignored.
    """
    if not features:
        raise ValueError(
            f"Feature dict is empty; expected {len(feature_order)} named features "
            "(see feature_order.json)"
        )
    missing = [name for name in feature_order if name not in features]
    if missing:
        preview = ", ".join(missing[:5])
        more = f" (+{len(missing) - 5} more)" if len(missing) > 5 else ""
        raise ValueError(f"Missing {len(missing)} required feature(s): {preview}{more}")
    return {name: _coerce_feature_value(features[name], field=name) for name in feature_order}


def row_to_features(row: pd.Series, feature_columns: list[str]) -> dict[str, float]:
    """Build a complete feature dict; missing columns → 0.0."""
    return {
        col: sanitize_value(row[col]) if col in row.index else 0.0
        for col in feature_columns
    }


def derive_entity_id(features: dict[str, float]) -> str:
    """
    Surrogate entity key — CICIDS2017 ISCX CSVs do not ship source/dest IP.

    Uses destination port + forward init window as a weak host/service fingerprint.
    B can remap entity_id → asset node in Neo4j later.
    """
    port = int(features.get(ENTITY_PORT_KEY, 0))
    win = int(features.get(ENTITY_WIN_KEY, 0))
    return f"dst-{port}-win-{win}"


def feature_columns_from_df(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c != LABEL_COL]
