# CyberShield NIC — Change Log

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.2.1] — 2026-07-09

### Summary

Added a curated **CVE and CERT-In threat intelligence corpus** for the 7 CICIDS2017 demo attack types, and exposed it through the correlation service for richer anomaly attribution context.

---

### Added

#### Threat Intelligence Corpus
- New `data/threat_intel/corpus.json` seed containing 18 hand-picked CVE and CERT-In documents mapped to the 7 CICIDS2017 attack labels
- New `data/threat_intel/README.md` documenting the corpus schema, coverage, and extension workflow
- Corpus entries include CVE/CERT-In metadata such as severity, CVSS, published date, affected software, remediation guidance, and MITRE mapping

#### Correlation Enrichment
- [`correlation_response/correlate.py`](../correlation_response/correlate.py) now lazy-loads the corpus and resolves attack-label lookups case-insensitively
- Added grouped lookup support for `related_cves` and `cert_in_advisories` so responses can distinguish exploit records from CERT-In advisories
- [`correlation_response/main.py`](../correlation_response/main.py) enriches `POST /api/v1/correlate` responses with a `threat_intel` bundle

#### Threat Intel API
- Added `GET /api/v1/threat-intel/{attack_label}` for retrieving corpus matches by CICIDS attack label
- The endpoint returns 404 when no threat intel exists for the requested label

#### Optional Storage
- New `supabase/migrations/002_threat_intel.sql` creates a `threat_intel_docs` table for optional Supabase-backed querying and filtering

### Changed

- `POST /api/v1/correlate` now includes `related_cves`, `cert_in_advisories`, and a consolidated `threat_intel` payload in the attribution response
- Threat intel lookups now normalize attack labels before indexing, which makes the service tolerant of label casing differences

---

## [0.2.0] — 2026-07-09

### Summary

Integrated **Supabase** for user authentication (JWT) and persistent storage (Postgres), replacing the in-memory signal and anomaly stores. Added Row Level Security (RLS) so regular users only see their own data, while a master admin has access to everything. Neo4j remains unchanged for MITRE ATT&CK graph relationships.

---

### Added

#### Supabase Authentication
- JWT-based auth on all `/api/v1/*` endpoints using Supabase JWKS validation
- New auth endpoints on Service A (port 8000):
  | Endpoint | Method | Auth Required | Purpose |
  |---|---|---|---|
  | `/api/v1/auth/signup` | POST | No | Create a new user account |
  | `/api/v1/auth/login` | POST | No | Sign in → returns JWT access + refresh tokens |
  | `/api/v1/auth/refresh` | POST | No | Refresh an expired access token |
  | `/api/v1/auth/make-admin` | POST | Admin only | Promote a user to admin role |
- `/health` endpoints remain public (no auth) on both services
- Admin-only protection on `POST /api/v1/baseline/build`

#### Supabase Persistent Storage
- Three new Postgres tables replacing in-memory stores:
  | Table | Replaces | Purpose |
  |---|---|---|
  | `signals` | `ingestion_detection/queue_store.py` (in-memory `deque`) | Persisted signal ingestion data |
  | `anomalies` | `correlation_response/store.py` (in-memory `OrderedDict`) | Persisted anomaly records |
  | `attributions` | _(new)_ | MITRE ATT&CK attributions linked to anomalies |

#### Row Level Security (RLS)
- All three tables have RLS enabled
- **Admin** (`user_metadata.role = 'admin'`): full read/write access to all rows
- **Regular user**: can INSERT and SELECT only their own rows
- Each table has a `user_id` column (defaults to `auth.uid()`)

#### New Files
| File | Purpose |
|---|---|
| [`supabase/migrations/001_create_tables.sql`](../supabase/migrations/001_create_tables.sql) | SQL migration — tables, RLS policies, indexes |
| [`shared/supabase_config.py`](../shared/supabase_config.py) | Pydantic settings for Supabase env vars |
| [`shared/supabase_client.py`](../shared/supabase_client.py) | Singleton Supabase client (publishable + service-role) |
| [`shared/auth.py`](../shared/auth.py) | FastAPI JWT auth dependencies (`require_auth`, `require_admin`) |
| [`ingestion_detection/supabase_store.py`](../ingestion_detection/supabase_store.py) | Supabase-backed signal store |
| [`correlation_response/supabase_store.py`](../correlation_response/supabase_store.py) | Supabase-backed anomaly + attribution store |

### Changed

#### Service A — Ingestion & Detection (port 8000)
- [`ingestion_detection/main.py`](../ingestion_detection/main.py):
  - Swapped `signal_queue` (in-memory) → `signal_store` (Supabase-backed)
  - Added `Depends(require_auth)` on all `/api/v1/*` routes
  - Added `Depends(require_admin)` on `/api/v1/baseline/build`
  - Added 4 new auth endpoints (signup, login, refresh, make-admin)

#### Service B — Correlation & Response (port 8001)
- [`correlation_response/main.py`](../correlation_response/main.py):
  - Swapped in-memory `anomaly_store` → Supabase-backed `anomaly_store`
  - Added `Depends(require_auth)` on all `/api/v1/*` routes
  - Updated `anomaly_store.put()` call signature (now takes individual args instead of `StoredAnomaly`)

#### Dependencies
- [`requirements.txt`](../requirements.txt) — added `supabase>=2.0`, `python-jose[cryptography]>=3.3`
- [`pyproject.toml`](../pyproject.toml) — added same to `[project.dependencies]`

#### Environment
- [`.env`](../.env) — added `SUPABASE_SERVICE_ROLE_KEY`

### Unchanged
- **Neo4j** — graph loader, technique seeding, EXHIBITED relationships all unchanged
- **ML pipeline** — preprocessing, training, prediction logic untouched
- **Shared schemas** — all Pydantic models in `shared/schemas.py` remain the same
- **Old in-memory stores** — `queue_store.py` and `store.py` kept as reference (no longer imported)

---

### Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `CORR_NEO4J_URI` | Optional | Neo4j Aura connection URI |
| `CORR_NEO4J_USER` | Optional | Neo4j username |
| `CORR_NEO4J_PASSWORD` | Optional | Neo4j password |
| `SUPABASE_URL` | **Yes** | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | **Yes** | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | **Yes** | Supabase secret key |
| `SUPABASE_JWKS_URL` | **Yes** | Supabase JWKS endpoint for JWT validation |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service-role key (bypasses RLS) |

---

### Setup Instructions (for new contributors)

1. **Install dependencies**: `pip install -e .`
2. **Set up `.env`**: Copy all required Supabase keys from the Supabase dashboard
3. **Run SQL migration**: Paste `supabase/migrations/001_create_tables.sql` into Supabase SQL Editor and execute
4. **Start services**:
   ```bash
   python -m ingestion_detection.main    # Service A on :8000
   python -m correlation_response.main   # Service B on :8001
   ```
5. **Create admin account**:
   ```bash
   # Sign up
   curl -X POST http://127.0.0.1:8000/api/v1/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email": "you@example.com", "password": "yourpassword"}'

   # Promote to admin (via Supabase dashboard or python script)
   ```

---

### Admin Account

| Field | Value |
|---|---|
| Email | `admin@etai.com` |
| User ID | `bec15a6f-3245-4598-af55-cfe5062552b9` |
| Role | `admin` |
| Created | 2026-07-09 |

---

## [0.1.0] — Pre-Supabase

### Original Architecture
- In-memory signal queue (`deque`, max 10k items) — data lost on restart
- In-memory anomaly store (`OrderedDict`, max 10k items) — data lost on restart
- No authentication — all API endpoints publicly accessible
- Neo4j Aura for MITRE ATT&CK technique graph
- LightGBM ML model for traffic classification (99.9% accuracy)
- FastAPI services: A (ingestion/detection :8000), B (correlation/response :8001)
