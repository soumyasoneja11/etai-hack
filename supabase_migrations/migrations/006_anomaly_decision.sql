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
