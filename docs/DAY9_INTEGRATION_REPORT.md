# Day 9 — Integration Report

**Run at:** 2026-07-20T17:09:56.111788Z  
**Finished:** 2026-07-20T17:10:00.306652Z  
**Overall:** FAIL  
**Scenario:** PortScan (CICIDS2017)  
**Gemini:** optional (narrative uses template if `CORR_GEMINI_API_KEY` unset)

## Pipeline

```
Replay → Detect (A) → Correlate ATT&CK (B) → Narrative → Decide → Mock SOAR → Audit
```

## Step results

| Step | Result | Notes |
|------|--------|-------|
| A health | PASS | status=ok |
| B health | PASS | status=ok |
| auth signup | PASS |  |
| auth login | PASS | token_prefix=eyJhbGciOiJFUzI1... |
| replay PortScan -> A ingest | FAIL | [Errno 2] No such file or directory: 'E:\\etai-hack\\data\\Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv' |

## Bugs / follow-ups

- Replay ingest failed (auth header or model/features).

## Artifacts

- JSON: `reports/metrics/day9_integration.json`
- This report: `docs/DAY9_INTEGRATION_REPORT.md`

## How to re-run

```bash
# Terminal 1
python -m ingestion_detection.main
# Terminal 2
python -m correlation_response.main
# Terminal 3
python scripts/day9_integration.py
```
