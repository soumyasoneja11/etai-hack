"""
Exploratory Data Analysis for CICIDS2017 network flow CSVs.

Run from project root:
    python src/eda.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
REPORT_DIR = PROJECT_ROOT / "reports" / "eda"

CSV_FILES = [
    "Wednesday-workingHours.pcap_ISCX.csv",
    "Friday-WorkingHours-Morning.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
]

LABEL_COL = "Label"


def load_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    df.columns = df.columns.str.strip()
    return df


def print_section(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def analyze_file(name: str, df: pd.DataFrame, lines: list[str]) -> pd.Series:
    print_section(name)
    print(f"Shape: {df.shape[0]:,} rows x {df.shape[1]} columns")

    lines.append(f"## {name}\n")
    lines.append(f"- Rows: {df.shape[0]:,}")
    lines.append(f"- Columns: {df.shape[1]}\n")

    print("\nColumns (first 10):")
    for col in list(df.columns[:10]):
        print(f"  - {col!r}")
    if len(df.columns) > 10:
        print(f"  ... and {len(df.columns) - 10} more")

    spaced_cols = [c for c in df.columns if c != c.strip()]
    if spaced_cols:
        print(f"\nNote: {len(spaced_cols)} columns had leading/trailing spaces (stripped on load).")

    if LABEL_COL not in df.columns:
        msg = f"WARNING: '{LABEL_COL}' column not found."
        print(msg)
        lines.append(f"- {msg}\n")
        return pd.Series(dtype=int)

    label_counts = df[LABEL_COL].value_counts()
    benign = label_counts.get("BENIGN", 0)
    attack_rows = len(df) - benign
    benign_pct = 100 * benign / len(df) if len(df) else 0

    print(f"\n{LABEL_COL} distribution:")
    print(label_counts.to_string())
    print(f"\nBenign: {benign:,} ({benign_pct:.2f}%)")
    print(f"Attack: {attack_rows:,} ({100 - benign_pct:.2f}%)")

    lines.append("### Label counts\n")
    for label, count in label_counts.items():
        pct = 100 * count / len(df)
        lines.append(f"- {label}: {count:,} ({pct:.2f}%)")
    lines.append("")

    missing = df.isnull().sum()
    missing_cols = missing[missing > 0]
    print(f"\nMissing values: {int(missing.sum()):,} total across all columns")
    if missing_cols.empty:
        print("  No columns with missing values.")
        lines.append("- Missing values: none\n")
    else:
        print("  Columns with missing values:")
        for col, count in missing_cols.items():
            print(f"    {col}: {count:,}")
        lines.append(f"- Missing values: {int(missing.sum()):,} total\n")

    inf_count = 0
    numeric = df.select_dtypes(include="number")
    if not numeric.empty:
        inf_count = int(pd.DataFrame(numeric).isin([float("inf"), float("-inf")]).sum().sum())
    print(f"\nInfinite values (numeric columns): {inf_count:,}")

    dup_count = int(df.duplicated().sum())
    dup_pct = 100 * dup_count / len(df) if len(df) else 0
    print(f"Duplicate rows: {dup_count:,} ({dup_pct:.2f}%)")
    lines.append(f"- Infinite values: {inf_count:,}")
    lines.append(f"- Duplicate rows: {dup_count:,} ({dup_pct:.2f}%)\n")

    return label_counts


def plot_label_distribution(
    label_counts: pd.Series,
    title: str,
    output_path: Path,
    top_n: int | None = None,
) -> None:
    counts = label_counts if top_n is None else label_counts.head(top_n)
    palette = ["#2ecc71" if idx == "BENIGN" else "#e74c3c" for idx in counts.index]

    fig, ax = plt.subplots(figsize=(10, max(4, 0.4 * len(counts))))
    sns.barplot(x=counts.values, y=counts.index, hue=counts.index, palette=palette, ax=ax, legend=False)
    ax.set_title(title)
    ax.set_xlabel("Count")
    ax.set_ylabel("Label")
    for i, v in enumerate(counts.values):
        ax.text(v + counts.max() * 0.01, i, f"{v:,}", va="center", fontsize=9)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    summary_lines: list[str] = ["# CICIDS2017 EDA Summary\n"]

    all_label_counts: dict[str, pd.Series] = {}
    combined_labels: list[pd.Series] = []

    for filename in CSV_FILES:
        path = DATA_DIR / filename
        if not path.exists():
            print(f"Missing file: {path}", file=sys.stderr)
            return 1

        df = load_csv(path)
        stem = path.stem
        label_counts = analyze_file(filename, df, summary_lines)
        all_label_counts[stem] = label_counts
        combined_labels.append(label_counts)

        if not label_counts.empty:
            plot_label_distribution(
                label_counts,
                title=f"Label distribution — {filename}",
                output_path=REPORT_DIR / f"{stem}_labels.png",
            )

    if combined_labels:
        print_section("Combined dataset (all 4 files)")
        combined = pd.concat(combined_labels, axis=1, keys=all_label_counts.keys()).fillna(0)
        combined_total = combined.sum(axis=1).sort_values(ascending=False)
        total_rows = int(combined.values.sum())

        print(f"Total rows across files: {total_rows:,}")
        print("\nCombined label counts:")
        print(combined_total.to_string())

        benign_total = combined_total.get("BENIGN", 0)
        benign_pct = 100 * benign_total / total_rows if total_rows else 0
        print(f"\nOverall benign: {benign_total:,} ({benign_pct:.2f}%)")
        print(f"Overall attack: {total_rows - benign_total:,} ({100 - benign_pct:.2f}%)")

        summary_lines.append("## Combined (all files)\n")
        summary_lines.append(f"- Total rows: {total_rows:,}\n")
        summary_lines.append("### Label counts\n")
        for label, count in combined_total.items():
            pct = 100 * count / total_rows
            summary_lines.append(f"- {label}: {int(count):,} ({pct:.2f}%)")
        summary_lines.append("")

        plot_label_distribution(
            combined_total,
            title="Combined label distribution (all CSVs)",
            output_path=REPORT_DIR / "combined_labels.png",
        )

        attack_only = combined_total.drop("BENIGN", errors="ignore")
        if not attack_only.empty:
            plot_label_distribution(
                attack_only,
                title="Attack-only label distribution (excluding BENIGN)",
                output_path=REPORT_DIR / "combined_attacks_only.png",
            )

    summary_path = REPORT_DIR / "eda_summary.md"
    summary_path.write_text("\n".join(summary_lines), encoding="utf-8")

    print_section("Outputs saved")
    print(f"  {REPORT_DIR}/")
    for p in sorted(REPORT_DIR.iterdir()):
        print(f"    - {p.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
