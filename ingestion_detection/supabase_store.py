"""Supabase-backed signal store — replaces in-memory queue_store.py."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from shared.errors import StoreUnavailableError
from shared.schemas import DetectionResult, SignalIngestRequest, new_event_id, utc_now
from shared.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)


def _resolve_client(client: Any):
    """Return the caller-supplied RLS-scoped client, else the admin client."""
    return client if client is not None else get_supabase_admin()


class SupabaseSignalStore:
    """Persistent signal store backed by Supabase Postgres.

    Authenticated request paths MUST pass the user-scoped ``client`` (from
    :func:`shared.supabase_client.get_supabase_user`) and ``user_id`` so RLS is
    enforced and reads are filtered to the caller's own rows.
    """

    def __init__(self) -> None:
        self._table = "signals"

    # ----- write -----

    def enqueue(
        self,
        signal: SignalIngestRequest,
        detection: DetectionResult | None = None,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> dict[str, Any]:
        """Insert a signal into the signals table.

        Returns a dict with signal_id and received_at.
        """
        signal_id = signal.signal_id or new_event_id()
        now = utc_now()

        row = {
            "signal_id": signal_id,
            "asset_id": signal.asset_id,
            "detected_at": (signal.detected_at or now).isoformat(),
            "received_at": now.isoformat(),
            "source_file": signal.source_file,
            "row_index": signal.row_index,
            "features": signal.features,
            "ground_truth_label": signal.ground_truth_label,
            "detection": detection.model_dump(mode="json") if detection else None,
        }
        if user_id:
            row["user_id"] = user_id

        try:
            _resolve_client(client).table(self._table).insert(row).execute()
            logger.debug("Inserted signal %s", signal_id)
            return {"signal_id": signal_id, "received_at": now}
        except Exception as exc:
            logger.error("Failed to insert signal %s: %s", signal_id, exc)
            raise

    # ----- read -----

    def list_recent(
        self,
        limit: int = 50,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> list[dict[str, Any]]:
        """Return the most recently received signals (scoped to the caller)."""
        try:
            query = (
                _resolve_client(client)
                .table(self._table)
                .select("*")
                .order("received_at", desc=True)
            )
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.limit(limit).execute()
            return result.data or []
        except Exception as exc:
            logger.error("Failed to list signals: %s", exc)
            raise StoreUnavailableError("failed to list signals") from exc

    def get(
        self,
        signal_id: str,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> dict[str, Any] | None:
        """Fetch a single signal by signal_id (scoped to the caller)."""
        try:
            query = (
                _resolve_client(client)
                .table(self._table)
                .select("*")
                .eq("signal_id", signal_id)
            )
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.limit(1).execute()
            rows = result.data or []
            return rows[0] if rows else None
        except Exception as exc:
            logger.error("Failed to get signal %s: %s", signal_id, exc)
            raise StoreUnavailableError(f"failed to read signal {signal_id}") from exc

    def size(
        self,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> int:
        """Return approximate count of signals visible to the caller."""
        try:
            query = _resolve_client(client).table(self._table).select("id", count="exact")
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.execute()
            return result.count or 0
        except Exception as exc:
            logger.error("Failed to count signals: %s", exc)
            raise StoreUnavailableError("failed to count signals") from exc


# Module-level instance (drop-in replacement for signal_queue)
signal_store = SupabaseSignalStore()
