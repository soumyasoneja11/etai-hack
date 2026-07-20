# Day 9 — Integration Report

**Run at:** 2026-07-20T15:25:58Z  
**Finished:** 2026-07-20T15:26:21Z  
**Overall:** PASS (pipeline hops)  
**Scenario:** PortScan (CICIDS2017)  
**Gemini:** not required — narrative used template fallback (`CORR_GEMINI_API_KEY` optional)

## Goal

One real event through:

```
Replay → Detect (A :8000) → Correlate ATT&CK (B :8001) → Narrative → Decide → Mock SOAR → Audit
```

## What we fixed for Day 9

| Change | Why |
|--------|-----|
| `ingestion_detection/replay/replay.py` — `--token` / `AUTH_TOKEN` | Ingest requires Bearer JWT |
| `correlation_response/replay_to_correlate.py` — `--token` / `AUTH_TOKEN` | Signals + correlate require Bearer JWT |
| `scripts/day9_integration.py` | One-command harness + JSON/MD reports |

## Pipeline IDs (this run)

| Field | Value |
|-------|-------|
| signal_id | `ebe0005a-cb05-4a9c-a411-79a65d92f657` |
| anomaly_id | `413b16c6-cfb4-4b5a-b3c0-e23c31087835` |
| asset_id | `dst-80-win-29200` |
| MITRE | **T1046** Network Service Discovery (Discovery) |
| decision | `auto_execute` → recommended `block_ip` |
| SOAR isolate action_id | `b61dc6bf-877a-4f03-bc1e-f310ddff862d` (status=`simulated`) |

## Step results

| Step | Result | Notes |
|------|--------|-------|
| A health | PASS | ingestion-detection ok |
| B health | PASS | correlation-response ok |
| auth signup | PASS | user already existed (400) — ok |
| auth login | PASS | JWT issued for `day9@test.local` |
| replay PortScan → A ingest | PASS | 3 rows; PortScan predicted correctly on attack row |
| fetch attack signal from A | PASS | attack=`PortScan` |
| B correlate → MITRE + anomaly | PASS | T1046 / Discovery |
| narrative | PASS | template narrative; RAG sources CVE-2020-25078, CVE-2023-20198, CIAD-2023-0076 |
| decide | PASS | `auto_execute`, blast_radius=0 |
| mock SOAR isolate | PASS | HTTP 200 simulated isolate |
| audit trail HTTP | PASS | endpoint reachable |
| audit trail **persistence** | FAIL (soft) | 0 rows — see bug below |

## Bug list (owner)

| # | Issue | Owner | Severity | Fix |
|---|-------|-------|----------|-----|
| 1 | Supabase missing `audit_logs` and `soar_actions` tables (PostgREST PGRST205). Decide/SOAR/narrative still return 200, but writes fail and audit GET is empty. | B / whoever owns DB | **High for dashboard audit UI** | Run `supabase_migrations/migrations/003_audit_soar.sql` in Supabase SQL Editor, then re-run harness |
| 2 | Frontend still on mocks / wrong port (Day 10) | C & D | Medium | Wire `USE_MOCK_API=false`, base URL `:8001`, Bearer token |

Structured server errors observed:

```
Could not find the table 'public.audit_logs' in the schema cache
Could not find the table 'public.soar_actions' in the schema cache
```

## What does / does not need Gemini

| Piece | Needs Gemini? |
|-------|----------------|
| LightGBM predict / ingest | No |
| MITRE correlate | No |
| Decide / mock SOAR | No |
| Template narrative | No |
| Fancy LLM narrative | Yes (optional) |

## Artifacts

- JSON: [`reports/metrics/day9_integration.json`](../reports/metrics/day9_integration.json)
- This report: [`docs/DAY9_INTEGRATION_REPORT.md`](DAY9_INTEGRATION_REPORT.md)
- Harness: [`scripts/day9_integration.py`](../scripts/day9_integration.py)

## How to re-run

```bash
# Terminal 1
python -m ingestion_detection.main

# Terminal 2
python -m correlation_response.main

# Terminal 3
python scripts/day9_integration.py
# or with token for manual replay:
# python -m ingestion_detection.replay.replay --scenario portscan --max-rows 5 --token <JWT>
# python -m correlation_response.replay_to_correlate --limit 5 --token <JWT>
```

## Verdict

**Day 9 core path works:** auth → replay → detect PortScan → correlate T1046 → narrative → decide → mock SOAR.

**Blocker for full audit demo:** apply migration `003_audit_soar.sql`, then re-run `python scripts/day9_integration.py` and confirm `audit trail` shows `persisted=true`.
