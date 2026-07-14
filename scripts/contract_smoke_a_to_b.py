"""
Day 8 — A→B contract smoke (Approach A).

Builds a DetectionResult the way A does, then feeds B's correlate_detection
in-process (no servers / auth required).

Optionally scores one real PortScan CSV row when data + model are available.

Run:
    python scripts/contract_smoke_a_to_b.py
    python scripts/contract_smoke_a_to_b.py --from-csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from correlation_response.correlate import correlate_detection  # noqa: E402
from ingestion_detection.features import LABEL_COL, load_flow_csv, row_to_features  # noqa: E402
from ingestion_detection.predict import _load_feature_order, detect_signal  # noqa: E402
from ingestion_detection.replay.scenarios import get_scenario  # noqa: E402
from shared.schemas import DetectionResult, new_event_id, utc_now  # noqa: E402

FIXTURES_DIR = PROJECT_ROOT / "tests" / "fixtures"
REPORTS_DIR = PROJECT_ROOT / "reports" / "metrics"


def fake_portscan_detection() -> DetectionResult:
    """Minimal valid DetectionResult matching shared.schemas (A → B handoff)."""
    return DetectionResult(
        signal_id=new_event_id(),
        asset_id="dst-80-win-8192",
        detected_at=utc_now(),
        attack="PortScan",
        confidence=99.5,
        anomaly_score=0.995,
        baseline_deviation=0.4,
        severity="critical",
        title="Port Scan Activity",
        reason="PortScan",
        top_features=[],
    )


def detection_from_csv_row() -> DetectionResult:
    scenario = get_scenario("portscan")
    df = load_flow_csv(scenario.path)
    row = df.iloc[scenario.attack_start_row]
    order = _load_feature_order()
    features = row_to_features(row, order)
    return detect_signal(
        signal_id=None,
        asset_id=None,
        features=features,
        use_baseline=True,
    )


def run_correlate_smoke(detection: DetectionResult) -> dict:
    """In-process call into B — same fields B's HTTP handler uses."""
    if detection.attack == "BENIGN":
        return {
            "skipped": True,
            "reason": "BENIGN traffic not correlated",
            "attack": detection.attack,
        }

    attribution = correlate_detection(
        attack=detection.attack,
        confidence=detection.confidence,
    )
    return {
        "skipped": False,
        "detection": detection.model_dump(mode="json"),
        "attribution": attribution,
        "contract_ok": all(
            key in attribution
            for key in (
                "mitre_technique_id",
                "mitre_tactic",
                "technique_name",
                "matched_campaign",
                "confidence",
            )
        ),
        "label_mapped": attribution.get("mitre_technique_id") != "T0000",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 8 A→B DetectionResult contract smoke")
    parser.add_argument(
        "--from-csv",
        action="store_true",
        help="Score one real PortScan attack row via detect_signal",
    )
    args = parser.parse_args()

    print("Day 8 contract smoke (A -> B)\n")

    results = []

    # 1) Synthetic DetectionResult
    fake = fake_portscan_detection()
    fake_result = run_correlate_smoke(fake)
    results.append({"case": "synthetic_portscan", **fake_result})
    print(
        f"  synthetic PortScan -> {fake_result['attribution']['mitre_technique_id']} "
        f"({fake_result['attribution']['technique_name']}) "
        f"mapped={fake_result['label_mapped']} contract_ok={fake_result['contract_ok']}"
    )

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    fixture_path = FIXTURES_DIR / "detection_result_portscan.json"
    fixture_path.write_text(
        json.dumps(fake.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    print(f"  wrote fixture {fixture_path.relative_to(PROJECT_ROOT)}")

    # 2) Optional real CSV row
    if args.from_csv:
        try:
            real = detection_from_csv_row()
            real_result = run_correlate_smoke(real)
            results.append({"case": "csv_portscan_row", **{k: v for k, v in real_result.items() if k != "detection"}})
            # Keep detection summary small in console
            print(
                f"  csv row predict={real.attack} conf={real.confidence:.2f}% "
                f"-> {real_result.get('attribution', {}).get('mitre_technique_id')} "
                f"contract_ok={real_result.get('contract_ok')}"
            )
            results[-1]["predicted_attack"] = real.attack
            results[-1]["confidence"] = real.confidence
            if "attribution" in real_result:
                results[-1]["attribution"] = real_result["attribution"]
                results[-1]["contract_ok"] = real_result["contract_ok"]
                results[-1]["label_mapped"] = real_result["label_mapped"]
        except Exception as exc:  # noqa: BLE001
            print(f"  SKIP csv row: {exc}")
            results.append({"case": "csv_portscan_row", "error": str(exc)})

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    # Strip bulky detection payloads for the report summary
    summary = {
        "approach": "A_day8_contract_smoke",
        "cases": [
            {
                "case": r["case"],
                "contract_ok": r.get("contract_ok"),
                "label_mapped": r.get("label_mapped"),
                "attribution": r.get("attribution"),
                "predicted_attack": r.get("predicted_attack"),
                "skipped": r.get("skipped"),
                "error": r.get("error"),
            }
            for r in results
        ],
    }
    out = REPORTS_DIR / "contract_smoke_a_to_b.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nWrote {out.relative_to(PROJECT_ROOT)}")

    # Fail if synthetic contract broke
    if not fake_result.get("contract_ok") or not fake_result.get("label_mapped"):
        print("FAIL: synthetic PortScan contract smoke failed")
        return 1
    print("PASS: A->B contract smoke OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
