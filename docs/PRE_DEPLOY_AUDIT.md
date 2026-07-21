# Pre-Deployment Audit — CyberShield NIC (`etai-hack`)

**Last updated:** 2026-07-22 (re-scan #3)
**Commit at scan:** `2cebca9` (PR #9 merged into the release line)
**Scope:** Full codebase — `ingestion_detection/` (A, :8000), `correlation_response/` (B, :8001), `shared/`, `frontend/` (Next.js 16), `scripts/`, `supabase_migrations/`, CI.
**Target hosts:** Frontend → **Vercel** (native Next build); both backends → **Render** (Docker or native); Supabase (managed).
**Method:** Static scan of the committed tree + endpoint cross-check (FE ↔ B) + git verification. `pytest` was **not** re-run in this pass (see "End-to-end status").

---

## Verdict

**The backend is deployable once env + migrations are set correctly; the frontend is NOT demo-ready.** There are no code-level boot-blockers — both services start even when the model or DB is absent (A reports 503, does not crash; all external clients are lazy). The blocking problems are (1) the **default landing screen renders 100% fabricated data in real mode**, (2) an **incomplete migration checklist**, and (3) **localhost defaults** that break every cross-service hop once the pieces live on different hosts.

- **Backend:** production-grade auth/RLS/scoping, signup gating, CORS, model-gated health. Deployable with correct config.
- **Frontend:** the Overview tab (the first screen a user sees) shows fake numbers with `NEXT_PUBLIC_USE_MOCK_API=false`; the screens actually wired to the live backend aren't in the nav.

---

## RESOLVED since last audit (verified in `2cebca9`)

| Was | Status | Evidence |
|-----|--------|----------|
| `model.joblib` git-ignored (needed a volume mount) | **FIXED** | `model.joblib` (12 MB) + `baseline_profiles.json` now committed (`git ls-files ingestion_detection/models/`); ignore rules removed from `.gitignore` |
| Docker CI job failing (first run after lint went green) | **REMOVED** | `docker:` job deleted from `.github/workflows/ci.yml` — not used by Vercel/Render; CI now = backend + frontend only |
| Multi-tenant isolation / privilege escalation / open signup / mock-by-default / JWT hardening / CORS / host binding / error envelope / read-failure surfacing | **FIXED (still holding)** | `shared/auth.py` `_role_from_payload` (app_metadata only, `:183`); `require_scoped`/`ScopedContext` across B; stores filter by `user_id`; signup invite-gated + rate-limited (`ingestion_detection/main.py:188`); `shared/cors.py` env-driven |

---

## STILL OPEN

### P0 — Deploy blockers (must fix before go-live)

**P0-1. Overview tab (default landing) is 100% fake in real mode — never gated by `IS_MOCK_MODE`.**
`OverviewScreen()` (`frontend/src/app/dashboard/page.tsx:427-648`) makes **zero** backend calls and renders dummy constants unconditionally:
- `DASHBOARD_METRICS` ("12,847 assets", "23 Live Threats", "97.3% AI Confidence", MTTD 4.2 min) — `page.tsx:486-519` → `dummy-data.ts:6-22`
- `SPARKLINE_DATA`, `THREAT_SEVERITY`, `BEHAVIOR_TIMELINE`, `NETWORK_ACTIVITY` (random) — `page.tsx:490-576`
- `THREAT_ORIGINS` world map, `ATTACK_TIMELINE`, `THREAT_FEED` — `page.tsx:592-628` → `dummy-data.ts:59-227`

The two screens actually wired to the live backend (`threat-monitor` → `/anomalies`, `topology` → `/graph`) are **not in the nav** (`constants.ts:42-59`). *Fix:* wire Overview to real `/audit`/`/anomalies`/`/graph`, or gate each panel behind live data and surface the real screens in nav.

**P0-2. Migration checklist is incomplete — `/correlate` + review will 500.**
Migrations `001`–`007` all exist, but code requires the later ones the old checklist omitted:
- `006_anomaly_decision.sql` — `correlation_response/supabase_store.py:93` inserts a `decision` column; missing → `/api/v1/correlate` insert error.
- `007_anomaly_update_policy.sql` — RLS UPDATE policy for `anomalies`; missing → review approve/reject + `save_narrative()` blocked.
- `004_anomaly_narrative.sql` — `narrative` JSONB column.
**Apply all of `001`–`007`.** (`005` re-asserts admin RLS via `app_metadata`; `002` `threat_intel_docs` is unused — see P2.)

**P0-3. Localhost defaults break every cross-host hop.** None of these can use their defaults in prod:
- **Vercel:** `NEXT_PUBLIC_API_BASE_URL` → B's public URL (default `http://127.0.0.1:8001`, `api-client.ts:34`); `SUPABASE_URL` + `SUPABASE_ANON_KEY` server-side or `/api/auth/login` returns 500 (`api/auth/login/route.ts:31-36`).
- **Render service A:** `CORRELATION_BASE_URL` → B's public URL (default localhost, `ingestion_detection/config.py:14`) or A→B forwarding silently errors on every detection.
- **Both backends:** `CORS_ALLOWED_ORIGINS` → the Vercel origin(s) (default `localhost:3000`, `shared/cors.py:21`; both use `allow_credentials=True`) or the browser blocks all calls.

### P1 — Should fix before a credible demo

**P1-1. Fake `cs_live_` API key + hardcoded identity in Settings (never gated).**
`ProfileSettingsScreen()` (`page.tsx:1869-2098`): `apiKey = "cs_live_7a9f82d1c6e4530b12fd9a764b8a"` (`:1877`), "Regenerate" builds a random `cs_live_` string client-side, hardcoded "Vikram Singh / admin@cybershield.gov.in / +91…", non-persisting MFA/timeout toggles, and a "Changes saved successfully" toast with no API call. Ships a real-looking secret. *Fix:* remove the fake key; wire toggles to a real endpoint or remove them.

**P1-2. Root-level error boundaries missing.** `error.tsx`/`global-error.tsx`/`not-found.tsx` exist only under `app/dashboard/`, not `app/`. A runtime crash on `/`, `/auth/login`, or any non-dashboard route falls through to Next's generic error page (white screen).

**P1-3. Render free-tier memory.** `WEB_CONCURRENCY=2` (`Dockerfile:43`, `deploy/gunicorn_conf.py:22`) loads the 12.7 MB LightGBM model **per worker** (`predict.py:32` `@lru_cache`) on top of pandas/sklearn/lightgbm — OOM risk on 512 MB. *Fix:* set `WEB_CONCURRENCY=1` on free tier.

**P1-4. Model/scikit-learn provenance.** Model pickled with scikit-learn 1.7.0 vs a newer runtime → `InconsistentVersionWarning` (silent behavior drift). Pin sklearn identically between train and serve. A bad/missing model only surfaces at runtime as `/health` 503 — no build-time provenance check.

### P2 — Cleanup / hardening

- **Orphaned pure-dummy routes** — `dashboard/ai-agents/page.tsx` (`AI_AGENTS`) and `dashboard/assets/page.tsx` (`ASSET_INVENTORY` + `cs_live_`, "1–10 of 12,847") are unreachable from nav; delete or wire.
- **Dummy fallbacks leak into real tabs** — Audit falls back to `AUDIT_LOGS` on empty/error (`page.tsx:273`); topology → `FALLBACK_GRAPH_DATA` (`page.tsx:266,283`); notifications bell always uses dummy `NOTIFICATIONS` (`TopNavbar.tsx:17`); Quick Scan is a `setTimeout` stub.
- **`middleware.ts` → `proxy.ts`** — Next 16 renamed the convention; current file still works but emits a deprecation warning on build.
- **`world-atlas` external CDN** — `WorldThreatMap.tsx:11` fetches `cdn.jsdelivr.net/...countries-110m.json` at runtime; breaks in air-gapped/CSP-locked networks. Vendor locally if the map stays.
- **No `render.yaml`** — both Render services wired manually: start command `gunicorn <module>:app -c deploy/gunicorn_conf.py` (override to `correlation_response.main:app` for B), health check `/health`, env per P0-3/P1. Note A's `/health` is model-gated 503; B's is unconditional 200.
- **Gunicorn worker class deprecated (non-blocking)** — `uvicorn.workers.UvicornWorker` (`gunicorn_conf.py:21`) is deprecated since uvicorn 0.30 but still imports on the pinned 0.35.0. Switching to `uvicorn-worker` needs uvicorn ≥ 0.36.
- **Dead code / drift** — `ingestion_detection/queue_store.py` unused; `snapshot_vm` in `shared/enums.py` (+ `003` CHECK) has no handler; `threat_intel_docs` table (`002`) is never queried (code reads `data/threat_intel/corpus.json`). NB: `correlation_response/store.py` (cited dead in the prior audit) **no longer exists**.
- **Data bootstrap** — CICIDS CSVs + baselines are git-ignored; the **API boots fine** (needs only the committed `model.joblib` + `baseline_profiles.json`), but replay/`day9_integration.py`/baseline-building are non-functional on a clean checkout. Document where to place `data/*.csv`.

---

## Deployment checklist (go-live)

**Supabase**
- [ ] Apply migrations **`001`–`007`** to the target project (not just `001`–`004`).
- [ ] Provision the first admin via service-role (`app_metadata.role = admin`); keep signup closed (blank `SIGNUP_INVITE_TOKEN`) or set an invite token.

**Backends on Render (2 services, same repo/image, different start command)**
- [ ] Service A start: `gunicorn ingestion_detection.main:app -c deploy/gunicorn_conf.py`; Service B: `correlation_response.main:app`.
- [ ] Set on **both**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, JWKS/JWT config (`SUPABASE_JWKS_URL` **or** `SUPABASE_JWT_SECRET`+`SUPABASE_JWT_ALGORITHMS=HS256`), `CORS_ALLOWED_ORIGINS`=Vercel origin, `WEB_CONCURRENCY=1`, `PORT`.
- [ ] Set on **A only**: `CORRELATION_BASE_URL`=B's public URL, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; never a `NEXT_PUBLIC_` var).
- [ ] Health check path `/health`; verify A returns **200 (not 503)** on boot (model loaded).
- [ ] If native build fails LightGBM (`libgomp.so.1`), switch that service to the Docker build (Dockerfile installs `libgomp1`).

**Frontend on Vercel**
- [ ] `NEXT_PUBLIC_USE_MOCK_API=false` (build fails otherwise), `NEXT_PUBLIC_API_BASE_URL`=B's public URL, `SUPABASE_URL`+`SUPABASE_ANON_KEY` (server-side).
- [ ] Resolve P0-1: Overview/Settings must not render fabricated data to live users.

**Release gate**
- [ ] `pytest -q` green on the release commit.
- [ ] Click-path check: landing → login → dashboard shows only backed data.

---

## End-to-end status

- FE ↔ B endpoint cross-check: **all** real-mode frontend calls map to real routes in `correlation_response/main.py` — `/anomalies`, `/graph`, `/audit`, `/review/{queue,approve,reject}`, `/narrative/*`, `/soar/{isolate,block,revoke}`, `/threat-intel/*`. No call targets a missing route.
- A→B forwarding is best-effort and never blocks ingest (`correlation_forward.py`); ingest returns 200 even if B is down.
- Auth/RLS scoping, signup gating, and JWT hardening verified statically and still hold.
- The **real-data** click-path works only on threat-monitor/topology/alerts/audit — which are not the landing screen — so "works end-to-end from a user's clicks" is **not** true until P0-1 is fixed.
- `pytest` not re-run in this pass; run it on the release commit to confirm the prior "62 passed" still holds.

---

## Severity summary (current)

| Priority | Count | Theme |
|----------|-------|-------|
| P0 | 3 | Fake default landing screen; incomplete migrations (006/007); localhost cross-host defaults |
| P1 | 4 | Fake `cs_live_` key + Settings; missing root error boundaries; free-tier `WEB_CONCURRENCY`; sklearn/model provenance |
| P2 | ~8 | Orphaned dummy routes, dummy fallbacks, middleware→proxy, world-atlas CDN, no render.yaml, deprecated worker class, dead code/drift, data bootstrap |

**Bottom line:** the backend + integration layer are solid and deployable with correct env and the full `001`–`007` migration set. The pre-launch work is almost entirely on the **frontend showing only real data** (starting with the default Overview tab) and on **deploy configuration** (env, migrations, free-tier tuning) — not on core code correctness.
