# Thresholds (Day 6 — Approach A)

Evidence-only analysis. **Production constants were not changed.**

## Current production rules

### Severity (`shared/enums.py` → `severity_from_confidence`)

| Condition | Severity |
|-----------|----------|
| `attack == BENIGN` | low |
| `confidence >= 90` | critical |
| `confidence >= 75` | high |
| `confidence >= 50` | medium |
| else | low |

### ML anomaly score (`ingestion_detection/predict.py`)

- BENIGN → `anomaly_score = 0.0`
- Attack → `anomaly_score = min(confidence / 100, 1.0)`

### Baseline (`ingestion_detection/baseline/builder.py` → `z_score_anomaly`)

- Score = `min(mean(|z|) / 3.0, 1.0)`
- Unknown entity → `1.0`

### Combined detection score (`detect_signal`)

- `max(ml_anomaly_score, baseline_deviation) when attack != BENIGN; else baseline_deviation`

## Evidence (held-out test set)

- Rows scored: **246,433**
- Chart: `reports/metrics/score_distributions.png`
- Machine report: `reports/metrics/threshold_report.json`

### Separation (ML anomaly_score)

- Metric: **ml_anomaly_score**
- BENIGN p95: **0.0**
- Attack p5: **0.9999991077298186**
- Gap (attack p5 − BENIGN p95): **0.9999991077298186**
- Well separated: **True**

- True attacks with confidence ≥ 90 (critical band): **99.91195165784174%**
- True BENIGN with anomaly_score > 0: **0.09539884053716886%**

## Decision

- Keep current constants: **True**
- ml_anomaly_score cleanly separates BENIGN (≈0) from attacks on the held-out test set; ~99.9% of true attacks land in the critical severity band (confidence ≥ 90). Keep severity bands 50/75/90 and baseline z/3.0 unchanged.

## How to regenerate

```bash
python scripts/threshold_analysis.py
python scripts/threshold_analysis.py --baseline-sample 5000
```
