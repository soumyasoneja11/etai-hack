# Dataset (local only — not in Git)

Place the four CICIDS2017 CSV files here:

- `Wednesday-workingHours.pcap_ISCX.csv`
- `Friday-WorkingHours-Morning.pcap_ISCX.csv`
- `Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv`
- `Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv`

Download from the [CICIDS2017 dataset](https://www.unb.ca/cic/datasets/ids-2017.html) or copy from a teammate.

After adding files:

```bash
pip install -e .
python scripts/eda.py
python -m ingestion_detection.baseline.builder
```
