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
CREATE POLICY signals_admin_all ON signals
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- Regular user: can INSERT their own rows
CREATE POLICY signals_user_insert ON signals
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Regular user: can SELECT only their own rows
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

CREATE POLICY anomalies_admin_all ON anomalies
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY anomalies_user_insert ON anomalies
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

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

CREATE POLICY attributions_admin_all ON attributions
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY attributions_user_insert ON attributions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

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
