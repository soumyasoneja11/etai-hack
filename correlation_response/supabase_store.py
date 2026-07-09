"""Supabase-backed anomaly + attribution store — replaces in-memory store.py."""

from __future__ import annotations

import logging
from typing import Any

from shared.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)


class SupabaseAnomalyStore:
    """Persistent anomaly store backed by Supabase Postgres."""

    def __init__(self) -> None:
        self._anomalies_table = "anomalies"
        self._attributions_table = "attributions"

    @property
    def _client(self):
        return get_supabase_admin()

    # ----- write -----

    def put(
        self,
        anomaly_id: str,
        list_item: Any,
        detail: Any,
        attribution: dict[str, Any],
        *,
        user_id: str | None = None,
    ) -> None:
        """Insert anomaly + attribution rows.

        Args:
            anomaly_id: unique anomaly identifier
            list_item: AnomalyListItem Pydantic model
            detail: AnomalyDetail Pydantic model
            attribution: MITRE attribution dict
            user_id: optional owner UUID (for RLS)
        """
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
            self._client.table(self._anomalies_table).insert(anomaly_row).execute()
            self._client.table(self._attributions_table).insert(attr_row).execute()
            logger.debug("Stored anomaly %s with attribution", anomaly_id)
        except Exception as exc:
            logger.error("Failed to store anomaly %s: %s", anomaly_id, exc)
            raise

    # ----- read -----

    def get(self, anomaly_id: str) -> dict[str, Any] | None:
        """Fetch full anomaly detail by anomaly_id."""
        try:
            result = (
                self._client.table(self._anomalies_table)
                .select("*")
                .eq("anomaly_id", anomaly_id)
                .limit(1)
                .execute()
            )
            rows = result.data or []
            return rows[0] if rows else None
        except Exception as exc:
            logger.error("Failed to get anomaly %s: %s", anomaly_id, exc)
            return None

    def list_items(self, *, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Return anomaly list items (newest first)."""
        try:
            result = (
                self._client.table(self._anomalies_table)
                .select(
                    "anomaly_id, title, severity, status, asset_id, "
                    "detected_at, score, reason"
                )
                .order("detected_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error("Failed to list anomalies: %s", exc)
            return []

    def list_attributions(self, *, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Return MITRE ATT&CK attributions (newest first)."""
        try:
            result = (
                self._client.table(self._attributions_table)
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error("Failed to list attributions: %s", exc)
            return []

    def count(self) -> int:
        """Return approximate count of anomalies."""
        try:
            result = (
                self._client.table(self._anomalies_table)
                .select("id", count="exact")
                .execute()
            )
            return result.count or 0
        except Exception as exc:
            logger.error("Failed to count anomalies: %s", exc)
            return 0


# Module-level instance
anomaly_store = SupabaseAnomalyStore()
