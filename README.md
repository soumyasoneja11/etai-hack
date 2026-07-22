# etai-hack — CyberShield NIC

AI-powered SOC dashboard: CICIDS2017 replay → ML detection → MITRE ATT&CK → Neo4j → dashboard.

## Quick start (Role A)

```bash
pip install -e .

python scripts/eda.py                          # EDA
python -m ingestion_detection.preprocess       # clean + split
python -m ingestion_detection.train            # train LightGBM (~5 min)
python -m ingestion_detection.baseline.builder # pre-attack baselines
python -m ingestion_detection.main             # API :8000
python -m correlation_response.main            # API :8001
python scripts/day9_integration.py             # Day 9 A→B pipeline + report
python scripts/day11_scenarios.py              # Day 11 portscan/ddos/bot + benign
```

### Smoke: live A→B correlate (no replay_to_correlate)

With A on `:8000`, B on `:8001`, and `AUTH_TOKEN` set to a valid Supabase JWT:

```bash
# 1) Ingest one PortScan attack row (A forwards non-BENIGN detections to B)
python -m ingestion_detection.replay.replay --scenario portscan --max-rows 1 --token "$AUTH_TOKEN"

# 2) Confirm anomaly landed on B without running replay_to_correlate
curl -s -H "Authorization: Bearer $AUTH_TOKEN" \
  "http://127.0.0.1:8001/api/v1/anomalies?limit=5" | python -m json.tool
```

Ingest response `data.correlation_forward` should be `{"status":"ok","anomaly_id":"..."}`.
Env knobs on A: `CORRELATION_BASE_URL`, `CORRELATION_FORWARD_ENABLED` (default true),
`CORRELATION_FORWARD_TIMEOUT_SEC` (default 10). Ingest still returns 200 if B is down.

## Documentation

| Doc | Description |
|-----|-------------|
| [API_CONTRACT.md](docs/API_CONTRACT.md) | CyberShield-aligned schemas |
| [CyberShield_NIC_API_Schema.xlsx](docs/CyberShield_NIC_API_Schema.xlsx) | Team API source of truth |
| [DAY9_INTEGRATION_REPORT.md](docs/DAY9_INTEGRATION_REPORT.md) | Day 9 end-to-end integration results |
| [DAY11_SCENARIO_REPORT.md](docs/DAY11_SCENARIO_REPORT.md) | Day 11 multi-scenario (portscan/ddos/bot + benign) |
| [PREPROCESSING.md](docs/PREPROCESSING.md) | Data cleaning steps |
| [BASELINE.md](docs/BASELINE.md) | Baseline profiling rules |
| [THRESHOLDS.md](docs/THRESHOLDS.md) | Day 6 threshold evidence |

## Repo layout

```
ingestion_detection/   # A — ingest + ML (port 8000)
correlation_response/  # B — ATT&CK + Neo4j (port 8001)
shared/                # API schemas, auth, envelope
scripts/               # EDA, eval harness, threshold + contract smokes
data/                  # CICIDS2017 CSVs + processed/ + threat_intel/
reports/               # Generated EDA + metrics artifacts
docs/                  # Contracts, plans, ML docs
tests/fixtures/        # Golden A→B payloads
supabase_migrations/migrations/   # DB schema
```

### Supabase migrations

Apply **all** SQL files in order via the Supabase SQL Editor (Dashboard → SQL). Schema-only; no secrets.
A combined file is also available at `scripts/apply_migrations_combined.sql` for one-shot apply.

| File | Purpose |
|------|---------|
| `001_create_tables.sql` | signals, anomalies, attributions + RLS |
| `002_threat_intel.sql` | threat intel corpus table (currently unused — see note in file) |
| `003_audit_soar.sql` | audit_logs, soar_actions |
| `004_anomaly_narrative.sql` | `anomalies.narrative` JSONB (persisted RAG text) |
| `005_app_metadata_roles.sql` | Re-keys admin RLS to `app_metadata` (prevents self-promotion) |
| `006_anomaly_decision.sql` | `anomalies.decision` JSONB (correlate-time recommendation) |
| `007_anomaly_update_policy.sql` | UPDATE RLS policy for anomalies (review approve/reject) |

> **Important:** Apply `001`–`007` in order. Skipping `006`/`007` will cause `/correlate` and review endpoints to fail.

### Admin provisioning

After applying migrations and creating a user (via the login page or Supabase Auth API), promote them to admin:

```sql
-- Run in Supabase SQL Editor with service-role key
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'your-admin@example.com';
```

A full template is at `scripts/provision_admin.sql`. Keep signup closed (blank `SIGNUP_INVITE_TOKEN`) or set an invite token.

## Backend data bootstrap

### What's committed (API boots without CSVs)

The API only needs these committed artifacts to start and serve predictions:

| Artifact | Path | Size |
|----------|------|------|
| LightGBM model | `ingestion_detection/models/model.joblib` | ~12.7 MB |
| Baseline profiles | `ingestion_detection/models/baseline_profiles.json` | ~271 KB |
| Feature order | `ingestion_detection/models/feature_order.json` | ~1.7 KB |
| Label mapping | `ingestion_detection/models/label_mapping.json` | ~450 B |
| Threat intel corpus | `data/threat_intel/corpus.json` | ~22 KB |

No CICIDS2017 CSVs are needed for the API to boot, serve `/health` 200, or process ingest requests.

### CICIDS2017 CSVs (for replay / retraining only)

Place these four files in `data/` (git-ignored):

- `Wednesday-workingHours.pcap_ISCX.csv`
- `Friday-WorkingHours-Morning.pcap_ISCX.csv`
- `Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv`
- `Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv`

Download from the [CICIDS2017 dataset](https://www.unb.ca/cic/datasets/ids-2017.html) or copy from a teammate.

### Rebuild / retrain workflow

```bash
pip install -e .

# 1. EDA (optional — generates plots in reports/)
python scripts/eda.py

# 2. Preprocess: clean, merge, feature matrix, train/test split
python -m ingestion_detection.preprocess
# → creates data/processed/{X_train,X_test,y_train,y_test}.parquet

# 3. Train: Random Forest + LightGBM, saves best model
python -m ingestion_detection.train
# → saves ingestion_detection/models/model.joblib
# → saves ingestion_detection/models/model_provenance.json

# 4. Build baselines (PortScan BENIGN rows)
python -m ingestion_detection.baseline.builder
# → saves ingestion_detection/models/baseline_profiles.json
```

## Model results

- **Best model:** LightGBM (`ingestion_detection/models/model.joblib`)
- **Test accuracy:** 99.90% | **Macro F1:** 97.81%
- **Primary demo:** PortScan scenario (`--scenario portscan`)
