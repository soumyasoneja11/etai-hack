"""
Day 6 — Approach A: offline threshold evidence (read-only vs production code).

Loads the held-out test split, scores with the same model path as predict.py,
plots BENIGN vs attack score distributions, and documents current cutoffs.

Does NOT modify predict.py, enums.py, or baseline/builder.py.

Run from project root:
    python scripts/threshold_analysis.py
    python scripts/threshold_analysis.py --baseline-sample 5000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ingestion_detection.baseline.builder import (  # noqa: E402
    UNKNOWN_ENTITY_RISK,
    load_baseline_profiles,
    z_score_anomaly,
)
from ingestion_detection.features import derive_entity_id  # noqa: E402
from ingestion_detection.predict import (  # noqa: E402
    _load_id_to_label,
    _load_model,
)
from shared.enums import severity_from_confidence  # noqa: E402

PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "reports" / "metrics"
DOCS_DIR = PROJECT_ROOT / "docs"

# Production rules (documented, not changed by this script)
SEVERITY_BANDS = {
    "BENIGN": "always low",
    "critical": "confidence >= 90",
    "high": "confidence >= 75",
    "medium": "confidence >= 50",
    "low": "confidence < 50 (non-BENIGN)",
}
BASELINE_Z_DIVISOR = 3.0
SCORE_COMBINE_RULE = "max(ml_anomaly_score, baseline_deviation) when attack != BENIGN; else baseline_deviation"


def load_test_split() -> tuple[pd.DataFrame, np.ndarray, dict[int, str]]:
    x_path = PROCESSED_DIR / "X_test.parquet"
    y_path = PROCESSED_DIR / "y_test.parquet"
    if not x_path.exists() or not y_path.exists():
        raise FileNotFoundError(
            "Missing processed test split. Run: python -m ingestion_detection.preprocess"
        )
    X = pd.read_parquet(x_path).reset_index(drop=True)
    y = pd.read_parquet(y_path)["label_id"].to_numpy()
    if len(X) != len(y):
        raise ValueError(f"X/y length mismatch: {len(X)} vs {len(y)}")
    id_to_label = _load_id_to_label()
    return X, y, id_to_label


def score_ml_batch(X: pd.DataFrame, id_to_label: dict[int, str]) -> pd.DataFrame:
    """
    Batch equivalent of predict.predict_vector (same model + formulas).
    Uses one predict_proba call for speed on ~250k rows.
    """
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


def score_baseline_sample(
    X: pd.DataFrame,
    *,
    sample_size: int,
    random_state: int = 42,
) -> pd.Series | None:
    """Optional baseline z-scores on a random subset (entity-aware, slower)."""
    profiles = load_baseline_profiles()
    if not profiles:
        return None

    n = min(sample_size, len(X))
    # Positional indices so they align with y_true (0 .. n_rows-1)
    pos = X.sample(n=n, random_state=random_state).index.to_numpy()
    scores = []
    for i in pos:
        row = X.iloc[int(i)]
        feats = {col: float(row[col]) for col in X.columns}
        entity = derive_entity_id(feats)
        scores.append(z_score_anomaly(entity, feats, profiles))
    return pd.Series(scores, index=pos, name="baseline_deviation")


def summarize_scores(
    y_true_labels: np.ndarray,
    confidence: np.ndarray,
    ml_anomaly: np.ndarray,
) -> dict:
    benign_mask = y_true_labels == "BENIGN"
    attack_mask = ~benign_mask

    def _stats(arr: np.ndarray) -> dict:
        if len(arr) == 0:
            return {"count": 0}
        return {
            "count": int(len(arr)),
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "p50": float(np.percentile(arr, 50)),
            "p95": float(np.percentile(arr, 95)),
            "p99": float(np.percentile(arr, 99)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr)),
        }

    benign_conf = confidence[benign_mask]
    attack_conf = confidence[attack_mask]
    benign_anom = ml_anomaly[benign_mask]
    attack_anom = ml_anomaly[attack_mask]

    # Primary separator for this architecture: ml anomaly_score
    # (BENIGN → 0.0; attacks → confidence/100). Raw confidence is high for
    # both classes when the model is correct, so it is a poor separator.
    separation = None
    if len(benign_anom) and len(attack_anom):
        b95 = float(np.percentile(benign_anom, 95))
        a5 = float(np.percentile(attack_anom, 5))
        separation = {
            "metric": "ml_anomaly_score",
            "benign_p95": b95,
            "attack_p5": a5,
            "gap_attack_p5_minus_benign_p95": a5 - b95,
            "well_separated": a5 > b95,
            "note": (
                "Confidence is high for both BENIGN and attacks when predictions are correct; "
                "anomaly_score is the production field that encodes attack vs benign."
            ),
        }

    severity_counts: dict[str, int] = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for label, conf in zip(y_true_labels[attack_mask], attack_conf, strict=True):
        sev = severity_from_confidence(float(conf), str(label))
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    return {
        "benign_confidence": _stats(benign_conf),
        "attack_confidence": _stats(attack_conf),
        "benign_ml_anomaly_score": _stats(benign_anom),
        "attack_ml_anomaly_score": _stats(attack_anom),
        "separation": separation,
        "true_attack_severity_band_counts": severity_counts,
        "true_attack_pct_confidence_ge_90": (
            float(np.mean(attack_conf >= 90) * 100) if len(attack_conf) else None
        ),
        "true_benign_pct_confidence_ge_90": (
            float(np.mean(benign_conf >= 90) * 100) if len(benign_conf) else None
        ),
        "true_benign_pct_anomaly_gt_0": (
            float(np.mean(benign_anom > 0) * 100) if len(benign_anom) else None
        ),
        "true_attack_pct_anomaly_ge_0_75": (
            float(np.mean(attack_anom >= 0.75) * 100) if len(attack_anom) else None
        ),
    }


def plot_distributions(
    y_true_labels: np.ndarray,
    confidence: np.ndarray,
    ml_anomaly: np.ndarray,
    baseline_sample: pd.Series | None,
    output_path: Path,
) -> None:
    benign_mask = y_true_labels == "BENIGN"
    n_panels = 3 if baseline_sample is not None else 2
    fig, axes = plt.subplots(1, n_panels, figsize=(5 * n_panels, 4.5))
    if n_panels == 1:
        axes = [axes]

    # Confidence
    ax = axes[0]
    ax.hist(
        confidence[benign_mask],
        bins=40,
        alpha=0.65,
        label="BENIGN (true)",
        color="#2ecc71",
        density=True,
    )
    ax.hist(
        confidence[~benign_mask],
        bins=40,
        alpha=0.65,
        label="Attack (true)",
        color="#e74c3c",
        density=True,
    )
    for thr, style in ((50, ":"), (75, "--"), (90, "-")):
        ax.axvline(thr, color="#34495e", linestyle=style, linewidth=1.2, label=f"severity {thr}")
    ax.set_title("ML confidence (%)")
    ax.set_xlabel("confidence")
    ax.set_ylabel("density")
    ax.legend(fontsize=8)

    # ML anomaly score
    ax = axes[1]
    ax.hist(
        ml_anomaly[benign_mask],
        bins=40,
        alpha=0.65,
        label="BENIGN (true)",
        color="#2ecc71",
        density=True,
    )
    ax.hist(
        ml_anomaly[~benign_mask],
        bins=40,
        alpha=0.65,
        label="Attack (true)",
        color="#e74c3c",
        density=True,
    )
    ax.set_title("ML anomaly_score")
    ax.set_xlabel("anomaly_score")
    ax.set_ylabel("density")
    ax.legend(fontsize=8)

    if baseline_sample is not None:
        ax = axes[2]
        y_sub = y_true_labels[baseline_sample.index.to_numpy()]
        b_mask = y_sub == "BENIGN"
        vals = baseline_sample.to_numpy()
        ax.hist(vals[b_mask], bins=30, alpha=0.65, label="BENIGN (true)", color="#2ecc71", density=True)
        ax.hist(vals[~b_mask], bins=30, alpha=0.65, label="Attack (true)", color="#e74c3c", density=True)
        ax.axvline(1.0, color="#34495e", linestyle="--", linewidth=1.2, label="unknown entity = 1.0")
        ax.set_title(f"Baseline deviation (n={len(baseline_sample)})")
        ax.set_xlabel("baseline_deviation")
        ax.set_ylabel("density")
        ax.legend(fontsize=8)

    fig.suptitle("Day 6 threshold evidence — held-out test set", fontsize=12)
    fig.tight_layout()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def build_recommendation(summary: dict) -> dict:
    sep = summary.get("separation") or {}
    well = bool(sep.get("well_separated"))
    attack_critical_share = summary.get("true_attack_pct_confidence_ge_90")
    if well and attack_critical_share is not None:
        rationale = (
            "ml_anomaly_score cleanly separates BENIGN (≈0) from attacks on the held-out test set; "
            f"~{attack_critical_share:.1f}% of true attacks land in the critical severity band "
            "(confidence ≥ 90). Keep severity bands 50/75/90 and baseline z/3.0 unchanged."
        )
    else:
        rationale = (
            "Keep current constants for demo stability. "
            "Revisit only if live replay scenarios mis-assign severity."
        )
    return {
        "keep_current_constants": True,
        "rationale": rationale,
        "approach": "A_evidence_only",
        "parent_modules_modified": [],
    }


def write_thresholds_doc(report: dict, path: Path) -> None:
    sep = report["ml_score_summary"].get("separation") or {}
    lines = [
        "# Thresholds (Day 6 — Approach A)",
        "",
        "Evidence-only analysis. **Production constants were not changed.**",
        "",
        "## Current production rules",
        "",
        "### Severity (`shared/enums.py` → `severity_from_confidence`)",
        "",
        "| Condition | Severity |",
        "|-----------|----------|",
        "| `attack == BENIGN` | low |",
        "| `confidence >= 90` | critical |",
        "| `confidence >= 75` | high |",
        "| `confidence >= 50` | medium |",
        "| else | low |",
        "",
        "### ML anomaly score (`ingestion_detection/predict.py`)",
        "",
        "- BENIGN → `anomaly_score = 0.0`",
        "- Attack → `anomaly_score = min(confidence / 100, 1.0)`",
        "",
        "### Baseline (`ingestion_detection/baseline/builder.py` → `z_score_anomaly`)",
        "",
        f"- Score = `min(mean(|z|) / {BASELINE_Z_DIVISOR}, 1.0)`",
        f"- Unknown entity → `{UNKNOWN_ENTITY_RISK}`",
        "",
        "### Combined detection score (`detect_signal`)",
        "",
        f"- `{SCORE_COMBINE_RULE}`",
        "",
        "## Evidence (held-out test set)",
        "",
        f"- Rows scored: **{report['n_rows']:,}**",
        f"- Chart: `reports/metrics/score_distributions.png`",
        f"- Machine report: `reports/metrics/threshold_report.json`",
        "",
        "### Separation (ML anomaly_score)",
        "",
        f"- Metric: **{sep.get('metric', 'ml_anomaly_score')}**",
        f"- BENIGN p95: **{sep.get('benign_p95', 'n/a')}**",
        f"- Attack p5: **{sep.get('attack_p5', 'n/a')}**",
        f"- Gap (attack p5 − BENIGN p95): **{sep.get('gap_attack_p5_minus_benign_p95', 'n/a')}**",
        f"- Well separated: **{sep.get('well_separated', 'n/a')}**",
        "",
        f"- True attacks with confidence ≥ 90 (critical band): "
        f"**{report['ml_score_summary'].get('true_attack_pct_confidence_ge_90')}%**",
        f"- True BENIGN with anomaly_score > 0: "
        f"**{report['ml_score_summary'].get('true_benign_pct_anomaly_gt_0')}%**",
        "",
        "## Decision",
        "",
        f"- Keep current constants: **{report['recommendation']['keep_current_constants']}**",
        f"- {report['recommendation']['rationale']}",
        "",
        "## How to regenerate",
        "",
        "```bash",
        "python scripts/threshold_analysis.py",
        "python scripts/threshold_analysis.py --baseline-sample 5000",
        "```",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 6 threshold evidence (Approach A)")
    parser.add_argument(
        "--baseline-sample",
        type=int,
        default=5000,
        help="Rows for optional baseline histogram (0 to skip). Default 5000.",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print("Loading test split...")
    X, y_ids, id_to_label = load_test_split()
    y_true = np.array([id_to_label[int(i)] for i in y_ids])

    print(f"Scoring {len(X):,} rows with production model...")
    scored = score_ml_batch(X, id_to_label)
    summary = summarize_scores(
        y_true,
        scored["confidence"].to_numpy(),
        scored["ml_anomaly_score"].to_numpy(),
    )

    baseline_sample = None
    baseline_summary = None
    if args.baseline_sample > 0:
        print(f"Computing baseline deviations on sample n={args.baseline_sample}...")
        baseline_sample = score_baseline_sample(
            X, sample_size=args.baseline_sample, random_state=args.seed
        )
        if baseline_sample is None:
            print("  (skipped — baseline_profiles.json missing; run baseline builder)")
        else:
            y_sub = y_true[baseline_sample.index.to_numpy()]
            baseline_summary = {
                "sample_size": int(len(baseline_sample)),
                "benign_mean": float(baseline_sample[y_sub == "BENIGN"].mean())
                if np.any(y_sub == "BENIGN")
                else None,
                "attack_mean": float(baseline_sample[y_sub != "BENIGN"].mean())
                if np.any(y_sub != "BENIGN")
                else None,
                "unknown_entity_risk": UNKNOWN_ENTITY_RISK,
                "z_divisor": BASELINE_Z_DIVISOR,
            }

    plot_path = REPORTS_DIR / "score_distributions.png"
    print(f"Writing {plot_path}...")
    plot_distributions(
        y_true,
        scored["confidence"].to_numpy(),
        scored["ml_anomaly_score"].to_numpy(),
        baseline_sample,
        plot_path,
    )

    pred_match = float(np.mean(scored["pred_label"].to_numpy() == y_true))
    report = {
        "approach": "A_evidence_only",
        "n_rows": int(len(X)),
        "test_accuracy_vs_true_labels": pred_match,
        "production_rules": {
            "severity_bands": SEVERITY_BANDS,
            "baseline_z_divisor": BASELINE_Z_DIVISOR,
            "unknown_entity_risk": UNKNOWN_ENTITY_RISK,
            "score_combine": SCORE_COMBINE_RULE,
        },
        "ml_score_summary": summary,
        "baseline_sample_summary": baseline_summary,
        "artifacts": {
            "score_distributions_png": str(plot_path.relative_to(PROJECT_ROOT)),
            "threshold_report_json": "reports/metrics/threshold_report.json",
            "thresholds_md": "docs/THRESHOLDS.md",
        },
        "recommendation": build_recommendation(summary),
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / "threshold_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {report_path}")

    doc_path = DOCS_DIR / "THRESHOLDS.md"
    write_thresholds_doc(report, doc_path)
    print(f"Wrote {doc_path}")

    sep = summary.get("separation") or {}
    print("\nSummary")
    print(f"  test accuracy (pred vs true): {pred_match:.4f}")
    print(f"  separation metric: {sep.get('metric')}")
    print(f"  BENIGN anomaly p95: {sep.get('benign_p95')}")
    print(f"  attack anomaly p5:  {sep.get('attack_p5')}")
    print(f"  well separated:  {sep.get('well_separated')}")
    print(f"  keep constants:  {report['recommendation']['keep_current_constants']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
