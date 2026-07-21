"""Supabase-backed anomaly + attribution store — replaces in-memory store.py.

Every method accepts an optional user-scoped ``client`` (from
:func:`shared.supabase_client.get_supabase_user`) and ``user_id``. Authenticated
request paths MUST pass both so Row Level Security is enforced at the database
*and* an explicit ``user_id`` filter is applied as defense in depth. When no
client is supplied the service-role client is used (server-only fallback); reads
still filter by ``user_id`` whenever it is provided.
"""

from __future__ import annotations

import logging
from typing import Any

from shared.errors import StoreUnavailableError
from shared.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)


def _resolve_client(client: Any):
    """Return the caller-supplied RLS-scoped client, else the admin client."""
    return client if client is not None else get_supabase_admin()


def _flatten_anomaly_row(row: dict[str, Any]) -> dict[str, Any]:
    """Expand narrative JSONB into top-level fields for the API consumer."""
    out = dict(row)
    bundle = out.pop("narrative", None)
    if isinstance(bundle, dict):
        out["narrative"] = bundle.get("narrative")
        out["narrative_sources"] = bundle.get("sources") or []
        out["narrative_generated_at"] = bundle.get("generated_at")
        out["narrative_bundle"] = bundle
    else:
        out["narrative"] = None
        out["narrative_sources"] = None
        out["narrative_generated_at"] = None
        out["narrative_bundle"] = None
    return out


class SupabaseAnomalyStore:
    """Persistent anomaly store backed by Supabase Postgres."""

    def __init__(self) -> None:
        self._anomalies_table = "anomalies"
        self._attributions_table = "attributions"

    # ----- write -----

    def put(
        self,
        anomaly_id: str,
        list_item: Any,
        detail: Any,
        attribution: dict[str, Any],
        *,
        decision: dict[str, Any] | None = None,
        user_id: str | None = None,
        client: Any = None,
    ) -> None:
        """Insert anomaly + attribution rows.

        Args:
            anomaly_id: unique anomaly identifier
            list_item: AnomalyListItem Pydantic model
            detail: AnomalyDetail Pydantic model
            attribution: MITRE attribution dict
            decision: correlate-time DecisionResult dict, persisted on the
                anomaly so it survives reloads (see migration 006)
            user_id: owner UUID (required for RLS insert policy)
            client: user-scoped Supabase client (forwards caller JWT)
        """
        db = _resolve_client(client)

        # --- anomaly row ---
        detail_dict = detail.model_dump(mode="json") if hasattr(detail, "model_dump") else detail
        anomaly_row: dict[str, Any] = {
            "anomaly_id": anomaly_id,
            "title": detail_dict.get("title", ""),
            "description": detail_dict.get("description"),
            "severity": detail_dict.get("severity", "low"),
            "status": detail_dict.get("status", "new"),
            "asset_id": detail_dict.get("asset_id", ""),
            "detected_at": detail_dict.get("detected_at"),
            "score": detail_dict.get("score", 0.0),
            "baseline_deviation": detail_dict.get("baseline_deviation", 0.0),
            "reason": detail_dict.get("reason"),
            "raw_signal_ref": detail_dict.get("raw_signal_ref"),
        }
        if decision is not None:
            anomaly_row["decision"] = decision
        if user_id:
            anomaly_row["user_id"] = user_id

        # --- attribution row ---
        attr_row: dict[str, Any] = {
            "anomaly_id": anomaly_id,
            "mitre_technique_id": attribution.get("mitre_technique_id", ""),
            "mitre_tactic": attribution.get("mitre_tactic", ""),
            "technique_name": attribution.get("technique_name", ""),
            "matched_campaign": attribution.get("matched_campaign"),
            "confidence": attribution.get("confidence", 0.0),
        }
        if user_id:
            attr_row["user_id"] = user_id

        try:
            db.table(self._anomalies_table).insert(anomaly_row).execute()
            db.table(self._attributions_table).insert(attr_row).execute()
            logger.debug("Stored anomaly %s with attribution", anomaly_id)
        except Exception as exc:
            logger.error("Failed to store anomaly %s: %s", anomaly_id, exc)
            raise

    # ----- read -----

    def get(
        self,
        anomaly_id: str,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> dict[str, Any] | None:
        """Fetch full anomaly detail by anomaly_id (includes narrative JSONB if present)."""
        db = _resolve_client(client)
        try:
            query = (
                db.table(self._anomalies_table)
                .select("*")
                .eq("anomaly_id", anomaly_id)
            )
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.limit(1).execute()
            rows = result.data or []
            if not rows:
                return None
            return _flatten_anomaly_row(rows[0])
        except Exception as exc:
            logger.error("Failed to get anomaly %s: %s", anomaly_id, exc)
            raise StoreUnavailableError(f"failed to read anomaly {anomaly_id}") from exc

    def save_narrative(
        self,
        anomaly_id: str,
        *,
        narrative: str,
        sources: list[str],
        generated_at: str,
        user_id: str | None = None,
        client: Any = None,
    ) -> dict[str, Any] | None:
        """Persist NarrativeResponse fields on anomalies.narrative JSONB."""
        db = _resolve_client(client)
        if self.get(anomaly_id, user_id=user_id, client=client) is None:
            return None
        payload = {
            "narrative": narrative,
            "sources": sources,
            "generated_at": generated_at,
        }
        try:
            update = (
                db.table(self._anomalies_table)
                .update({"narrative": payload})
                .eq("anomaly_id", anomaly_id)
            )
            if user_id:
                update = update.eq("user_id", user_id)
            update.execute()
            return self.get(anomaly_id, user_id=user_id, client=client)
        except Exception as exc:
            logger.error("Failed to save narrative for %s: %s", anomaly_id, exc)
            raise

    def list_items(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
        user_id: str | None = None,
        client: Any = None,
    ) -> list[dict[str, Any]]:
        """Return anomaly list items (newest first), optionally filtered by status."""
        db = _resolve_client(client)
        try:
            query = (
                db.table(self._anomalies_table)
                .select(
                    "anomaly_id, title, severity, status, asset_id, "
                    "detected_at, score, reason"
                )
                .order("detected_at", desc=True)
            )
            if status:
                query = query.eq("status", status)
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.range(offset, offset + limit - 1).execute()
            return result.data or []
        except Exception as exc:
            logger.error("Failed to list anomalies: %s", exc)
            raise StoreUnavailableError("failed to list anomalies") from exc

    def update_status(
        self,
        anomaly_id: str,
        status: str,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> dict[str, Any] | None:
        """Update anomaly lifecycle status. Returns updated row or None if missing."""
        db = _resolve_client(client)
        existing = self.get(anomaly_id, user_id=user_id, client=client)
        if existing is None:
            return None
        try:
            update = (
                db.table(self._anomalies_table)
                .update({"status": status})
                .eq("anomaly_id", anomaly_id)
            )
            if user_id:
                update = update.eq("user_id", user_id)
            update.execute()
            return self.get(anomaly_id, user_id=user_id, client=client)
        except Exception as exc:
            logger.error("Failed to update status for %s: %s", anomaly_id, exc)
            raise

    def list_attributions(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        user_id: str | None = None,
        client: Any = None,
    ) -> list[dict[str, Any]]:
        """Return MITRE ATT&CK attributions (newest first)."""
        db = _resolve_client(client)
        try:
            query = (
                db.table(self._attributions_table)
                .select("*")
                .order("created_at", desc=True)
            )
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.range(offset, offset + limit - 1).execute()
            return result.data or []
        except Exception as exc:
            logger.error("Failed to list attributions: %s", exc)
            raise StoreUnavailableError("failed to list attributions") from exc

    def count(
        self,
        *,
        user_id: str | None = None,
        client: Any = None,
    ) -> int:
        """Return approximate count of anomalies visible to the caller."""
        db = _resolve_client(client)
        try:
            query = db.table(self._anomalies_table).select("id", count="exact")
            if user_id:
                query = query.eq("user_id", user_id)
            result = query.execute()
            return result.count or 0
        except Exception as exc:
            logger.error("Failed to count anomalies: %s", exc)
            raise StoreUnavailableError("failed to count anomalies") from exc


# Module-level instance
anomaly_store = SupabaseAnomalyStore()
