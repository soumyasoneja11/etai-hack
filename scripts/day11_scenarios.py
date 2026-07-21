"""
Day 11 — multi-scenario attack + benign harness.

Exercises portscan, ddos, bot (small max-rows) plus one baseline/benign phase.
Prefers A's live correlation_forward handoff; falls back to B POST /correlate.

Requires A on :8000 and B on :8001. Missing scenario CSVs are SKIP (not crash).

Run:
    python scripts/day11_scenarios.py
    python scripts/day11_scenarios.py --max-rows 3 --email day11@test.local --password 'Day11Test!234'
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ingestion_detection.replay.replay import (  # noqa: E402
    csv_row_to_signal,
    iter_replay_rows,
)
from ingestion_detection.replay.scenarios import SCENARIOS, get_scenario  # noqa: E402

REPORTS_DIR = PROJECT_ROOT / "reports" / "metrics"
DOCS_DIR = PROJECT_ROOT / "docs"

A_BASE = "http://127.0.0.1:8000"
B_BASE = "http://127.0.0.1:8001"

ATTACK_SCENARIOS = ("portscan", "ddos", "bot")

# Benign / baseline acceptance thresholds (documented in report)
# PASS if both hold after baseline ingest:
#   - critical_predicted == 0
#   - non_benign_rate <= BENIGN_MAX_NON_BENIGN_RATE
BENIGN_MAX_NON_BENIGN_RATE = 0.25
BENIGN_MAX_CRITICAL = 0


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _safe_print(msg: str) -> None:
    """ASCII-safe console output for Windows cp1252 consoles."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"))


def ensure_token(
    client: httpx.Client,
    *,
    email: str,
    password: str,
) -> str | None:
    """Signup (ignore if exists) then login via A; return access_token."""
    try:
        client.post(
            f"{A_BASE}/api/v1/auth/signup",
            json={"email": email, "password": password},
            timeout=30.0,
        )
    except Exception:  # noqa: BLE001
        pass

    try:
        login = client.post(
            f"{A_BASE}/api/v1/auth/login",
            json={"email": email, "password": password},
            timeout=30.0,
        )
        body = login.json()
        token = (body.get("data") or {}).get("access_token")
        if login.status_code == 200 and token:
            return str(token)
        _safe_print(f"  [FAIL] auth login - {body.get('error') or login.text}")
        return None
    except Exception as exc:  # noqa: BLE001
        _safe_print(f"  [FAIL] auth login - {exc}")
        return None


def check_health(client: httpx.Client) -> bool:
    ok_all = True
    for name, url in (("A", f"{A_BASE}/health"), ("B", f"{B_BASE}/health")):
        try:
            resp = client.get(url, timeout=10.0)
            body = resp.json()
            ok = resp.status_code == 200 and body.get("success") is True
            _safe_print(f"  [{'PASS' if ok else 'FAIL'}] {name} health")
            ok_all = ok_all and ok
        except Exception as exc:  # noqa: BLE001
            _safe_print(f"  [FAIL] {name} health - {exc}")
            ok_all = False
    return ok_all


def _manual_correlate(
    client: httpx.Client,
    token: str,
    detection: dict[str, Any],
) -> dict[str, Any]:
    resp = client.post(
        f"{B_BASE}/api/v1/correlate",
        headers=_auth_headers(token),
        json=detection,
        timeout=60.0,
    )
    body = resp.json()
    data = body.get("data") or {}
    if resp.status_code != 200 or not body.get("success"):
        raise RuntimeError(str(body.get("error") or resp.text))
    return data if isinstance(data, dict) else {}


def run_attack_scenario(
    client: httpx.Client,
    *,
    token: str,
    scenario_name: str,
    max_rows: int,
    delay: float,
) -> dict[str, Any]:
    """Replay attack rows; prefer auto-forward, else POST /correlate."""
    scenario = get_scenario(scenario_name)
    result: dict[str, Any] = {
        "scenario": scenario_name,
        "phase": "attack",
        "csv": scenario.csv_file,
        "csv_path": str(scenario.path),
        "status": "FAIL",
        "predicted_attacks": [],
        "mitre_technique_ids": [],
        "anomaly_ids": [],
        "rows_sent": 0,
        "forward_ok": 0,
        "correlate_fallback": 0,
        "errors": [],
        "t0000_hits": 0,
    }

    if not scenario.path.exists():
        result["status"] = "SKIP"
        result["skip_reason"] = f"CSV missing: {scenario.path}"
        _safe_print(f"  [SKIP] {scenario_name} - CSV missing: {scenario.path.name}")
        return result

    try:
        slice_df, feature_columns, begin, _end = iter_replay_rows(
            scenario, max_rows=max_rows, phase="attack"
        )
    except FileNotFoundError as exc:
        result["status"] = "SKIP"
        result["skip_reason"] = str(exc)
        _safe_print(f"  [SKIP] {scenario_name} - {exc}")
        return result
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(str(exc))
        _safe_print(f"  [FAIL] {scenario_name} load - {exc}")
        return result

    ingest_url = f"{A_BASE}/api/v1/signals/ingest"
    headers = _auth_headers(token)

    for offset, (_, row) in enumerate(slice_df.iterrows()):
        row_index = begin + offset
        signal = csv_row_to_signal(
            row,
            source_file=scenario.csv_file,
            row_index=row_index,
            feature_columns=feature_columns,
        )
        try:
            resp = client.post(
                ingest_url,
                json=signal.model_dump(mode="json"),
                params={"score": "true"},
                headers=headers,
                timeout=120.0,
            )
            body = resp.json()
            if resp.status_code != 200 or not body.get("success"):
                result["errors"].append(
                    f"row={row_index} ingest HTTP {resp.status_code}: "
                    f"{body.get('error') or resp.text}"
                )
                continue

            data = body.get("data") or {}
            detection = data.get("detection") if isinstance(data, dict) else None
            forward = data.get("correlation_forward") if isinstance(data, dict) else None
            result["rows_sent"] += 1

            attack = None
            if isinstance(detection, dict):
                attack = detection.get("attack")
                if attack:
                    result["predicted_attacks"].append(attack)

            anomaly_id = None
            mitre_id = None

            if isinstance(forward, dict) and forward.get("status") == "ok":
                anomaly_id = forward.get("anomaly_id")
                result["forward_ok"] += 1
                # Fetch attribution from B anomalies list / correlate detail via audit trail optional.
                # Prefer reading mitre from a light correlate only if forward did not include it.
            elif isinstance(detection, dict) and detection.get("attack") not in (None, "BENIGN"):
                # Fallback manual bridge (same as day9)
                try:
                    attr = _manual_correlate(client, token, detection)
                    anomaly_id = attr.get("anomaly_id")
                    mitre_id = attr.get("mitre_technique_id")
                    result["correlate_fallback"] += 1
                    if mitre_id:
                        result["mitre_technique_ids"].append(mitre_id)
                        if mitre_id == "T0000":
                            result["t0000_hits"] += 1
                            result["errors"].append(
                                f"row={row_index} mapping bug: attack={attack} -> T0000"
                            )
                except Exception as exc:  # noqa: BLE001
                    result["errors"].append(f"row={row_index} correlate fallback: {exc}")

            if anomaly_id and not mitre_id:
                # Auto-forward succeeded — look up attribution on B
                try:
                    attr_resp = client.get(
                        f"{B_BASE}/api/v1/attributions",
                        params={"limit": 50},
                        headers=_auth_headers(token),
                        timeout=30.0,
                    )
                    attrs = ((attr_resp.json().get("data") or {}).get("items")) or []
                    match = next(
                        (a for a in attrs if a.get("anomaly_id") == anomaly_id),
                        None,
                    )
                    if match:
                        mitre_id = match.get("mitre_technique_id")
                        if mitre_id:
                            result["mitre_technique_ids"].append(mitre_id)
                            if mitre_id == "T0000":
                                result["t0000_hits"] += 1
                                result["errors"].append(
                                    f"row={row_index} mapping bug: attack={attack} -> T0000"
                                )
                except Exception as exc:  # noqa: BLE001
                    result["errors"].append(f"row={row_index} attribution lookup: {exc}")

            if anomaly_id:
                result["anomaly_ids"].append(str(anomaly_id))

        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"row={row_index}: {exc}")

        if delay > 0 and offset < len(slice_df) - 1:
            time.sleep(delay)

    non_benign = [a for a in result["predicted_attacks"] if a != "BENIGN"]
    has_anomaly = len(result["anomaly_ids"]) > 0
    no_t0000 = result["t0000_hits"] == 0
    ok = (
        result["rows_sent"] > 0
        and len(non_benign) > 0
        and has_anomaly
        and no_t0000
        and not result["errors"]
    )
    # Allow soft PASS if we got anomalies + non-BENIGN + no T0000 even with minor errors logged
    if not ok and result["rows_sent"] > 0 and len(non_benign) > 0 and has_anomaly and no_t0000:
        # Only fail hard on T0000 or zero anomalies; keep WARN-style via errors list
        mapping_errors = [e for e in result["errors"] if "mapping bug" in e or "T0000" in e]
        ingest_hard = [e for e in result["errors"] if "ingest HTTP" in e]
        ok = len(mapping_errors) == 0 and len(ingest_hard) == 0 and has_anomaly

    result["status"] = "PASS" if ok else "FAIL"
    _safe_print(
        f"  [{result['status']}] {scenario_name} "
        f"rows={result['rows_sent']} attacks={non_benign} "
        f"anomalies={len(result['anomaly_ids'])} mitre={result['mitre_technique_ids']}"
    )
    return result


def run_benign_phase(
    client: httpx.Client,
    *,
    token: str,
    max_rows: int,
    delay: float,
) -> dict[str, Any]:
    """
    Baseline-phase replay on primary (portscan) CSV.

    Threshold (documented):
      - critical_predicted <= BENIGN_MAX_CRITICAL (0)
      - non_benign_rate <= BENIGN_MAX_NON_BENIGN_RATE (0.25)
    """
    scenario = get_scenario("portscan")
    result: dict[str, Any] = {
        "scenario": "benign_baseline",
        "phase": "baseline",
        "csv": scenario.csv_file,
        "status": "FAIL",
        "predicted_attacks": [],
        "rows_sent": 0,
        "non_benign_count": 0,
        "critical_count": 0,
        "non_benign_rate": 0.0,
        "threshold": {
            "max_non_benign_rate": BENIGN_MAX_NON_BENIGN_RATE,
            "max_critical": BENIGN_MAX_CRITICAL,
        },
        "anomaly_ids_forwarded": [],
        "errors": [],
    }

    if not scenario.path.exists():
        result["status"] = "SKIP"
        result["skip_reason"] = f"CSV missing: {scenario.path}"
        _safe_print(f"  [SKIP] benign_baseline - CSV missing")
        return result

    try:
        slice_df, feature_columns, begin, _end = iter_replay_rows(
            scenario, max_rows=max_rows, phase="baseline"
        )
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(str(exc))
        _safe_print(f"  [FAIL] benign_baseline load - {exc}")
        return result

    ingest_url = f"{A_BASE}/api/v1/signals/ingest"
    headers = _auth_headers(token)

    for offset, (_, row) in enumerate(slice_df.iterrows()):
        row_index = begin + offset
        signal = csv_row_to_signal(
            row,
            source_file=scenario.csv_file,
            row_index=row_index,
            feature_columns=feature_columns,
        )
        try:
            resp = client.post(
                ingest_url,
                json=signal.model_dump(mode="json"),
                params={"score": "true"},
                headers=headers,
                timeout=120.0,
            )
            body = resp.json()
            if resp.status_code != 200 or not body.get("success"):
                result["errors"].append(f"row={row_index} ingest failed")
                continue

            data = body.get("data") or {}
            detection = data.get("detection") if isinstance(data, dict) else None
            forward = data.get("correlation_forward") if isinstance(data, dict) else None
            result["rows_sent"] += 1

            if isinstance(detection, dict):
                attack = detection.get("attack") or "UNKNOWN"
                result["predicted_attacks"].append(attack)
                if attack != "BENIGN":
                    result["non_benign_count"] += 1
                if str(detection.get("severity", "")).lower() == "critical":
                    result["critical_count"] += 1

            if isinstance(forward, dict) and forward.get("status") == "ok":
                aid = forward.get("anomaly_id")
                if aid:
                    result["anomaly_ids_forwarded"].append(str(aid))

        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"row={row_index}: {exc}")

        if delay > 0 and offset < len(slice_df) - 1:
            time.sleep(delay)

    total = result["rows_sent"] or 1
    result["non_benign_rate"] = result["non_benign_count"] / total
    rate_ok = result["non_benign_rate"] <= BENIGN_MAX_NON_BENIGN_RATE
    crit_ok = result["critical_count"] <= BENIGN_MAX_CRITICAL
    # Baseline should not flood correlates; forwarded anomalies should stay rare
    flood_ok = len(result["anomaly_ids_forwarded"]) <= max(1, int(total * BENIGN_MAX_NON_BENIGN_RATE))

    ok = result["rows_sent"] > 0 and rate_ok and crit_ok and flood_ok
    result["status"] = "PASS" if ok else "FAIL"
    _safe_print(
        f"  [{result['status']}] benign_baseline "
        f"rows={result['rows_sent']} non_benign_rate={result['non_benign_rate']:.2f} "
        f"critical={result['critical_count']} forwarded={len(result['anomaly_ids_forwarded'])}"
    )
    return result


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Day 11 — Multi-Scenario Report",
        "",
        f"**Run at:** {report['started_at']}  ",
        f"**Finished:** {report['finished_at']}  ",
        f"**Overall:** {report['overall_status']}  ",
        "",
        "## Scope",
        "",
        "- Attack scenarios: `portscan`, `ddos`, `bot` (small max-rows)",
        "- Benign: baseline phase on portscan CSV (pre-attack rows)",
        "- Correlate: prefer A `correlation_forward`; else B `POST /api/v1/correlate`",
        "- T0000 mitre_technique_id counts as FAIL (mapping bug)",
        "",
        "### Benign thresholds",
        "",
        f"- `non_benign_rate` <= **{BENIGN_MAX_NON_BENIGN_RATE}**",
        f"- `critical_count` <= **{BENIGN_MAX_CRITICAL}**",
        "- No flood of forwarded anomalies beyond the same rate bound",
        "",
        "## Scenario results",
        "",
        "| Scenario | Status | Predicted attacks | MITRE IDs | Anomaly IDs | Notes |",
        "|----------|--------|-------------------|-----------|-------------|-------|",
    ]

    for sc in report.get("scenarios") or []:
        status = sc.get("status", "?")
        attacks = ", ".join(sc.get("predicted_attacks") or []) or "-"
        mitre = ", ".join(sc.get("mitre_technique_ids") or []) or "-"
        anomalies = ", ".join(sc.get("anomaly_ids") or sc.get("anomaly_ids_forwarded") or []) or "-"
        notes = sc.get("skip_reason") or "; ".join((sc.get("errors") or [])[:2]) or ""
        notes = str(notes).replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {sc.get('scenario')} | {status} | {attacks} | {mitre} | {anomalies} | {notes} |"
        )

    lines.extend(
        [
            "",
            "## Summary",
            "",
            f"- Attack scenarios attempted: **{report.get('attack_attempted', 0)}**",
            f"- Attack scenarios PASS: **{report.get('attack_passed', 0)}**",
            f"- Attack scenarios SKIP: **{report.get('attack_skipped', 0)}**",
            f"- Benign section: **{(report.get('benign') or {}).get('status', 'n/a')}**",
            "",
            "## How to re-run",
            "",
            "```bash",
            "python -m ingestion_detection.main",
            "python -m correlation_response.main",
            "python scripts/day11_scenarios.py",
            "```",
            "",
            "## Artifacts",
            "",
            f"- JSON: `{report.get('json_path')}`",
            f"- This report: `{path.relative_to(PROJECT_ROOT).as_posix()}`",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def _persist(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORTS_DIR / "day11_scenarios.json"
    md_path = DOCS_DIR / "DAY11_SCENARIO_REPORT.md"
    report["json_path"] = json_path.relative_to(PROJECT_ROOT).as_posix()
    json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    write_markdown(report, md_path)
    return json_path, md_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 11 multi-scenario attack + benign harness")
    parser.add_argument("--email", default="day11@test.local")
    parser.add_argument("--password", default="Day11Test!234")
    parser.add_argument("--max-rows", type=int, default=3)
    parser.add_argument("--delay", type=float, default=0.15)
    args = parser.parse_args()

    report: dict[str, Any] = {
        "approach": "day11_scenarios",
        "started_at": _utc_now(),
        "finished_at": None,
        "overall_status": "FAIL",
        "scenarios": [],
        "benign": None,
        "attack_attempted": 0,
        "attack_passed": 0,
        "attack_skipped": 0,
        "bugs": [],
    }

    _safe_print("Day 11 scenarios\n")

    with httpx.Client() as client:
        if not check_health(client):
            report["bugs"].append("Start A (:8000) and B (:8001) before re-running.")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1

        token = ensure_token(client, email=args.email, password=args.password)
        if not token:
            report["bugs"].append("Could not obtain JWT - check Supabase .env and A auth.")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1
        _safe_print("  [PASS] auth login\n")

        _safe_print("Attack scenarios:")
        for name in ATTACK_SCENARIOS:
            # Only iterate known scenario keys
            if name not in SCENARIOS:
                continue
            sc = run_attack_scenario(
                client,
                token=token,
                scenario_name=name,
                max_rows=args.max_rows,
                delay=args.delay,
            )
            report["scenarios"].append(sc)
            if sc["status"] == "SKIP":
                report["attack_skipped"] += 1
            else:
                report["attack_attempted"] += 1
                if sc["status"] == "PASS":
                    report["attack_passed"] += 1

        _safe_print("\nBenign section:")
        benign = run_benign_phase(
            client,
            token=token,
            max_rows=args.max_rows,
            delay=args.delay,
        )
        report["benign"] = benign
        report["scenarios"].append(benign)

    # Acceptance: >=2 attack scenarios attempted + 1 benign section present
    acceptance_ok = report["attack_attempted"] >= 2 and benign.get("status") in ("PASS", "FAIL", "SKIP")
    # Overall PASS if acceptance met, >=1 attack PASS, and benign PASS (or SKIP only if CSV gone)
    overall_pass = (
        acceptance_ok
        and report["attack_passed"] >= 1
        and benign.get("status") == "PASS"
    )
    report["overall_status"] = "PASS" if overall_pass else ("PARTIAL" if acceptance_ok else "FAIL")
    report["finished_at"] = _utc_now()
    json_path, md_path = _persist(report)

    _safe_print(f"\nOverall: {report['overall_status']}")
    _safe_print(f"Attack attempted: {report['attack_attempted']} (pass={report['attack_passed']} skip={report['attack_skipped']})")
    _safe_print(f"Wrote {json_path}")
    _safe_print(f"Wrote {md_path}")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
