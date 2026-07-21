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
