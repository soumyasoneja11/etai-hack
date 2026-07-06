"""Build per-entity baselines from pre-attack rows only."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ingestion_detection.features import (
    BASELINE_FEATURE_KEYS,
    LABEL_COL,
    derive_entity_id,
    load_flow_csv,
    row_to_features,
    sanitize_value,
)
from ingestion_detection.replay.scenarios import ReplayScenario, get_scenario
from shared.schemas import BaselineManifest, EntityBaseline, FeatureStats

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
BASELINE_PATH = MODELS_DIR / "baseline_profiles.json"
MANIFEST_PATH = MODELS_DIR / "baseline_manifest.json"

MIN_STD = 1e-6
UNKNOWN_ENTITY_RISK = 1.0


def _iter_baseline_rows(
    scenario: ReplayScenario,
    *,
    max_rows: int | None = None,
) -> tuple[pd.DataFrame, list[dict]]:
    df = load_flow_csv(scenario.path)
    end = scenario.attack_start_row
    if max_rows is not None:
        end = min(end, max_rows)
    pre_attack = df.iloc[:end].copy()
    pre_attack = pre_attack[pre_attack[LABEL_COL] == "BENIGN"]
    sources = [
        {
            "source_file": scenario.csv_file,
            "row_range": [0, scenario.attack_start_row],
            "label_filter": "BENIGN",
            "rows_used": len(pre_attack),
        }
    ]
    return pre_attack, sources


def build_baseline_profiles(
    scenario_name: str | None = None,
    *,
    max_rows: int | None = None,
) -> tuple[dict[str, EntityBaseline], BaselineManifest]:
    scenario = get_scenario(scenario_name)
    pre_attack, sources = _iter_baseline_rows(scenario, max_rows=max_rows)

    if pre_attack.empty:
        raise ValueError(
            f"No BENIGN pre-attack rows for scenario '{scenario.name}' — check attack_start_row."
        )

    feature_cols = [c for c in BASELINE_FEATURE_KEYS if c in pre_attack.columns]
    buckets: dict[str, dict[str, list[float]]] = {}

    for _, row in pre_attack.iterrows():
        feats = row_to_features(row, feature_cols)
        entity_id = derive_entity_id(feats)
        buckets.setdefault(entity_id, {k: [] for k in feature_cols})
        for key in feature_cols:
            buckets[entity_id][key].append(sanitize_value(row[key]))

    profiles: dict[str, EntityBaseline] = {}
    for entity_id, feat_lists in buckets.items():
        stats: dict[str, FeatureStats] = {}
        for key, values in feat_lists.items():
            series = pd.Series(values, dtype=float)
            std = float(series.std(ddof=0)) if len(series) > 1 else 0.0
            stats[key] = FeatureStats(
                mean=float(series.mean()),
                std=max(std, MIN_STD),
                count=len(values),
            )
        profiles[entity_id] = EntityBaseline(
            entity_id=entity_id,
            sample_count=max(v.count for v in stats.values()),
            features=stats,
        )

    manifest = BaselineManifest(
        built_at=datetime.now(timezone.utc),
        primary_scenario=scenario.name,
        baseline_sources=sources,
        entity_count=len(profiles),
        feature_count=len(feature_cols),
        notes=[
            "Baseline computed only from BENIGN rows before attack_start_row.",
            "CICIDS2017 ISCX CSVs lack source IP — entity_id uses dst-{port}-win-{init_win}.",
            "Entities with no baseline at scoring time receive anomaly_score=1.0 (high risk).",
        ],
    )
    return profiles, manifest


def save_baseline(
    profiles: dict[str, EntityBaseline],
    manifest: BaselineManifest,
) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    serializable = {eid: profile.model_dump() for eid, profile in profiles.items()}
    BASELINE_PATH.write_text(json.dumps(serializable, indent=2), encoding="utf-8")
    MANIFEST_PATH.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")


def load_baseline_profiles() -> dict[str, EntityBaseline]:
    if not BASELINE_PATH.exists():
        return {}
    raw = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    return {eid: EntityBaseline.model_validate(data) for eid, data in raw.items()}


def load_manifest() -> BaselineManifest | None:
    if not MANIFEST_PATH.exists():
        return None
    return BaselineManifest.model_validate_json(MANIFEST_PATH.read_text(encoding="utf-8"))


def z_score_anomaly(
    entity_id: str,
    features: dict[str, float],
    profiles: dict[str, EntityBaseline],
) -> float:
    """Mean absolute z-score vs entity baseline. Unknown entity → UNKNOWN_ENTITY_RISK."""
    profile = profiles.get(entity_id)
    if profile is None:
        return UNKNOWN_ENTITY_RISK

    scores: list[float] = []
    for key, stats in profile.features.items():
        if key not in features:
            continue
        z = abs(features[key] - stats.mean) / stats.std
        scores.append(z)

    if not scores:
        return UNKNOWN_ENTITY_RISK

    return min(float(sum(scores) / len(scores)) / 3.0, 1.0)


def main() -> None:
    profiles, manifest = build_baseline_profiles()
    save_baseline(profiles, manifest)
    print(f"Built baseline for {manifest.entity_count} entities")
    print(f"  scenario: {manifest.primary_scenario}")
    print(f"  rows used: {manifest.baseline_sources[0]['rows_used']}")
    print(f"  saved: {BASELINE_PATH}")


if __name__ == "__main__":
    main()
