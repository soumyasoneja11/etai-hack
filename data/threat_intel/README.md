# Threat Intelligence Corpus

A hand-picked collection of **18 CVE and CERT-In documents** tied to the CICIDS2017 demo attack types used by CyberShield NIC.

## Purpose

Enriches anomaly context with real-world threat intelligence — when the ML model detects an attack, the system can reference specific CVEs with CVSS scores, remediation steps, and CERT-In advisories.

## Coverage

| CICIDS Label | MITRE ID | CVEs | CERT-In | Total |
|---|---|---|---|---|
| Heartbleed | T1190 | CVE-2014-0160, CVE-2014-0224 | CIAD-2014-0076 | 3 |
| DDoS | T1498 | CVE-2018-5390, CVE-2019-11477 | CIAD-2023-0040 | 3 |
| DoS Hulk | T1499 | CVE-2011-3192 | — | 1 |
| DoS GoldenEye | T1499 | CVE-2014-0050 | — | 1 |
| DoS slowloris | T1499 | CVE-2007-6750 | CIAD-2019-0238 | 2 |
| DoS Slowhttptest | T1499 | CVE-2018-6389 | — | 1 |
| Bot | T1071 | CVE-2016-17564, CVE-2021-41773, CVE-2022-42475 | CIAD-2023-0012 | 4 |
| PortScan | T1046 | CVE-2020-25078, CVE-2023-20198 | CIAD-2023-0076 | 3 |
| **Total** | | **13** | **5** | **18** |

## Document Schema

Each document in `corpus.json` follows this structure:

```json
{
  "doc_id": "CVE-2014-0160",
  "type": "CVE | CERT-In",
  "title": "Human-readable title",
  "description": "Detailed description",
  "severity": "low | medium | high | critical",
  "cvss_score": 7.5,
  "cvss_vector": "CVSS vector string or null",
  "published_date": "YYYY-MM-DD",
  "source_url": "URL to NVD or CERT-In",
  "affected_software": ["List of affected products"],
  "attack_mapping": {
    "cicids_label": "CICIDS2017 attack label",
    "mitre_technique_id": "T-number",
    "mitre_tactic": "MITRE tactic name"
  },
  "remediation": "Recommended fix/mitigation",
  "cert_in_ref": "CERT-In advisory ID or null",
  "tags": ["searchable", "keywords"]
}
```

## How to Extend

1. Add new documents to `corpus.json` following the schema above
2. Ensure `attack_mapping.cicids_label` matches one of the labels in `shared/enums.py`
3. Validate with:
   ```bash
   python -c "import json; d=json.load(open('data/threat_intel/corpus.json')); print(f'{len(d)} docs, all valid')"
   ```

## API Access

- `GET /api/v1/threat-intel/{attack_label}` — returns matching CVEs/advisories
- `POST /api/v1/correlate` response includes `threat_intel` field with matched docs
