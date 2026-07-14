"""
Day 7 — Approach A: offline evaluation harness (read-only vs production code).

Scores labeled rows with the same model path as predict.py and writes
accuracy / macro-F1 / confusion artifacts for the deck.

Does NOT modify predict.py, main.py, or train.py.

Run from project root:
    python scripts/eval_harness.py
    python scripts/eval_harness.py --source test
    python scripts/eval_harness.py --scenario portscan
    python scripts/eval_harness.py --scenario all
    python scripts/eval_harness.py --csv path/to/cicids_like.csv --max-rows 5000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ingestion_detection.features import (  # noqa: E402
    LABEL_COL,
    load_flow_csv,
    sanitize_value,
)
from ingestion_detection.predict import (  # noqa: E402
    _load_feature_order,
    _load_id_to_label,
    _load_model,
)
from ingestion_detection.replay.scenarios import SCENARIOS, get_scenario  # noqa: E402
from shared.enums import severity_from_confidence  # noqa: E402

PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "reports" / "metrics"


def score_ml_batch(X: pd.DataFrame, id_to_label: dict[int, str]) -> pd.DataFrame:
    """Batch equivalent of predict.predict_vector (same model + formulas)."""
    model = _load_model()
    pred_ids = model.predict(X).astype(int)
    labels = np.array([id_to_label.get(int(i), "UNKNOWN") for i in pred_ids])

    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)
        confidence = np.max(proba, axis=1) * 100.0
    else:
        confidence = np.full(len(X), 50.0)

    anomaly_score = np.where(
        labels == "BENIGN",
        0.0,
        np.minimum(confidence / 100.0, 1.0),
    )

    return pd.DataFrame(
        {
            "pred_label": labels,
            "confidence": confidence.astype(float),
            "ml_anomaly_score": anomaly_score.astype(float),
        }
    )


def dataframe_to_feature_matrix(df: pd.DataFrame, feature_order: list[str]) -> pd.DataFrame:
    """Align a CICIDS-like frame to feature_order.json (missing → 0, extras ignored)."""
    rows: list[dict[str, float]] = []
    for _, row in df.iterrows():
        rows.append(
            {
                name: sanitize_value(row[name]) if name in row.index else 0.0
                for name in feature_order
            }
        )
    return pd.DataFrame(rows, columns=feature_order)


def load_processed_test() -> tuple[pd.DataFrame, np.ndarray, dict]:
    x_path = PROCESSED_DIR / "X_test.parquet"
    y_path = PROCESSED_DIR / "y_test.parquet"
    if not x_path.exists() or not y_path.exists():
        raise FileNotFoundError(
            "Missing processed test split. Run: python -m ingestion_detection.preprocess"
        )
    X = pd.read_parquet(x_path).reset_index(drop=True)
    y_ids = pd.read_parquet(y_path)["label_id"].to_numpy()
    id_to_label = _load_id_to_label()
    y_true = np.array([id_to_label[int(i)] for i in y_ids])
    meta = {
        "source": "processed_test",
        "path": str(x_path.relative_to(PROJECT_ROOT)),
        "n_rows": int(len(X)),
    }
    return X, y_true, meta


def load_scenario_frame(
    scenario_name: str,
    *,
    phase: str = "attack",
    max_rows: int | None = None,
) -> tuple[pd.DataFrame, np.ndarray, dict]:
    scenario = get_scenario(scenario_name)
    if not scenario.path.exists():
        raise FileNotFoundError(f"Scenario CSV missing: {scenario.path}")

    df = load_flow_csv(scenario.path)
    if LABEL_COL not in df.columns:
        raise ValueError(f"No '{LABEL_COL}' column in {scenario.csv_file}")

    if phase == "attack":
        begin = scenario.attack_start_row
        end = len(df)
    elif phase == "baseline":
        begin = 0
        end = scenario.attack_start_row
    else:
        begin = 0
        end = len(df)

    if max_rows is not None:
        end = min(end, begin + max_rows)

    slice_df = df.iloc[begin:end].copy()
    feature_order = _load_feature_order()
    X = dataframe_to_feature_matrix(slice_df, feature_order)
    y_true = slice_df[LABEL_COL].astype(str).str.strip().to_numpy()

    meta = {
        "source": "scenario",
        "scenario": scenario.name,
        "csv_file": scenario.csv_file,
        "phase": phase,
        "row_range": [begin, end],
        "attack_start_row": scenario.attack_start_row,
        "n_rows": int(len(X)),
        "description": scenario.description,
    }
    return X, y_true, meta


def load_external_csv(
    csv_path: Path,
    *,
    max_rows: int | None = None,
) -> tuple[pd.DataFrame, np.ndarray, dict]:
    """Hook for CICIDS-compatible CSVs (same columns + Label). Different schemas need retrain."""
    path = csv_path if csv_path.is_absolute() else PROJECT_ROOT / csv_path
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")

    df = load_flow_csv(path)
    if LABEL_COL not in df.columns:
        raise ValueError(
            f"External CSV must include a '{LABEL_COL}' column with CICIDS-style labels. "
            "Different feature schemas require a feature adapter or full retrain."
        )
    if max_rows is not None:
        df = df.iloc[:max_rows].copy()

    feature_order = _load_feature_order()
    missing = [c for c in feature_order if c not in df.columns]
    X = dataframe_to_feature_matrix(df, feature_order)
    y_true = df[LABEL_COL].astype(str).str.strip().to_numpy()

    meta = {
        "source": "external_csv",
        "path": str(path),
        "n_rows": int(len(X)),
        "missing_feature_columns_zero_filled": missing,
        "note": (
            "Model expects feature_order.json. Missing columns were zero-filled; "
            "non-CICIDS schemas are unsupported without adapter/retrain."
        ),
    }
    return X, y_true, meta


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, confidence: np.ndarray) -> dict:
    labels = sorted(set(y_true.tolist()) | set(y_pred.tolist()))
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(
            precision_score(y_true, y_pred, average="macro", zero_division=0, labels=labels)
        ),
        "recall_macro": float(
            recall_score(y_true, y_pred, average="macro", zero_division=0, labels=labels)
        ),
        "f1_macro": float(
            f1_score(y_true, y_pred, average="macro", zero_division=0, labels=labels)
        ),
        "n_rows": int(len(y_true)),
        "n_true_attack": int(np.sum(y_true != "BENIGN")),
        "n_true_benign": int(np.sum(y_true == "BENIGN")),
        "detection_rate_on_true_attacks": (
            float(np.mean(y_pred[y_true != "BENIGN"] != "BENIGN"))
            if np.any(y_true != "BENIGN")
            else None
        ),
        "false_positive_rate_on_true_benign": (
            float(np.mean(y_pred[y_true == "BENIGN"] != "BENIGN"))
            if np.any(y_true == "BENIGN")
            else None
        ),
        "classification_report": classification_report(
            y_true, y_pred, labels=labels, zero_division=0, output_dict=True
        ),
        "label_counts_true": {str(k): int(v) for k, v in zip(*np.unique(y_true, return_counts=True))},
        "label_counts_pred": {str(k): int(v) for k, v in zip(*np.unique(y_pred, return_counts=True))},
    }

    # Severity occupancy on true attacks (production mapping; not a retune)
    attack_mask = y_true != "BENIGN"
    severity_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for label, conf in zip(y_pred[attack_mask], confidence[attack_mask], strict=True):
        sev = severity_from_confidence(float(conf), str(label))
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
    metrics["severity_on_true_attack_rows_using_pred_label"] = severity_counts
    return metrics


def plot_confusion(y_true: np.ndarray, y_pred: np.ndarray, title: str, output_path: Path) -> None:
    labels = sorted(set(y_true.tolist()) | set(y_pred.tolist()))
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    fig, ax = plt.subplots(figsize=(max(8, 0.7 * len(labels) + 4), max(6, 0.7 * len(labels) + 3)))
    sns.heatmap(
        cm,
        annot=len(labels) <= 12,
        fmt="d",
        xticklabels=labels,
        yticklabels=labels,
        ax=ax,
        cmap="Blues",
    )
    ax.set_title(title)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    fig.tight_layout()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def evaluate_batch(
    X: pd.DataFrame,
    y_true: np.ndarray,
    meta: dict,
    *,
    plot_stem: str,
) -> dict:
    id_to_label = _load_id_to_label()
    print(f"  scoring {len(X):,} rows ({meta.get('source')})...")
    scored = score_ml_batch(X, id_to_label)
    y_pred = scored["pred_label"].to_numpy()
    confidence = scored["confidence"].to_numpy()

    metrics = compute_metrics(y_true, y_pred, confidence)
    cm_name = f"harness_confusion_{plot_stem}.png"
    cm_path = REPORTS_DIR / cm_name
    plot_confusion(
        y_true,
        y_pred,
        title=f"Harness confusion — {plot_stem}",
        output_path=cm_path,
    )

    return {
        "meta": meta,
        "metrics": metrics,
        "artifacts": {
            "confusion_matrix_png": str(cm_path.relative_to(PROJECT_ROOT)),
        },
        "deck_line": (
            f"{meta.get('scenario') or meta.get('source')}: "
            f"accuracy={metrics['accuracy'] * 100:.2f}%, "
            f"macro-F1={metrics['f1_macro'] * 100:.2f}%"
            + (
                f", attack detection rate={metrics['detection_rate_on_true_attacks'] * 100:.2f}%"
                if metrics["detection_rate_on_true_attacks"] is not None
                else ""
            )
        ),
    }


def run_harness(args: argparse.Namespace) -> dict:
    results: list[dict] = []

    if args.csv:
        X, y_true, meta = load_external_csv(Path(args.csv), max_rows=args.max_rows)
        stem = Path(args.csv).stem.replace(" ", "_")[:60]
        results.append(evaluate_batch(X, y_true, meta, plot_stem=f"csv_{stem}"))
    elif args.scenario:
        names = list(SCENARIOS.keys()) if args.scenario.lower() == "all" else [args.scenario]
        for name in names:
            X, y_true, meta = load_scenario_frame(
                name, phase=args.phase, max_rows=args.max_rows
            )
            results.append(evaluate_batch(X, y_true, meta, plot_stem=f"scenario_{name}"))
    else:
        # default / --source test
        X, y_true, meta = load_processed_test()
        if args.max_rows is not None:
            X = X.iloc[: args.max_rows].copy()
            y_true = y_true[: args.max_rows]
            meta = {**meta, "n_rows": int(len(X)), "max_rows_applied": args.max_rows}
        results.append(evaluate_batch(X, y_true, meta, plot_stem="test"))

    if args.with_test and (args.scenario or args.csv):
        X, y_true, meta = load_processed_test()
        if args.max_rows is not None:
            X = X.iloc[: args.max_rows].copy()
            y_true = y_true[: args.max_rows]
            meta = {**meta, "n_rows": int(len(X)), "max_rows_applied": args.max_rows}
        results.append(evaluate_batch(X, y_true, meta, plot_stem="test"))

    report = {
        "approach": "A_offline_eval_harness",
        "parent_modules_modified": [],
        "runs": results,
        "deck_lines": [r["deck_line"] for r in results],
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 7 evaluation harness (Approach A)")
    parser.add_argument(
        "--source",
        choices=["test"],
        default=None,
        help="Use held-out processed test split (default if no --scenario/--csv).",
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default=None,
        help=f"Scenario key or 'all'. Choices: {list(SCENARIOS)}",
    )
    parser.add_argument(
        "--phase",
        choices=["attack", "baseline", "all"],
        default="attack",
        help="Scenario row window (default: attack).",
    )
    parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Optional CICIDS-compatible CSV (Label + feature_order columns).",
    )
    parser.add_argument("--max-rows", type=int, default=None, help="Optional row cap.")
    parser.add_argument(
        "--with-test",
        action="store_true",
        help="Also evaluate processed test when running --scenario or --csv.",
    )
    args = parser.parse_args()

    if args.source == "test" and (args.scenario or args.csv):
        print("Note: --source test ignored when --scenario/--csv is set (use --with-test).")

    print("Running Day 7 eval harness...")
    report = run_harness(args)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORTS_DIR / "harness_report.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote {out_path}")
    print("Deck lines:")
    for line in report["deck_lines"]:
        print(f"  - {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
