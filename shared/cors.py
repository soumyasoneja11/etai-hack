"""Shared CORS origin resolution for both FastAPI services.

Allowed origins are env-driven via ``CORS_ALLOWED_ORIGINS`` (comma-separated),
so the same variable configures A and B regardless of their per-service env
prefixes. A wildcard ("*") is never permitted because both services use
``allow_credentials=True`` — browsers reject ``*`` with credentials, and it
would defeat tenant isolation.

Example:
    CORS_ALLOWED_ORIGINS="https://soc.example.com,https://admin.example.com"
Local dev default (when unset): localhost:3000 / 127.0.0.1:3000.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def get_cors_allowed_origins() -> list[str]:
    """Parse CORS_ALLOWED_ORIGINS into an explicit origin list (no wildcard)."""
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if not raw.strip():
        return list(_DEFAULT_ORIGINS)

    origins = [o.strip() for o in raw.split(",") if o.strip()]
    filtered = [o for o in origins if o != "*"]
    if len(filtered) != len(origins):
        logger.warning(
            "CORS: wildcard '*' is not allowed with allow_credentials=True; "
            "ignoring it. Set explicit origins in CORS_ALLOWED_ORIGINS."
        )
    if not filtered:
        logger.warning(
            "CORS: no valid origins in CORS_ALLOWED_ORIGINS; "
            "falling back to local dev defaults."
        )
        return list(_DEFAULT_ORIGINS)
    return filtered
