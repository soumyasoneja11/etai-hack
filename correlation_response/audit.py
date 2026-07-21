"""Audit logging — records every automated or human-approved action to Supabase.

Every SOAR action, decision, and narrative generation is logged here for
the dashboard audit trail and compliance.

All helpers accept an optional user-scoped ``client`` (from
:func:`shared.supabase_client.get_supabase_user`) and ``user_id`` so writes and
reads respect Row Level Security. Reads additionally filter by ``user_id`` as
defense in depth.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from shared.schemas import AuditEntry

logger = logging.getLogger(__name__)


def _resolve_client(client: Any):
    """Return the caller-supplied RLS-scoped client, else the admin client."""
    if client is not None:
        return client
    from shared.supabase_client import get_supabase_admin

    return get_supabase_admin()


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------


def log_action(
    entry: AuditEntry,
    *,
    user_id: str | None = None,
    client: Any = None,
) -> AuditEntry:
    """Write an audit entry to Supabase and emit a structured log line.

    Always succeeds from the caller's perspective — Supabase errors are
    caught and logged but never propagated (audit should not break the
    primary flow).
    """
    row: dict[str, Any] = {
        "audit_id": entry.audit_id,
        "anomaly_id": entry.anomaly_id,
        "action_type": entry.action_type,
        "actor": entry.actor,
        "target": entry.target,
        "decision": entry.decision,
        "status": entry.status,
        "details": entry.details,
    }
    if user_id:
        row["user_id"] = user_id

    # Structured log (always emitted, even if Supabase write fails)
    logger.info(
        "AUDIT action=%s anomaly=%s actor=%s target=%s decision=%s status=%s",
        entry.action_type,
        entry.anomaly_id,
        entry.actor,
        entry.target,
        entry.decision,
        entry.status,
    )

    try:
        _resolve_client(client).table("audit_logs").insert(row).execute()
        logger.debug("Audit entry %s written to Supabase", entry.audit_id)
    except Exception as exc:
        logger.error("Failed to write audit entry %s: %s", entry.audit_id, exc)

    return entry


def log_soar_action(
    *,
    action_id: str,
    anomaly_id: str,
    action_type: str,
    target: str,
    status: str,
    message: str = "",
    user_id: str | None = None,
    client: Any = None,
) -> None:
    """Write a SOAR action record to Supabase soar_actions table."""
    row: dict[str, Any] = {
        "action_id": action_id,
        "anomaly_id": anomaly_id,
        "action_type": action_type,
        "target": target,
        "status": status,
        "message": message,
        "simulated": True,
    }
    if user_id:
        row["user_id"] = user_id

    try:
        _resolve_client(client).table("soar_actions").insert(row).execute()
    except Exception as exc:
        logger.error("Failed to write SOAR action %s: %s", action_id, exc)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


def get_audit_trail(
    anomaly_id: str,
    *,
    user_id: str | None = None,
    client: Any = None,
) -> list[dict[str, Any]]:
    """Fetch all audit entries for a specific anomaly."""
    try:
        query = (
            _resolve_client(client)
            .table("audit_logs")
            .select("*")
            .eq("anomaly_id", anomaly_id)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.order("created_at", desc=True).execute()
        return result.data or []
    except Exception as exc:
        logger.error("Failed to fetch audit trail for %s: %s", anomaly_id, exc)
        return []


def list_audit_logs(
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: str | None = None,
    client: Any = None,
) -> list[dict[str, Any]]:
    """Paginated list of recent audit entries (newest first)."""
    try:
        query = (
            _resolve_client(client)
            .table("audit_logs")
            .select("*")
            .order("created_at", desc=True)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.range(offset, offset + limit - 1).execute()
        return result.data or []
    except Exception as exc:
        logger.error("Failed to list audit logs: %s", exc)
        return []


def list_soar_actions(
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: str | None = None,
    client: Any = None,
) -> list[dict[str, Any]]:
    """Paginated list of SOAR actions (newest first)."""
    try:
        query = (
            _resolve_client(client)
            .table("soar_actions")
            .select("*")
            .order("created_at", desc=True)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.range(offset, offset + limit - 1).execute()
        return result.data or []
    except Exception as exc:
        logger.error("Failed to list SOAR actions: %s", exc)
        return []


def get_soar_action(
    action_id: str,
    *,
    user_id: str | None = None,
    client: Any = None,
) -> dict[str, Any] | None:
    """Fetch a single SOAR action by action_id."""
    try:
        query = (
            _resolve_client(client)
            .table("soar_actions")
            .select("*")
            .eq("action_id", action_id)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.limit(1).execute()
        rows = result.data or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.error("Failed to get SOAR action %s: %s", action_id, exc)
        return None
