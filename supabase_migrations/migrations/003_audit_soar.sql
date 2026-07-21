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

CREATE POLICY audit_logs_admin_all ON audit_logs
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY audit_logs_user_insert ON audit_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

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
        'isolate_endpoint', 'revoke_credential', 'block_ip', 'snapshot_vm'
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

CREATE POLICY soar_actions_admin_all ON soar_actions
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY soar_actions_user_insert ON soar_actions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

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
