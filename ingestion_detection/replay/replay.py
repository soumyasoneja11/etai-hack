"""
Replay CICIDS2017 rows to A's ingest API (CyberShield-aligned).

Usage:
  python -m ingestion_detection.replay.replay
  python -m ingestion_detection.replay.replay --scenario portscan --max-rows 50
  python -m ingestion_detection.replay.replay --token <JWT> --max-rows 5
"""

from __future__ import annotations

import argparse
import logging
import os
import time
from datetime import datetime, timezone

import httpx
import pandas as pd

from ingestion_detection.features import (
    LABEL_COL,
    derive_entity_id,
    load_flow_csv,
    row_to_features,
)
from ingestion_detection.predict import _load_feature_order
from ingestion_detection.replay.scenarios import SCENARIOS, ReplayScenario, get_scenario
from shared.schemas import SignalIngestRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_INGEST_URL = "http://127.0.0.1:8000/api/v1/signals/ingest"
LEGACY_INGEST_URL = "http://127.0.0.1:8000/api/v1/events/ingest"


def csv_row_to_signal(
    row: pd.Series,
    *,
    source_file: str,
    row_index: int,
    feature_columns: list[str],
) -> SignalIngestRequest:
    features = row_to_features(row, feature_columns)
    asset_id = derive_entity_id(features)
    ground_truth = str(row[LABEL_COL]).strip() if LABEL_COL in row.index else None
    return SignalIngestRequest(
        detected_at=datetime.now(timezone.utc),
        asset_id=asset_id,
        source_file=source_file,
        row_index=row_index,
        features=features,
        ground_truth_label=ground_truth,
    )


def iter_replay_rows(
    scenario: ReplayScenario,
    *,
    start_row: int = 0,
    max_rows: int | None = None,
    phase: str = "attack",
) -> tuple[pd.DataFrame, list[str], int, int]:
    df = load_flow_csv(scenario.path)
    # Use training feature_order so ingest validation always sees a complete map.
    feature_columns = _load_feature_order()

    if phase == "attack":
        begin = scenario.attack_start_row
        end = len(df)
    elif phase == "baseline":
        begin = start_row
        end = scenario.attack_start_row
    else:
        begin = start_row
        end = len(df)

    if max_rows is not None:
        end = min(end, begin + max_rows)

    return df.iloc[begin:end], feature_columns, begin, end


def _parse_ingest_response(body: dict) -> tuple[str | None, str | None]:
    if body.get("success") and body.get("data"):
        data = body["data"]
        sid = data.get("signal_id") or data.get("event_id")
        attack = data.get("detection", {}).get("attack") if isinstance(data.get("detection"), dict) else None
        return sid, attack
    return body.get("event_id") or body.get("signal_id"), None


def _auth_headers(token: str | None) -> dict[str, str]:
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def replay(
    *,
    ingest_url: str,
    scenario_name: str | None,
    delay_sec: float,
    max_rows: int | None,
    phase: str,
    dry_run: bool,
    score_on_ingest: bool,
    token: str | None = None,
) -> int:
    scenario = get_scenario(scenario_name)
    slice_df, feature_columns, begin, end = iter_replay_rows(
        scenario, max_rows=max_rows, phase=phase
    )
    headers = _auth_headers(token)

    logger.info(
        "scenario=%s phase=%s rows=[%s,%s) count=%s url=%s auth=%s",
        scenario.name, phase, begin, end, len(slice_df), ingest_url,
        "yes" if token else "no",
    )

    sent = failed = 0
    params = {"score": str(score_on_ingest).lower()}

    with httpx.Client(timeout=120.0) as client:
        for offset, (_, row) in enumerate(slice_df.iterrows()):
            row_index = begin + offset
            signal = csv_row_to_signal(
                row,
                source_file=scenario.csv_file,
                row_index=row_index,
                feature_columns=feature_columns,
            )

            if dry_run:
                logger.info(
                    "dry-run row=%s asset=%s label=%s",
                    row_index, signal.asset_id, signal.ground_truth_label,
                )
                sent += 1
                continue

            try:
                response = client.post(
                    ingest_url,
                    json=signal.model_dump(mode="json"),
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
                sid, attack = _parse_ingest_response(response.json())
                logger.info(
                    "sent row=%s signal_id=%s truth=%s predicted=%s",
                    row_index, sid, signal.ground_truth_label, attack,
                )
                sent += 1
            except httpx.HTTPError as exc:
                failed += 1
                logger.error("row=%s failed: %s", row_index, exc)
                return 1

            if delay_sec > 0 and offset < len(slice_df) - 1:
                time.sleep(delay_sec)

    logger.info("Replay complete sent=%s failed=%s", sent, failed)
    return 0 if failed == 0 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Replay CICIDS2017 to CyberShield signal ingest")
    parser.add_argument("--url", default=DEFAULT_INGEST_URL)
    parser.add_argument("--scenario", default=None, choices=list(SCENARIOS.keys()))
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--max-rows", type=int, default=None)
    parser.add_argument("--phase", choices=["attack", "baseline", "all"], default="attack")
    parser.add_argument("--no-score", action="store_true", help="Ingest only, skip ML scoring")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--token",
        default=os.environ.get("AUTH_TOKEN"),
        help="Supabase JWT (or set AUTH_TOKEN). Required for authenticated ingest.",
    )
    args = parser.parse_args(argv)

    return replay(
        ingest_url=args.url,
        scenario_name=args.scenario,
        delay_sec=args.delay,
        max_rows=args.max_rows,
        phase=args.phase,
        dry_run=args.dry_run,
        score_on_ingest=not args.no_score,
        token=args.token,
    )


if __name__ == "__main__":
    raise SystemExit(main())
