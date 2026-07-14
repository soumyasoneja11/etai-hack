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
python -m ingestion_detection.replay.replay --max-rows 20
```

## Documentation

| Doc | Description |
|-----|-------------|
| [API_CONTRACT.md](docs/API_CONTRACT.md) | CyberShield-aligned schemas |
| [CyberShield_NIC_API_Schema.xlsx](docs/CyberShield_NIC_API_Schema.xlsx) | Team API source of truth |
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
supabase/migrations/   # DB schema
```

## Model results

- **Best model:** LightGBM (`ingestion_detection/models/model.joblib`)
- **Test accuracy:** 99.90% | **Macro F1:** 97.81%
- **Primary demo:** PortScan scenario (`--scenario portscan`)
