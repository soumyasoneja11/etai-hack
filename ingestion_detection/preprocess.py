"""
CICIDS2017 cleaning, merging, feature matrix, and train/test split.

Run: python -m ingestion_detection.preprocess
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from ingestion_detection.features import DATA_DIR, LABEL_COL, load_flow_csv, sanitize_value

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
MODELS_DIR = PROJECT_ROOT / "ingestion_detection" / "models"

CSV_FILES = [
    "Wednesday-workingHours.pcap_ISCX.csv",
    "Friday-WorkingHours-Morning.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
]

RANDOM_STATE = 42
TEST_SIZE = 0.2


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip()
    before = len(df)
    df = df.drop_duplicates()
    dup_removed = before - len(df)

    numeric_cols = [c for c in df.columns if c != LABEL_COL]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df[numeric_cols] = df[numeric_cols].replace([np.inf, -np.inf], np.nan)
    df[numeric_cols] = df[numeric_cols].fillna(0.0)

    return df


def load_and_merge() -> pd.DataFrame:
    frames = []
    for name in CSV_FILES:
        path = DATA_DIR / name
        raw = load_flow_csv(path)
        cleaned = clean_dataframe(raw)
        cleaned["_source_file"] = name
        frames.append(cleaned)
    merged = pd.concat(frames, ignore_index=True)
    return merged


def encode_labels(series: pd.Series) -> tuple[pd.Series, dict[str, int]]:
    labels = series.astype(str).str.strip()
    classes = sorted(labels.unique())
    mapping = {label: idx for idx, label in enumerate(classes)}
    encoded = labels.map(mapping)
    return encoded, mapping


def preprocess() -> dict:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    merged = load_and_merge()
    feature_cols = [c for c in merged.columns if c not in (LABEL_COL, "_source_file")]
    feature_order_path = MODELS_DIR / "feature_order.json"
    feature_order_path.write_text(json.dumps(feature_cols, indent=2), encoding="utf-8")

    y_raw = merged[LABEL_COL]
    y, label_mapping = encode_labels(y_raw)
    inv_labels = {v: k for k, v in label_mapping.items()}
    label_map_path = MODELS_DIR / "label_mapping.json"
    label_map_path.write_text(
        json.dumps({"label_to_id": label_mapping, "id_to_label": inv_labels}, indent=2),
        encoding="utf-8",
    )

    X = merged[feature_cols].astype(np.float32)
    stratify = y if y.nunique() > 1 else None

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X,
        y,
        merged.index,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=stratify,
    )

    train_meta = merged.loc[idx_train, ["_source_file", LABEL_COL]].copy()
    test_meta = merged.loc[idx_test, ["_source_file", LABEL_COL]].copy()

    X_train.to_parquet(PROCESSED_DIR / "X_train.parquet")
    X_test.to_parquet(PROCESSED_DIR / "X_test.parquet")
    y_train.to_frame("label_id").to_parquet(PROCESSED_DIR / "y_train.parquet")
    y_test.to_frame("label_id").to_parquet(PROCESSED_DIR / "y_test.parquet")
    train_meta.to_parquet(PROCESSED_DIR / "train_meta.parquet")
    test_meta.to_parquet(PROCESSED_DIR / "test_meta.parquet")

    stats = {
        "total_rows": len(merged),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "feature_count": len(feature_cols),
        "label_counts": y_raw.value_counts().to_dict(),
        "label_mapping": label_mapping,
    }
    stats_path = PROCESSED_DIR / "preprocess_stats.json"
    stats_path.write_text(json.dumps(stats, indent=2), encoding="utf-8")

    return stats


def main() -> None:
    stats = preprocess()
    print("Preprocessing complete")
    print(f"  total rows: {stats['total_rows']:,}")
    print(f"  train: {stats['train_rows']:,}  test: {stats['test_rows']:,}")
    print(f"  features: {stats['feature_count']}")
    print(f"  labels: {list(stats['label_mapping'].keys())}")


if __name__ == "__main__":
    main()
