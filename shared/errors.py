"""Shared domain exceptions.

Kept framework-agnostic (no FastAPI import) so the data-access layer can raise
them; each service's ``main.py`` maps them to the right HTTP status + envelope.
"""

from __future__ import annotations


class StoreUnavailableError(RuntimeError):
    """A datastore read/query *failed* — as opposed to succeeding with no rows.

    Read helpers previously swallowed query errors into an empty list / ``None``,
    which is indistinguishable from "genuinely no data" and, for a SOC tool,
    dangerously hides an outage behind a calm "no anomalies" screen. Raising this
    instead lets endpoints return HTTP 503 so the frontend can surface a visible
    "failed to load" state. "No rows" must still return ``[]`` / ``None``.
    """

    def __init__(self, message: str = "datastore query failed") -> None:
        super().__init__(message)
