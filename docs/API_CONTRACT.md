# API Contract — CyberShield NIC aligned

**Frozen schema:** [`docs/CyberShield_NIC_API_Schema.xlsx`](./CyberShield_NIC_API_Schema.xlsx)  
**Code types:** [`shared/schemas.py`](../shared/schemas.py)  
**Response envelope:** [`shared/envelope.py`](../shared/envelope.py)

Base URL (production): `https://api.cybershield-nic.in/api/v1`  
Local A service: `http://127.0.0.1:8000/api/v1`

---

## Standard response envelope (all A endpoints)

```json
{
  "success": true,
  "data": { },
  "error": null,
  "meta": {
    "timestamp": "2026-07-06T12:00:00Z",
    "request_id": "uuid"
  }
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "NOT_FOUND", "message": "..." },
  "meta": { "timestamp": "...", "request_id": "..." }
}
```

---

## A-owned endpoints

### `POST /api/v1/signals/ingest`

Ingest one network flow (replay or live adapter).

**Request**

```json
{
  "signal_id": null,
  "asset_id": "dst-80-win-255",
  "detected_at": "2026-07-06T12:00:00Z",
  "source_file": "Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
  "row_index": 1500,
  "features": { "Destination Port": 80, "Flow Duration": 38308 },
  "ground_truth_label": "PortScan"
}
```

| Field | CyberShield rule | Notes |
|-------|------------------|-------|
| `signal_id` | `*_id` UUID | Optional; server generates |
| `asset_id` | `*_id` | Maps from `entity_id` / surrogate host key |
| `detected_at` | `*_at` ISO UTC | Optional |
| `features` | snake_case keys | Full CICIDS2017 feature dict |
| `ground_truth_label` | — | Replay/eval only |

**Query:** `?score=true` (default) — run ML + baseline on ingest.

**Response `data`**

```json
{
  "signal_id": "uuid",
  "status": "received",
  "detection": {
    "signal_id": "uuid",
    "asset_id": "dst-80-win-255",
    "detected_at": "...",
    "attack": "PortScan",
    "confidence": 94.2,
    "anomaly_score": 0.87,
    "baseline_deviation": 0.65,
    "severity": "critical",
    "title": "Port Scan Activity",
    "reason": "PortScan"
  }
}
```

`detection` omitted if model not trained or `score=false`.

**Legacy alias:** `POST /api/v1/events/ingest` (same behavior, accepts old `FlowEventIn`).

---

### `POST /api/v1/predict`

Guide for A §8 — ordered feature vector.

**Request**

```json
{
  "features": [80, 38308, 1, 1, 6, 6]
}
```

Feature order: `ingestion_detection/models/feature_order.json` (78 columns).

**Response `data`**

```json
{
  "attack": "PortScan",
  "confidence": 94.2,
  "predicted_label": "PortScan",
  "anomaly_score": 0.94
}
```

---

## Mapping A → CyberShield B endpoints

A's `DetectionResult` maps to B's anomaly records:

| A (`DetectionResult`) | CyberShield (`/anomalies`) |
|-----------------------|----------------------------|
| `signal_id` | `raw_signal_ref` |
| `asset_id` | `asset_id` |
| `detected_at` | `detected_at` |
| `anomaly_score` | `score` |
| `baseline_deviation` | `baseline_deviation` |
| `reason` / `attack` | `reason` |
| `title` | `title` |
| `severity` | `severity` (`low\|medium\|high\|critical`) |

B assigns `anomaly_id` and `status` (`new` initially). WebSocket `anomaly.created` uses list-item shape.

---

## Primary demo scenario

| Item | Value |
|------|-------|
| Scenario | `portscan` |
| CSV | `Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv` |
| Baseline rows | 0–1462 (BENIGN, pre-attack) |
| Replay from | row 1463+ |
| Backups | `ddos`, `bot` |

---

## Enums (from Excel)

- `severity`: `low`, `medium`, `high`, `critical`
- `anomaly_status`: `new`, `investigating`, `acknowledged`, `contained`, `false_positive`
- `threat_posture`: `nominal`, `elevated`, `high`, `critical` — `/dashboard/summary`
- `audit_agent`: `analyst`, `ml_engine`, `orchestrator` — `/audit-trail` (`analyst` = human SOC; not `human`/`user`)

See [`shared/enums.py`](../shared/enums.py). Full list: **Enums & Status Codes** sheet. `error.code` strings: **Error Responses** sheet.

---

## B-owned shapes (from Excel — latest)

### `GET /attributions/{attribution_id}`

Includes **`narrative`** (string) — AI-generated plain-English threat summary for the dashboard explain panel.

### `GET /audit-trail`

Each item includes **`actor_id`**, **`actor_name`** (specific analyst/system), plus **`agent`** (enum category).

### Pagination

`limit` and `offset` are **optional** (defaults: 20, 0). Omitting them returns **200** with the first page — not 400.

---

## B / C&D sign-off

- [ ] B: `DetectionResult` → `POST /correlate` on port 8001
- [ ] B: persist as `GET /anomalies` items
- [ ] C&D: mock data uses envelope + field names above
