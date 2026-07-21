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
CREATE POLICY anomalies_user_update ON anomalies
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
