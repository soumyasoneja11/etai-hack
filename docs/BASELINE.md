# Baseline profiling

The detection service learns **normal network behavior per entity** from pre-attack traffic. New events are scored by how far they deviate from that baseline.

## Goal

Build baselines **before** the attack window starts. If attack traffic is included in the baseline, anomaly scores will look artificially low.

## Primary demo scenario

| Setting | Value |
|---------|--------|
| Scenario key | `portscan` |
| CSV | `Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv` |
| Baseline rows | `0`–`1462` (BENIGN only) |
| Attack starts | row `1463` |

Rows at or after the attack start index are **never** used for baselines.

## All scenarios

| Scenario | CSV | First attack row | Baseline rows |
|----------|-----|------------------|---------------|
| portscan (primary) | Friday-WorkingHours-Afternoon-PortScan | 1463 | 0–1462 |
| ddos | Friday-WorkingHours-Afternoon-DDos | 18883 | 0–18882 |
| bot | Friday-WorkingHours-Morning | 24072 | 0–24071 |

## Entity identifier

CICIDS2017 flow CSVs do **not** include source/destination IP addresses. The pipeline uses a surrogate asset key:
