/**
 * CyberShield AI — Shared TypeScript Contract Types
 *
 * Source of truth: shared/schemas.py, shared/enums.py, shared/envelope.py
 * Convention: snake_case field names match the Python backend exactly.
 */

// ---------------------------------------------------------------------------
// Enums (matching shared/enums.py Literal unions)
// ---------------------------------------------------------------------------

/** Anomaly severity — matches `Severity` in shared/enums.py */
export type Severity = "low" | "medium" | "high" | "critical";

/** Anomaly lifecycle status — matches `AnomalyStatus` in shared/enums.py */
export type AnomalyStatus =
  | "new"
  | "investigating"
  | "acknowledged"
  | "contained"
  | "false_positive";

/** SOAR playbook action types — matches `ActionType` in shared/enums.py */
export type ActionType =
  | "isolate_endpoint"
  | "revoke_credential"
  | "block_ip"
  | "snapshot_vm";

/** Human review / SOAR action status — matches `ActionStatus` in shared/enums.py */
export type ActionStatus =
  | "pending"
  | "approved"
  | "escalated"
  | "rejected"
  | "executed"
  | "failed";

/** Decision engine output level — matches `DecisionLevel` in shared/enums.py */
export type DecisionLevel =
  | "auto_execute"
  | "recommend"
  | "alert_only"
  | "monitor";

/** SOAR execution status — matches `SOARStatus` in shared/enums.py */
export type SOARStatus = "pending" | "executed" | "failed" | "simulated";

/** MITRE ATT&CK tactic labels — matches `MitreTactic` in shared/enums.py.
 *  Canonical snake_case; kept in sync by tests/test_tactic_casing.py. */
export type MitreTactic =
  | "reconnaissance"
  | "resource_development"
  | "initial_access"
  | "execution"
  | "persistence"
  | "privilege_escalation"
  | "defense_evasion"
  | "credential_access"
  | "discovery"
  | "lateral_movement"
  | "collection"
  | "command_and_control"
  | "exfiltration"
  | "impact"
  | "unknown";

// ---------------------------------------------------------------------------
// Standard API Response Envelope (matching shared/envelope.py)
// ---------------------------------------------------------------------------

/** Metadata attached to every API response */
export interface ApiMeta {
  timestamp: string;
  request_id: string;
  /** Optional — present in paginated list responses */
  total_count?: number;
}

/** Error body within the envelope when `success` is false */
export interface ApiErrorBody {
  code: string;
  message: string;
}

/** Standard API response envelope — all REST responses are wrapped in this */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorBody | null;
  meta: ApiMeta;
}

// ---------------------------------------------------------------------------
// Anomaly Models (matching shared/schemas.py)
// ---------------------------------------------------------------------------

/** GET /anomalies list item — matches `AnomalyListItem` in schemas.py */
export interface AnomalyListItem {
  anomaly_id: string;
  title: string;
  severity: Severity;
  status: AnomalyStatus;
  asset_id: string;
  /** ISO-8601 UTC timestamp */
  detected_at: string;
  /** Anomaly score 0.0–1.0 */
  score: number;
  reason: string;
}

/** GET /anomalies list envelope data — matches B `success_response({ items, total, ... })` */
export interface AnomalyListResponse {
  items: AnomalyListItem[];
  total?: number;
  limit?: number;
  offset?: number;
}

/** GET /anomalies/{anomaly_id} detail — matches `AnomalyDetail` in schemas.py */
export interface AnomalyDetail {
  anomaly_id: string;
  title: string;
  description: string;
  severity: Severity;
  status: AnomalyStatus;
  asset_id: string;
  detected_at: string;
  score: number;
  baseline_deviation: number;
  reason: string;
  raw_signal_ref: string;
  /** Persisted analyst narrative (optional until POST /narrative) */
  narrative?: string | null;
  narrative_sources?: string[] | null;
  narrative_generated_at?: string | null;
}

/** POST/GET /narrative — matches `NarrativeResponse` in schemas.py */
export interface NarrativeResponse {
  anomaly_id: string;
  narrative: string;
  sources: string[];
  generated_at: string;
}

/** WebSocket anomaly.created payload — matches `AnomalyCreatedEvent` in schemas.py */
export interface AnomalyCreatedEvent {
  anomaly_id: string;
  title: string;
  severity: Severity;
  asset_id: string;
  detected_at: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Decision Engine (matching shared/schemas.py DecisionResult)
// ---------------------------------------------------------------------------

export interface DecisionResult {
  anomaly_id: string;
  recommended_action: ActionType | null;
  decision: DecisionLevel;
  confidence: number;
  blast_radius: number;
  blast_radius_label: string;
  requires_human_approval: boolean;
  reasoning: string;
  playbook_id: string | null;
}

// ---------------------------------------------------------------------------
// SOAR Action Result (matching shared/schemas.py SOARActionResult)
// ---------------------------------------------------------------------------

export interface SOARActionResult {
  action_id: string;
  action_type: ActionType;
  target: string;
  status: "executed" | "failed" | "simulated";
  executed_at: string;
  message: string;
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Audit Entry (matching shared/schemas.py AuditEntry)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  audit_id: string;
  timestamp: string;
  anomaly_id: string;
  action_type: string;
  actor: string;
  target: string;
  decision: string;
  status: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Prediction (matching shared/schemas.py PredictData)
// ---------------------------------------------------------------------------

export interface PredictData {
  attack: string;
  confidence: number;
  predicted_label: string;
  anomaly_score: number;
}
