# Pre-Deployment Audit — CyberShield NIC (`etai-hack`)

**Last updated:** 2026-07-21 (re-scan #2)
**Scope:** Full codebase — `ingestion_detection/` (A, :8000), `correlation_response/` (B, :8001), `shared/`, `frontend/` (Next.js), `scripts/`, `supabase_migrations/`, CI/Docker.
**Method:** Static scan + verified against a live `pytest` run and current `git` history.

---

## Verdict

**End-to-end happy path works and the project is close to deployable.** Since the first audit, the team resolved every P0 and nearly all P1 items (commits `efb3d6a`, `66b4540`, `78a1a08`, `e829247`, `ca49511`, `a6153c9`, `f636fff`).

- `pytest` → **62 passed, 1 skipped** (auth, RLS scoping, privilege, signup gating, envelope, tactic casing, model readiness, CORS, logging, read-failure).
- CI (`.github/workflows/ci.yml`): backend lint+tests, frontend lint+build (mock off), Docker image builds.
- Docker: root `Dockerfile`, `frontend/Dockerfile` (standalone), `docker-compose.yml`.

**Remaining before a real production launch:** mostly frontend "fake data" panels, secret/model operational hygiene, and a few cleanups. No open **P0**. Details below.

---

## RESOLVED since first audit (verified)

| Was | Status | Evidence |
|-----|--------|----------|
| Multi-tenant isolation OFF (service-role everywhere) | **FIXED** | `shared/supabase_client.py` `get_supabase_user()` forwards caller JWT; `ScopedContext.db` + `require_scoped` used across `correlation_response/main.py`; stores filter by `user_id` + accept scoped `client` (`supabase_store.py`) |
| Privilege escalation via `user_metadata` | **FIXED** | `shared/auth.py` `_role_from_payload` reads `app_metadata` only |
| Open, unthrottled signup | **FIXED** | `ingestion_detection/main.py` signup gated by `signup_invite_token` (closed if unset) + per-IP/email sliding-window limiter |
| Frontend mock-by-default | **FIXED** | `api-client.ts` `?? "false"`; CI builds with `NEXT_PUBLIC_USE_MOCK_API=false` |
| `requirements.txt` missing lightgbm/joblib | **FIXED** | Fully pinned lock incl. `lightgbm==4.6.0`, `joblib`, `pyarrow`, `openpyxl`, `gunicorn` |
| Silent model-not-ready degrade | **FIXED** | A `lifespan` loads model, marks UNHEALTHY (503) if missing; scored ingest returns 503 |
| MITRE tactic casing mismatch | **FIXED** | `66b4540`; `test_tactic_casing.py` passes |
| CORS hardcoded to localhost | **FIXED** | `shared/cors.py` env-driven `CORS_ALLOWED_ORIGINS` (wildcard rejected with credentials) |
| Host bound to 127.0.0.1 (A) | **FIXED** | Both services default `0.0.0.0`, env-driven `HOST`/`PORT` |
| Error envelope flattened codes | **FIXED** | `_STATUS_TO_CODE` maps 401/403/404/422/429/503 |
| Silent read-failure empty 200 | **FIXED** | `StoreUnavailableError` → 503 handler; `test_read_failure.py` |
| JWT alg/issuer/JWKS-rotation gaps | **FIXED** | `shared/auth.py`: explicit algs, issuer check, TTL+kid-miss JWKS refetch, leeway; HS256 supported |
| FE JWT in sessionStorage, no refresh | **FIXED** | In-memory access token + httpOnly refresh cookie; `app/api/auth/{login,refresh}/route.ts` |
| No `/dashboard` auth guard | **FIXED** | `frontend/src/middleware.ts` + `dashboard/layout.tsx` `ensureAuth()` |
| No tests / Docker / CI / `.env.example` | **FIXED** | `tests/` suite, `.github/workflows/ci.yml`, Dockerfiles, root + `frontend/.env.example` |
| A→B handoff manual | **FIXED** | `ingestion_detection/correlation_forward.py` auto-forwards non-BENIGN |
| Narrative not persisted | **FIXED** | `004_anomaly_narrative.sql` + store persistence |

---

## STILL OPEN

### P1 — should fix before a credible production/customer demo

**P1-1. Dashboard is full of hardcoded dummy data (renders even in real mode).**
These will show fabricated numbers to a live user:
- Overview metrics/gauges — `DASHBOARD_METRICS` (`frontend/src/app/dashboard/page.tsx:422,439`)
- World threat map — `THREAT_ORIGINS` + external CDN `world-atlas` (`components/dashboard/charts/WorldThreatMap.tsx:11`) → also **fails in air-gapped/CSP-locked** networks
- Threat feed — `THREAT_FEED` (`page.tsx:564`)
- Digital Twin — client-side sim (`page.tsx:335,1383`)
- AI Agents — `AI_AGENTS` (`ai-agents/page.tsx:5`)
- Assets — `ASSET_INVENTORY`, fake "12,847 assets" (`assets/page.tsx`)
- Settings — hardcoded `cs_live_...` API key + non-persisting toggles (`page.tsx:1811,1823`)

*Fix:* gate each panel on live data; hide/deactivate panels with no backend; remove the fake API key.

**P1-2. Secrets & model are operational externalities not enforced by the repo.**
- Real `.env` must carry `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) — ensure it lives only server-side, never in a `NEXT_PUBLIC_` var.
- `model.joblib` is git-ignored (correct) but there is **no artifact provenance/versioning** in deploy; a bad/missing model only surfaces at runtime (503). Document how the model is shipped into the image/volume.
- `InconsistentVersionWarning`: model pickled with scikit-learn 1.7.0, runtime has 1.9.0 → pin sklearn consistently between train and serve to avoid silent behavior drift.

### P2 — cleanup / hardening

- **Orphaned duplicate routes** — `dashboard/{threat-monitor,topology,ai-agents,assets}/page.tsx` are unreachable from nav (`constants.ts` only uses `?tab=`); they duplicate the tabbed screens and will drift. Remove or wire them.
- **Root-level error boundaries missing** — `error.tsx`/`loading.tsx`/`not-found.tsx` exist only under `app/dashboard/`, not `app/`. A crash outside the dashboard white-screens.
- **Test deps not in the lock** — `pytest`/`ruff` are installed ad-hoc (CI does `pip install pytest ruff`; local venv lacked pytest). Add a `[project.optional-dependencies].dev` group so `pip install -e .[dev]` is reproducible.
- **Dead code / dead enum** — `ingestion_detection/queue_store.py`, `correlation_response/store.py` unused; `snapshot_vm` in `shared/enums.py` (+ `003` CHECK) has no handler.
- **`threat_intel_docs` table unused** — code reads `data/threat_intel/corpus.json`; migration `002` is schema drift. Wire it or drop it (one source of truth).
- **Correlate-time `decision` not persisted** — only `/decide` audits it; a reload loses the correlate-time decision (no decisions table).
- **Data bootstrap undocumented** — CICIDS CSVs + baselines are git-ignored, so replay/baseline/`day9_integration.py` are non-functional on a clean checkout. Document where to place `data/*.csv` and how to build baselines.
- **`starlette.testclient` deprecation warning** — harmless now; keep an eye on the httpx/starlette pin.

---

## Deployment checklist (go-live)

- [ ] Set real `.env` from `.env.example`; confirm `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- [ ] Set `CORS_ALLOWED_ORIGINS` to the real frontend origin(s) — no wildcard.
- [ ] Build frontend with `NEXT_PUBLIC_USE_MOCK_API=false` and correct `NEXT_PUBLIC_API_BASE_URL` (B's public URL).
- [ ] Ship `model.joblib` into the backend image/volume; verify `/health` is 200 (not 503) on boot.
- [ ] Apply migrations `001`–`004` to the target Supabase project.
- [ ] Provision the first admin via service-role (`app_metadata.role=admin`), keep signup closed (blank invite token) or set an invite token.
- [ ] Confirm `pytest -q` and both Docker images build in CI on the release commit.
- [ ] Decide/hide the dummy panels (P1-1) so the live UI shows only backed data.
- [ ] Load CICIDS CSVs + build baselines if replay/scenarios are part of the demo.

---

## Severity summary (current)

| Priority | Count | Theme |
|----------|-------|-------|
| P0 | 0 | — (all previously-open P0 resolved) |
| P1 | 2 | Dummy-data panels in live UI; secret/model operational hygiene |
| P2 | ~7 | Orphaned routes, root error boundaries, dev-deps, dead code, table drift, decision persistence, data bootstrap |

**Bottom line:** backend + integration are production-grade after the recent hardening; the main pre-launch work is making the **frontend show only real data** and tightening deployment/secret/model operations.
