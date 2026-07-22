"""
Train Random Forest + LightGBM classifiers; save best model.

Run: python -m ingestion_detection.train
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
MODELS_DIR = PROJECT_ROOT / "ingestion_detection" / "models"
REPORTS_DIR = PROJECT_ROOT / "reports" / "metrics"

RANDOM_STATE = 42


def load_splits():
    X_train = pd.read_parquet(PROCESSED_DIR / "X_train.parquet")
    X_test = pd.read_parquet(PROCESSED_DIR / "X_test.parquet")
    y_train = pd.read_parquet(PROCESSED_DIR / "y_train.parquet")["label_id"].values
    y_test = pd.read_parquet(PROCESSED_DIR / "y_test.parquet")["label_id"].values
    label_map = json.loads((MODELS_DIR / "label_mapping.json").read_text(encoding="utf-8"))
    return X_train, X_test, y_train, y_test, label_map["id_to_label"]


def evaluate_model(name: str, y_true, y_pred, id_to_label: dict[str, str]) -> dict:
    labels_sorted = sorted(int(k) for k in id_to_label.keys())
    target_names = [id_to_label[str(i)] for i in labels_sorted]

    metrics = {
        "model": name,
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "classification_report": classification_report(
            y_true, y_pred, target_names=target_names, zero_division=0, output_dict=True
        ),
    }
    return metrics


def plot_confusion_matrix(name: str, y_true, y_pred, id_to_label: dict[str, str]) -> None:
    labels_sorted = sorted(int(k) for k in id_to_label.keys())
    target_names = [id_to_label[str(i)] for i in labels_sorted]
    cm = confusion_matrix(y_true, y_pred, labels=labels_sorted)
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(cm, annot=False, fmt="d", xticklabels=target_names, yticklabels=target_names, ax=ax)
    ax.set_title(f"Confusion Matrix — {name}")
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    fig.tight_layout()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(REPORTS_DIR / f"confusion_matrix_{name.lower().replace(' ', '_')}.png", dpi=150)
    plt.close(fig)


def train_and_evaluate() -> dict:
    if not (PROCESSED_DIR / "X_train.parquet").exists():
        raise FileNotFoundError("Run preprocess first: python -m ingestion_detection.preprocess")

    X_train, X_test, y_train, y_test, id_to_label = load_splits()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    candidates: dict[str, Pipeline | LGBMClassifier] = {
        "random_forest": Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    RandomForestClassifier(
                        n_estimators=100,
                        max_depth=None,
                        n_jobs=-1,
                        random_state=RANDOM_STATE,
                        class_weight="balanced_subsample",
                    ),
                ),
            ]
        ),
        "lightgbm": LGBMClassifier(
            n_estimators=200,
            learning_rate=0.05,
            num_leaves=63,
            class_weight="balanced",
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbose=-1,
        ),
    }

    all_metrics: list[dict] = []
    best_name = ""
    best_f1 = -1.0
    best_model = None

    for name, model in candidates.items():
        print(f"Training {name}...")
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        metrics = evaluate_model(name, y_test, y_pred, id_to_label)
        all_metrics.append(metrics)
        plot_confusion_matrix(name, y_test, y_pred, id_to_label)
        print(f"  accuracy={metrics['accuracy']:.4f}  f1_macro={metrics['f1_macro']:.4f}")

        if metrics["f1_macro"] > best_f1:
            best_f1 = metrics["f1_macro"]
            best_name = name
            best_model = model

    assert best_model is not None
    model_path = MODELS_DIR / "model.joblib"
    joblib.dump(best_model, model_path)

    # ---- Model provenance (Y4) ----
    import platform
    import sklearn
    import lightgbm as lgb_mod

    provenance = {
        "python_version": platform.python_version(),
        "scikit_learn_version": sklearn.__version__,
        "lightgbm_version": lgb_mod.__version__,
        "numpy_version": np.__version__,
        "pandas_version": pd.__version__,
        "joblib_version": joblib.__version__,
        "trained_at": pd.Timestamp.utcnow().isoformat(),
    }

    summary = {
        "best_model": best_name,
        "best_f1_macro": best_f1,
        "models": all_metrics,
        "provenance": provenance,
    }
    (REPORTS_DIR / "metrics_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (MODELS_DIR / "best_model.json").write_text(
        json.dumps({"name": best_name, "path": str(model_path)}, indent=2),
        encoding="utf-8",
    )
    (MODELS_DIR / "model_provenance.json").write_text(
        json.dumps(provenance, indent=2), encoding="utf-8",
    )
    print(f"Best model: {best_name} (f1_macro={best_f1:.4f})")
    print(f"Saved: {model_path}")
    print(f"Provenance: sklearn={provenance['scikit_learn_version']}, "
          f"lgbm={provenance['lightgbm_version']}, "
          f"numpy={provenance['numpy_version']}")
    return summary


def main() -> None:
    train_and_evaluate()


if __name__ == "__main__":
    main()
