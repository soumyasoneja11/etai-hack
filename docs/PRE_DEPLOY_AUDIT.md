# Pre-Deployment Audit — CyberShield NIC (`etai-hack`)

**Date:** 2026-07-21
**Scope:** Full codebase — `ingestion_detection/` (A, :8000), `correlation_response/` (B, :8001), `shared/`, `frontend/` (Next.js), `scripts/`, `supabase_migrations/`.
**Method:** Static scan + cross-check against running services and prior Day 9–11 integration runs.

---

## Verdict

**Happy path works end-to-end.** Login → replay PortScan → detect → correlate (T1046) → narrative → decide → mock SOAR → audit → dashboard all pass. Model artifact is present (`ingestion_detection/models/model.joblib`, ~12.7 MB), audit/SOAR persist after migration `003`, and Prompt 1–6 work has largely landed (`correlation_forward.py`, graph endpoint, `/review/*`, `day11_scenarios.py`, `004_anomaly_narrative.sql`, `/auth/login`).

**Not production-ready.** Serious multi-tenant security holes and no deployment tooling. Fix all **P0** before any shared/hosted deployment.

---

## P0 — Blockers (security; these compound into an unauthenticated data-exfil path)

### P0-1. Multi-tenant isolation is effectively OFF
Every store uses the **service-role key** (`get_supabase_admin()`), which bypasses RLS, and list queries do not filter by `user_id`.

- `shared/supabase_client.py` — `get_supabase_admin()` (service-role, bypasses RLS)
- `correlation_response/supabase_store.py` — `list_items()`, `list_attributions()` have no `.eq("user_id", ...)`
- `ingestion_detection/supabase_store.py` — `list_recent()`, `get()` unscoped

**Impact:** any authenticated user reads **all** users' anomalies, signals, audit, SOAR. RLS policies in `001_create_tables.sql` / `003_audit_soar.sql` never execute.

**Fix:** use a user-scoped Supabase client (forward the caller JWT so RLS applies) OR add explicit `user_id` filters on every read; reserve the service-role key for trusted server-only jobs.

### P0-2. Privilege escalation via user-writable `user_metadata`
- `shared/auth.py` — `require_admin` trusts `payload["user_metadata"]["role"] == "admin"`
- `ingestion_detection/main.py` — signup + make-admin write role into `user_metadata`

Supabase `user_metadata` (`raw_user_meta_data`) is editable by the user via `auth.updateUser({data:{...}})` → any user can self-promote to admin.

**Fix:** store role in `app_metadata` (admin-only), and make `require_admin` + RLS key off `auth.jwt() -> 'app_metadata'`.

### P0-3. Open, unthrottled signup with pre-confirmed accounts
- `ingestion_detection/main.py` — `POST /api/v1/auth/signup` is public, no rate limit / invite / CAPTCHA, sets `email_confirm: True`.

**Fix:** invite-gate or disable public signup for this internal SOC tool; add rate limiting.

### P0-4. Frontend ships in MOCK mode by default
- `frontend/src/lib/api-client.ts` — `NEXT_PUBLIC_USE_MOCK_API ?? "true"`.

`NEXT_PUBLIC_*` is inlined at **build time**; if the build environment doesn't set it to `false`, the deployed app serves fabricated data and never calls the backend.

**Fix:** set `NEXT_PUBLIC_USE_MOCK_API=false` in the build/CI environment; fail the build if unset for prod.

---

## P1 — Correctness / deploy blockers

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| P1-1 | `requirements.txt` missing `lightgbm`, `joblib` (and `pyarrow`, `openpyxl`). Model is LightGBM → `pip install -r requirements.txt` then load fails. | `requirements.txt` vs `pyproject.toml` | Align manifests; pick one source of truth; pin versions |
| P1-2 | Model-not-ready silently degrades: ingest catches `ModelNotReadyError`, returns 200 with no detection, no A→B forward. Fresh deploy detects nothing, no error. | `ingestion_detection/main.py`, `predict.py` | Fail loud on startup if model absent; health check should report model status |
| P1-3 | MITRE tactic casing mismatch: `label_to_mitre.json` stores Title Case (`"Discovery"`, `"Command and Control"`); `shared/enums.py` + `frontend/src/types/api.ts` are snake_case and omit those values. FE union never matches persisted data. | `correlate.py`, `enums.py`, `types/api.ts` | Normalize to snake_case at write time; add missing tactics |
| P1-4 | CORS hardcoded to `localhost:3000` with `allow_credentials=True`; real FE origin blocked in prod. | `ingestion_detection/main.py`, `correlation_response/main.py` | Env-driven allowed origins |
| P1-5 | Host binding inconsistent: A binds `127.0.0.1` (unreachable in container), B binds `0.0.0.0`. | `ingestion_detection/config.py`, `correlation_response/config.py` | Env-driven `HOST`/`PORT`; default `0.0.0.0` for containers |
| P1-6 | `is_configured` checks `supabase_secret_key`, but `get_supabase()` uses `supabase_publishable_key` → passes check yet fails at runtime. | `shared/supabase_config.py`, `supabase_client.py` | Validate the key actually used |
| P1-7 | JWT: only RS256/ES256, no issuer check; JWKS `lru_cache`d for process life (key rotation → permanent 401 until restart). Some Supabase projects use HS256. | `shared/auth.py` | Confirm signing alg; add issuer check + JWKS TTL/kid-miss refetch + clock-skew leeway |
| P1-8 | Frontend JWT in `sessionStorage` (XSS-readable); `refresh_token` discarded → sessions die ~1h mid-use. | `frontend/src/lib/api-client.ts` | Add refresh flow; consider more secure storage strategy |
| P1-9 | No auth guard on `/dashboard` (no `middleware.ts`/layout guard); in mock mode the whole console is open. | `frontend/src/app/dashboard/` | Add route guard / middleware redirect to `/auth/login` |

---

## P2 — Robustness / hygiene

- **Silent read failures return empty 200** — if Supabase is down, dashboard shows "no anomalies/audit" instead of an error (dangerous for a SOC tool). `supabase_store.py` (both), `audit.py`.
- **SOAR/audit write failures invisible** — `/soar/*` returns `200 "simulated"` even when nothing persisted. `correlation_response/audit.py`, `main.py`.
- **Error envelope flattens codes** — 401/403/503 all become `BAD_REQUEST`; FE can't distinguish auth failures to trigger re-login. Both `main.py`.
- **Dead code** — `ingestion_detection/queue_store.py`, `correlation_response/store.py` unused; `snapshot_vm` in `shared/enums.py` (and `003` CHECK) has no handler; unused imports in `ingestion_detection/main.py`. (`correlation_base_url` is now used by `correlation_forward.py`.)
- **`threat_intel_docs` table dead** — code reads `data/threat_intel/corpus.json` from disk; migration `002_threat_intel.sql` unused → schema drift. Pick one source.
- **Correlate-time `decision` not persisted** — only `/decide` audits it; reload loses the correlate-time decision. (Narrative *is* persisted via `004`.)
- **Frontend fake panels** likely to look bogus in prod: overview metrics/gauges/charts, world map (loads geography from external CDN `cdn.jsdelivr.net/npm/world-atlas` → fails in air-gapped/CSP-locked nets), Digital Twin (client-side sim), AI Agents, Assets ("12,847 assets"), Settings (hardcoded `cs_live_…` API key, non-persisting toggles).
- **Orphaned duplicate routes** — `/dashboard/threat-monitor|topology|ai-agents|assets` exist but nav only uses `?tab=`; they drift from the tabbed screens.
- **No route-level `error.tsx` / `loading.tsx` / `not-found.tsx`** → a render error white-screens the console.
- **TS smells** likely to trip strict CI: `Function` param type (`threat-monitor/page.tsx`), pervasive `any`, direct state mutation (`selectedAlert.status = ...` in `dashboard/page.tsx`), unused imports.
- **Accessibility basics** — icon-only buttons lack `aria-label`; sortable `<th>` use `onClick` without keyboard handlers; unlabeled search inputs / selects.

---

## Missing entirely (pre-deploy essentials)

- **No tests** — `tests/` holds only `fixtures/detection_result_portscan.json`. `scripts/*smoke*` are model-optional and manual. Zero coverage on auth, RLS scoping, stores, decision matrix, envelope mapping.
- **No Dockerfile / docker-compose / CI** — `.github/` absent; no container recipe; `frontend/next.config.ts` empty (no `output: "standalone"`).
- **No production ASGI config** — `uvicorn.run()` single-process, no workers/Gunicorn, no `$PORT` bind; `logging.basicConfig` only (no structured/JSON logs, no request-id correlation).
- **No root `.env.example`** — only `frontend/.env.example`. Required Supabase vars (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and optional `CORR_*` undocumented.
- **Data not in repo** — CICIDS CSVs + baselines are gitignored; replay/baseline are non-functional on a clean checkout. Document the data-bootstrap steps.

---

## What is already working (do not re-do)

- ML detection: LightGBM model present; PortScan predicted correctly; feature validation + edge-case handling.
- A→B: correlate → MITRE (T1046), narrative (template fallback, RAG sources), decide, mock SOAR, audit — all return 200 and persist (post `003`).
- Auto A→B forward after non-BENIGN ingest (`ingestion_detection/correlation_forward.py`).
- Graph endpoint (`GET /api/v1/graph`) and `/soar/*`, `/review/*`, `/audit` on B.
- Frontend: Bearer auth injection, `apiLogin` via GoTrue, `/auth/login` page, live audit fetch, anomalies `{items}` shape aligned, mitigation wired to `/soar/*` in real mode.
- Migrations `001`–`004` exist; `003`/`004` applied.

---

## Recommended fix order

1. **P0 security together** — user-scoped Supabase reads (respect RLS) or `user_id` filters; move role to `app_metadata`; gate signup; enforce `USE_MOCK_API=false` in build env.
2. **P1-1 / P1-2** — fix `requirements.txt`; make missing model a hard, visible failure.
3. **P1-3 / P1-4 / P1-5** — tactic casing + env-driven CORS/host so the real frontend works end-to-end.
4. **P2 + tooling** — honest empty/error states, error boundaries, Dockerfiles + ASGI workers + root `.env.example`, and a minimal pytest suite (auth, RLS scoping, decision, envelope).

---

## Severity summary

| Priority | Count | Theme |
|----------|-------|-------|
| P0 | 4 | Tenant isolation, priv-esc, open signup, mock-by-default |
| P1 | 9 | Deps, silent model degrade, contract casing, CORS/host/env, JWT, auth guard |
| P2 | ~10 | Silent failures, dead code, fake panels, TS/a11y hygiene |
| Missing | 5 | Tests, Docker/CI, ASGI/logging, env template, data bootstrap |
