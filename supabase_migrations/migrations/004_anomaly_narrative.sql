-- 004_anomaly_narrative.sql
-- Persist analyst narratives on anomalies (no new table).
--
-- Run in Supabase SQL Editor (Dashboard → SQL → New query).
-- Do not commit secrets; this file is schema-only.

ALTER TABLE anomalies
    ADD COLUMN IF NOT EXISTS narrative JSONB;

COMMENT ON COLUMN anomalies.narrative IS
    'Persisted NarrativeResponse: {narrative, sources, generated_at}';
