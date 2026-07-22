-- ============================================================
-- CyberShield NIC — Combined Migrations (001-007)
-- ============================================================
-- Paste this entire file into the Supabase SQL Editor
-- (Dashboard -> SQL -> New query) to apply all migrations at once.
--
-- All statements use IF NOT EXISTS and DROP POLICY IF EXISTS guards
-- so this script is completely IDEMPOTENT (safe to re-run).
-- ============================================================

-- ====== 001_create_tables.sql ======
-- ============================================================
-- CyberShield NIC — Supabase schema migration
-- Tables: signals, anomalies, attributions
-- RLS: per-user isolation; admin sees everything
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Signals (replaces in-memory SignalQueue)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id           TEXT UNIQUE NOT NULL,
    asset_id            TEXT,
    detected_at         TIMESTAMPTZ,
    received_at         TIMESTAMPTZ DEFAULT now(),
    source_file         TEXT NOT NULL,
    row_index           INTEGER NOT NULL,
    features            JSONB NOT NULL DEFAULT '{}',
    ground_truth_label  TEXT,
    detection           JSONB,           -- serialised DetectionResult
    user_id             UUID NOT NULL DEFAULT auth.uid()
);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- Admin: full access
DROP POLICY IF EXISTS signals_admin_all ON signals;
CREATE POLICY signals_admin_all ON signals
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- Regular user: can INSERT their own rows
DROP POLICY IF EXISTS signals_user_insert ON signals;
CREATE POLICY signals_user_insert ON signals
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Regular user: can SELECT only their own rows
DROP POLICY IF EXISTS signals_user_select ON signals;
CREATE POLICY signals_user_select ON signals
    FOR SELECT
    USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 2. Anomalies (replaces in-memory AnomalyStore)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS anomalies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id          TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    severity            TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status              TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'investigating', 'acknowledged', 'contained', 'false_positive')),
    asset_id            TEXT NOT NULL,
    detected_at         TIMESTAMPTZ NOT NULL,
    score               DOUBLE PRECISION NOT NULL,
    baseline_deviation  DOUBLE PRECISION DEFAULT 0,
    reason              TEXT,
    raw_signal_ref      TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    user_id             UUID NOT NULL DEFAULT auth.uid()
);

ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomalies_admin_all ON anomalies;
CREATE POLICY anomalies_admin_all ON anomalies
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

DROP POLICY IF EXISTS anomalies_user_insert ON anomalies;
CREATE POLICY anomalies_user_insert ON anomalies
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS anomalies_user_select ON anomalies;
CREATE POLICY anomalies_user_select ON anomalies
    FOR SELECT
    USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 3. Attributions (MITRE ATT&CK attributions linked to anomalies)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attributions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id          TEXT NOT NULL REFERENCES anomalies(anomaly_id) ON DELETE CASCADE,
    mitre_technique_id  TEXT NOT NULL,
    mitre_tactic        TEXT NOT NULL,
    technique_name      TEXT NOT NULL,
    matched_campaign    TEXT,
    confidence          DOUBLE PRECISION NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    user_id             UUID NOT NULL DEFAULT auth.uid()
);

ALTER TABLE attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attributions_admin_all ON attributions;
CREATE POLICY attributions_admin_all ON attributions
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

DROP POLICY IF EXISTS attributions_user_insert ON attributions;
CREATE POLICY attributions_user_insert ON attributions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS attributions_user_select ON attributions;
CREATE POLICY attributions_user_select ON attributions
    FOR SELECT
    USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 4. Indexes for common query patterns
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_signals_signal_id    ON signals(signal_id);
CREATE INDEX IF NOT EXISTS idx_signals_received_at  ON signals(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_user_id      ON signals(user_id);

CREATE INDEX IF NOT EXISTS idx_anomalies_anomaly_id  ON anomalies(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at ON anomalies(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_user_id     ON anomalies(user_id);

CREATE INDEX IF NOT EXISTS idx_attributions_anomaly_id ON attributions(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_attributions_user_id    ON attributions(user_id);


-- ====== 002_threat_intel.sql ======
-- Threat intelligence corpus seed table for CVE and CERT-In documents.
--
-- NOTE (Y6): This table is currently UNUSED by the application. The threat
-- intel code reads from `data/threat_intel/corpus.json` instead.  This
-- migration is kept for potential future use (e.g. Supabase-backed threat
-- intel search).  No application code queries this table as of 2026-07-22.

create table if not exists public.threat_intel_docs (
    doc_id text primary key,
    type text not null check (type in ('CVE', 'CERT-In')),
    title text not null,
    description text not null,
    severity text not null,
    cvss_score numeric,
    cvss_vector text,
    published_date date,
    source_url text,
    affected_software jsonb not null default '[]'::jsonb,
    attack_mapping jsonb not null,
    remediation text,
    cert_in_ref text,
    tags jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists threat_intel_docs_attack_label_idx
    on public.threat_intel_docs ((attack_mapping ->> 'cicids_label'));

create index if not exists threat_intel_docs_type_idx
    on public.threat_intel_docs (type);

create index if not exists threat_intel_docs_tags_gin_idx
    on public.threat_intel_docs using gin (tags);

-- ====== 003_audit_soar.sql ======
-- ============================================================
-- CyberShield NIC — Audit & SOAR tables (Day 8)
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Audit logs — every automated or human-approved action
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id        TEXT UNIQUE NOT NULL,
    anomaly_id      TEXT REFERENCES anomalies(anomaly_id) ON DELETE SET NULL,
    action_type     TEXT NOT NULL,
    actor           TEXT NOT NULL DEFAULT 'system',
    target          TEXT,
    decision        TEXT,
    status          TEXT NOT NULL DEFAULT 'success',
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    user_id         UUID NOT NULL DEFAULT auth.uid()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_all ON audit_logs;
CREATE POLICY audit_logs_admin_all ON audit_logs
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

DROP POLICY IF EXISTS audit_logs_user_insert ON audit_logs;
CREATE POLICY audit_logs_user_insert ON audit_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS audit_logs_user_select ON audit_logs;
CREATE POLICY audit_logs_user_select ON audit_logs
    FOR SELECT
    USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 2. SOAR action log — mock response actions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS soar_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id       TEXT UNIQUE NOT NULL,
    anomaly_id      TEXT REFERENCES anomalies(anomaly_id) ON DELETE SET NULL,
    action_type     TEXT NOT NULL CHECK (action_type IN (
        'isolate_endpoint', 'revoke_credential', 'block_ip'
    )),
    target          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'executed', 'failed', 'simulated'
    )),
    executed_at     TIMESTAMPTZ,
    message         TEXT,
    simulated       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    user_id         UUID NOT NULL DEFAULT auth.uid()
);

ALTER TABLE soar_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soar_actions_admin_all ON soar_actions;
CREATE POLICY soar_actions_admin_all ON soar_actions
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

DROP POLICY IF EXISTS soar_actions_user_insert ON soar_actions;
CREATE POLICY soar_actions_user_insert ON soar_actions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS soar_actions_user_select ON soar_actions;
CREATE POLICY soar_actions_user_select ON soar_actions
    FOR SELECT
    USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_audit_logs_anomaly_id  ON audit_logs(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);

CREATE INDEX IF NOT EXISTS idx_soar_actions_anomaly_id  ON soar_actions(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_soar_actions_created_at  ON soar_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_soar_actions_user_id     ON soar_actions(user_id);


-- ====== 004_anomaly_narrative.sql ======
-- 004_anomaly_narrative.sql
-- Persist analyst narratives on anomalies (no new table).
--
-- Run in Supabase SQL Editor (Dashboard → SQL → New query).
-- Do not commit secrets; this file is schema-only.

ALTER TABLE anomalies
    ADD COLUMN IF NOT EXISTS narrative JSONB;

COMMENT ON COLUMN anomalies.narrative IS
    'Persisted NarrativeResponse: {narrative, sources, generated_at}';


-- ====== 005_app_metadata_roles.sql ======
-- ============================================================
-- CyberShield NIC — P0-2 fix: read admin role from app_metadata
-- ============================================================
--
-- Roles were previously read from `user_metadata` (raw_user_meta_data), which
-- end users can rewrite themselves via `auth.updateUser({data:{...}})`, allowing
-- self-promotion to admin. Roles now live in `app_metadata` (settable only with
-- the service-role key), so the admin RLS policies must key off
-- `auth.jwt() -> 'app_metadata' ->> 'role'`.
--
-- Run this in the Supabase SQL Editor (or via the migration runner) AFTER
-- migrations 001–004. Existing admins must be re-provisioned so their role is
-- stored in app_metadata (e.g. via POST /api/v1/auth/make-admin, which now
-- writes app_metadata).
-- ============================================================

-- signals -----------------------------------------------------------------
DROP POLICY IF EXISTS signals_admin_all ON signals;
CREATE POLICY signals_admin_all ON signals
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- anomalies ---------------------------------------------------------------
DROP POLICY IF EXISTS anomalies_admin_all ON anomalies;
CREATE POLICY anomalies_admin_all ON anomalies
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- attributions ------------------------------------------------------------
DROP POLICY IF EXISTS attributions_admin_all ON attributions;
CREATE POLICY attributions_admin_all ON attributions
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- audit_logs --------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_admin_all ON audit_logs;
CREATE POLICY audit_logs_admin_all ON audit_logs
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- soar_actions ------------------------------------------------------------
DROP POLICY IF EXISTS soar_actions_admin_all ON soar_actions;
CREATE POLICY soar_actions_admin_all ON soar_actions
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );


-- ====== 006_anomaly_decision.sql ======
-- 006_anomaly_decision.sql
-- Persist the correlate-time decision recommendation on the anomaly (no new
-- table), so the authoritative decision computed during /correlate survives a
-- reload instead of only being recomputed by /decide.
--
-- Run in Supabase SQL Editor (Dashboard -> SQL -> New query).
-- Do not commit secrets; this file is schema-only.

ALTER TABLE anomalies
    ADD COLUMN IF NOT EXISTS decision JSONB;

COMMENT ON COLUMN anomalies.decision IS
    'Persisted DecisionResult from correlate-time: {decision, recommended_action, '
    'confidence, blast_radius, requires_human_approval, reasoning, playbook_id}';


-- ====== 007_anomaly_update_policy.sql ======
-- 007_anomaly_update_policy.sql
-- Add missing UPDATE RLS policy for the anomalies table.
--
-- The app calls .update() for:
--   1. update_status() during human review approve/reject
--   2. save_narrative() when persisting RAG narratives
-- Without this policy, regular users cannot update their own anomaly rows
-- through RLS.
--
-- Run in Supabase SQL Editor (Dashboard -> SQL -> New query).

-- Allow users to UPDATE their own anomaly rows
DROP POLICY IF EXISTS anomalies_user_update ON anomalies;
CREATE POLICY anomalies_user_update ON anomalies
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

