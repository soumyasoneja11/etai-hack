# Data preprocessing

How raw CICIDS2017 CSVs are cleaned and prepared for model training.

**Run:** `python -m ingestion_detection.preprocess`

## Input

Place these files in `data/`:

- `Wednesday-workingHours.pcap_ISCX.csv`
- `Friday-WorkingHours-Morning.pcap_ISCX.csv`
- `Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv`
- `Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv`

## Pipeline steps

| Step | Action | Why |
|------|--------|-----|
| 1 | Strip column name whitespace | CICIDS2017 exports often have leading spaces |
| 2 | Drop duplicate rows | Duplicates skew training metrics |
| 3 | Coerce features to numeric | Mixed types break ML libraries |
| 4 | Replace ±inf → NaN → 0 | Invalid values break models |
| 5 | Merge all CSVs | Single training dataset |
| 6 | Label-encode attack types | Models need numeric targets |
| 7 | Stratified 80/20 train/test split | Preserves class balance (`random_state=42`) |

## Outputs

| Path | Description |
|------|-------------|
| `data/processed/X_train.parquet` | Training features |
| `data/processed/X_test.parquet` | Test features |
| `data/processed/y_train.parquet` / `y_test.parquet` | Encoded labels |
| `data/processed/preprocess_stats.json` | Row counts and label map |
| `ingestion_detection/models/feature_order.json` | Feature order for `/api/v1/predict` |
| `ingestion_detection/models/label_mapping.json` | Label name ↔ id |

## Labels in the dataset

`BENIGN`, `PortScan`, `DDoS`, `Bot`, `DoS Hulk`, `DoS GoldenEye`, `DoS slowloris`, `DoS Slowhttptest`, `Heartbleed`

## API usage

- **`POST /api/v1/predict`** — pass `features` as a **list** in `feature_order.json` order.
- **Ingest / replay** — pass `features` as a **dict** (name → value); the service maps to the same order internally.

## Related

Baseline profiling (separate from train/test split) is documented in [BASELINE.md](./BASELINE.md).