"""
Day 9 — end-to-end integration harness.

Pipeline:
  health → signup/login → replay (A) → correlate (B) → narrative → decide → SOAR → audit

Requires A on :8000 and B on :8001. Gemini is optional (template narrative fallback).

Run:
    python scripts/day9_integration.py
    python scripts/day9_integration.py --max-rows 3 --email day9@test.local --password 'Day9Test!234'
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

from ingestion_detection.replay import replay as replay_mod  # noqa: E402

REPORTS_DIR = PROJECT_ROOT / "reports" / "metrics"
DOCS_DIR = PROJECT_ROOT / "docs"

A_BASE = "http://127.0.0.1:8000"
B_BASE = "http://127.0.0.1:8001"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _step(report: dict[str, Any], name: str, ok: bool, detail: Any = None, error: str | None = None) -> None:
    entry = {"name": name, "ok": ok, "at": _utc_now()}
    if detail is not None:
        entry["detail"] = detail
    if error:
        entry["error"] = error
    report["steps"].append(entry)
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}" + (f" - {error}" if error else ""))


def check_health(client: httpx.Client, report: dict[str, Any]) -> bool:
    ok_all = True
    for name, url in (("A health", f"{A_BASE}/health"), ("B health", f"{B_BASE}/health")):
        try:
            resp = client.get(url, timeout=10.0)
            body = resp.json()
            ok = resp.status_code == 200 and body.get("success") is True
            _step(report, name, ok, detail=body.get("data"), error=None if ok else f"HTTP {resp.status_code}")
            ok_all = ok_all and ok
        except Exception as exc:  # noqa: BLE001
            _step(report, name, False, error=str(exc))
            ok_all = False
    return ok_all


def ensure_token(
    client: httpx.Client,
    report: dict[str, Any],
    *,
    email: str,
    password: str,
) -> str | None:
    """Signup (ignore if exists) then login; return access_token."""
    try:
        signup = client.post(
            f"{A_BASE}/api/v1/auth/signup",
            json={"email": email, "password": password},
            timeout=30.0,
        )
        signup_ok = signup.status_code in (200, 400)  # 400 = already exists is fine
        _step(
            report,
            "auth signup",
            signup_ok,
            detail={"status_code": signup.status_code, "body": signup.json()},
            error=None if signup_ok else f"HTTP {signup.status_code}",
        )
    except Exception as exc:  # noqa: BLE001
        _step(report, "auth signup", False, error=str(exc))

    try:
        login = client.post(
            f"{A_BASE}/api/v1/auth/login",
            json={"email": email, "password": password},
            timeout=30.0,
        )
        body = login.json()
        token = (body.get("data") or {}).get("access_token")
        ok = login.status_code == 200 and bool(token)
        _step(
            report,
            "auth login",
            ok,
            detail={
                "status_code": login.status_code,
                "user": (body.get("data") or {}).get("user"),
                "token_prefix": (token[:16] + "...") if token else None,
            },
            error=None if ok else str(body.get("error") or login.text),
        )
        return token if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "auth login", False, error=str(exc))
        return None


def run_replay(report: dict[str, Any], *, token: str, max_rows: int, delay: float) -> bool:
    try:
        code = replay_mod.replay(
            ingest_url=f"{A_BASE}/api/v1/signals/ingest",
            scenario_name="portscan",
            delay_sec=delay,
            max_rows=max_rows,
            phase="attack",
            dry_run=False,
            score_on_ingest=True,
            token=token,
        )
        ok = code == 0
        _step(report, "replay PortScan -> A ingest", ok, detail={"max_rows": max_rows, "exit_code": code})
        return ok
    except Exception as exc:  # noqa: BLE001
        _step(report, "replay PortScan -> A ingest", False, error=str(exc))
        return False


def fetch_attack_detection(client: httpx.Client, token: str, report: dict[str, Any]) -> dict | None:
    try:
        resp = client.get(
            f"{A_BASE}/api/v1/signals",
            params={"limit": 20},
            headers=_auth_headers(token),
            timeout=30.0,
        )
        body = resp.json()
        items = (body.get("data") or {}).get("items") or []
        attack_item = None
        for item in items:
            det = item.get("detection") or {}
            if det.get("attack") and det.get("attack") != "BENIGN":
                attack_item = item
                break
        ok = resp.status_code == 200 and attack_item is not None
        _step(
            report,
            "fetch attack signal from A",
            ok,
            detail={
                "signals_fetched": len(items),
                "signal_id": (attack_item or {}).get("signal_id"),
                "attack": ((attack_item or {}).get("detection") or {}).get("attack"),
            },
            error=None if ok else "No non-BENIGN detection in recent signals",
        )
        return (attack_item or {}).get("detection") if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "fetch attack signal from A", False, error=str(exc))
        return None


def correlate(client: httpx.Client, token: str, detection: dict, report: dict[str, Any]) -> dict | None:
    try:
        resp = client.post(
            f"{B_BASE}/api/v1/correlate",
            headers=_auth_headers(token),
            json=detection,
            timeout=60.0,
        )
        body = resp.json()
        data = body.get("data") or {}
        ok = resp.status_code == 200 and body.get("success") and data.get("anomaly_id")
        _step(
            report,
            "B correlate -> MITRE + anomaly",
            bool(ok),
            detail={
                "anomaly_id": data.get("anomaly_id"),
                "mitre_technique_id": data.get("mitre_technique_id"),
                "mitre_tactic": data.get("mitre_tactic"),
                "technique_name": data.get("technique_name"),
                "decision": (data.get("decision") or {}).get("decision"),
            },
            error=None if ok else str(body.get("error") or resp.text),
        )
        return data if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "B correlate -> MITRE + anomaly", False, error=str(exc))
        return None


def narrative(client: httpx.Client, token: str, anomaly_id: str, report: dict[str, Any]) -> dict | None:
    try:
        resp = client.post(
            f"{B_BASE}/api/v1/narrative",
            headers=_auth_headers(token),
            json={"anomaly_id": anomaly_id},
            timeout=90.0,
        )
        body = resp.json()
        data = body.get("data") or {}
        text = data.get("narrative") or ""
        ok = resp.status_code == 200 and body.get("success") and bool(text)
        _step(
            report,
            "narrative (Gemini optional / template fallback)",
            ok,
            detail={
                "anomaly_id": data.get("anomaly_id"),
                "sources": data.get("sources"),
                "narrative_preview": text[:240] + ("..." if len(text) > 240 else ""),
            },
            error=None if ok else str(body.get("error") or resp.text),
        )
        return data if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "narrative (Gemini optional / template fallback)", False, error=str(exc))
        return None


def decide(client: httpx.Client, token: str, anomaly_id: str, report: dict[str, Any]) -> dict | None:
    try:
        resp = client.post(
            f"{B_BASE}/api/v1/decide",
            headers=_auth_headers(token),
            json={"anomaly_id": anomaly_id},
            timeout=30.0,
        )
        body = resp.json()
        data = body.get("data") or {}
        ok = resp.status_code == 200 and body.get("success") and data.get("decision")
        _step(
            report,
            "decide",
            bool(ok),
            detail={
                "decision": data.get("decision"),
                "recommended_action": data.get("recommended_action"),
                "blast_radius": data.get("blast_radius"),
                "requires_human_approval": data.get("requires_human_approval"),
            },
            error=None if ok else str(body.get("error") or resp.text),
        )
        return data if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "decide", False, error=str(exc))
        return None


def soar_isolate(
    client: httpx.Client,
    token: str,
    *,
    anomaly_id: str,
    asset_id: str,
    report: dict[str, Any],
) -> dict | None:
    try:
        resp = client.post(
            f"{B_BASE}/api/v1/soar/isolate",
            headers=_auth_headers(token),
            json={"anomaly_id": anomaly_id, "asset_id": asset_id},
            timeout=30.0,
        )
        body = resp.json()
        data = body.get("data") or {}
        ok = resp.status_code == 200 and body.get("success") and data.get("action_id")
        _step(
            report,
            "mock SOAR isolate",
            bool(ok),
            detail={
                "action_id": data.get("action_id"),
                "action_type": data.get("action_type"),
                "status": data.get("status"),
                "target": data.get("target"),
            },
            error=None if ok else str(body.get("error") or resp.text),
        )
        return data if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "mock SOAR isolate", False, error=str(exc))
        return None


def audit_trail(client: httpx.Client, token: str, anomaly_id: str, report: dict[str, Any]) -> list | None:
    try:
        resp = client.get(
            f"{B_BASE}/api/v1/audit/{anomaly_id}",
            headers=_auth_headers(token),
            timeout=30.0,
        )
        body = resp.json()
        data = body.get("data") or {}
        items = data.get("items") if isinstance(data, dict) else data
        if items is None:
            items = []
        http_ok = resp.status_code == 200 and body.get("success") is True
        populated = isinstance(items, list) and len(items) > 0
        # HTTP success with empty trail usually means audit_logs migration missing
        ok = http_ok  # endpoint reachable; emptiness tracked as bug below
        if http_ok and not populated:
            report.setdefault("bugs", []).append(
                "GET /api/v1/audit/{id} returned 0 entries — apply "
                "supabase_migrations/migrations/003_audit_soar.sql "
                "(tables audit_logs + soar_actions missing in Supabase)."
            )
        _step(
            report,
            "audit trail",
            ok,
            detail={
                "anomaly_id": anomaly_id,
                "entry_count": len(items) if isinstance(items, list) else 0,
                "persisted": populated,
            },
            error=None if ok else str(body.get("error") or resp.text),
        )
        return items if ok else None
    except Exception as exc:  # noqa: BLE001
        _step(report, "audit trail", False, error=str(exc))
        return None


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Day 9 — Integration Report",
        "",
        f"**Run at:** {report['started_at']}  ",
        f"**Finished:** {report['finished_at']}  ",
        f"**Overall:** {'PASS' if report['overall_pass'] else 'FAIL'}  ",
        f"**Scenario:** PortScan (CICIDS2017)  ",
        f"**Gemini:** optional (narrative uses template if `CORR_GEMINI_API_KEY` unset)",
        "",
        "## Pipeline",
        "",
        "```",
        "Replay → Detect (A) → Correlate ATT&CK (B) → Narrative → Decide → Mock SOAR → Audit",
        "```",
        "",
        "## Step results",
        "",
        "| Step | Result | Notes |",
        "|------|--------|-------|",
    ]
    for step in report["steps"]:
        result = "PASS" if step["ok"] else "FAIL"
        notes = step.get("error") or ""
        if not notes and isinstance(step.get("detail"), dict):
            d = step["detail"]
            bits = []
            for key in (
                "attack",
                "mitre_technique_id",
                "decision",
                "action_id",
                "entry_count",
                "narrative_preview",
                "token_prefix",
                "status",
            ):
                if key in d and d[key] is not None:
                    bits.append(f"{key}={d[key]}")
            notes = "; ".join(bits)
        notes = str(notes).replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {step['name']} | {result} | {notes} |")

    lines.extend(
        [
            "",
            "## Bugs / follow-ups",
            "",
        ]
    )
    bugs = report.get("bugs") or []
    if not bugs:
        lines.append("- None found during this run.")
    else:
        for bug in bugs:
            lines.append(f"- {bug}")

    lines.extend(
        [
            "",
            "## Artifacts",
            "",
            f"- JSON: `{report['json_path']}`",
            f"- This report: `{path.relative_to(PROJECT_ROOT).as_posix()}`",
            "",
            "## How to re-run",
            "",
            "```bash",
            "# Terminal 1",
            "python -m ingestion_detection.main",
            "# Terminal 2",
            "python -m correlation_response.main",
            "# Terminal 3",
            "python scripts/day9_integration.py",
            "```",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 9 full pipeline integration")
    parser.add_argument("--email", default="day9@test.local")
    parser.add_argument("--password", default="Day9Test!234")
    parser.add_argument("--max-rows", type=int, default=3)
    parser.add_argument("--delay", type=float, default=0.2)
    args = parser.parse_args()

    report: dict[str, Any] = {
        "approach": "day9_integration",
        "started_at": _utc_now(),
        "finished_at": None,
        "overall_pass": False,
        "steps": [],
        "bugs": [],
        "pipeline_ids": {},
    }

    print("Day 9 integration\n")

    with httpx.Client() as client:
        if not check_health(client, report):
            report["bugs"].append("Start A (:8000) and B (:8001) before re-running.")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1

        token = ensure_token(client, report, email=args.email, password=args.password)
        if not token:
            report["bugs"].append("Could not obtain JWT - check Supabase .env keys and signup/login.")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1

        if not run_replay(report, token=token, max_rows=args.max_rows, delay=args.delay):
            report["bugs"].append("Replay ingest failed (auth header or model/features).")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1

        # Brief pause so list endpoints see latest rows
        time.sleep(0.5)

        detection = fetch_attack_detection(client, token, report)
        if not detection:
            report["bugs"].append("No attack detection available after replay.")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1

        attribution = correlate(client, token, detection, report)
        if not attribution:
            report["bugs"].append("Correlate failed.")
            report["finished_at"] = _utc_now()
            _persist(report)
            return 1

        anomaly_id = attribution["anomaly_id"]
        asset_id = detection.get("asset_id") or "unknown"
        report["pipeline_ids"] = {
            "signal_id": detection.get("signal_id"),
            "anomaly_id": anomaly_id,
            "asset_id": asset_id,
            "mitre_technique_id": attribution.get("mitre_technique_id"),
        }

        narrative(client, token, anomaly_id, report)
        decide(client, token, anomaly_id, report)
        soar_isolate(client, token, anomaly_id=anomaly_id, asset_id=asset_id, report=report)
        audit_trail(client, token, anomaly_id, report)

    report["overall_pass"] = all(s["ok"] for s in report["steps"])
    report["finished_at"] = _utc_now()
    json_path, md_path = _persist(report)

    print(f"\nOverall: {'PASS' if report['overall_pass'] else 'FAIL'}")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0 if report["overall_pass"] else 1


def _persist(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORTS_DIR / "day9_integration.json"
    md_path = DOCS_DIR / "DAY9_INTEGRATION_REPORT.md"
    report["json_path"] = json_path.relative_to(PROJECT_ROOT).as_posix()
    json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    write_markdown(report, md_path)
    return json_path, md_path


if __name__ == "__main__":
    raise SystemExit(main())
