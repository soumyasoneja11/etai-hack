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
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return 0.0
    return float(value)


def row_to_features(row: pd.Series, feature_columns: list[str]) -> dict[str, float]:
    return {col: sanitize_value(row[col]) for col in feature_columns if col in row.index}


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
