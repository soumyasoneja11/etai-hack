"""Supabase JWT authentication — FastAPI dependencies."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

try:
    from .supabase_config import supabase_settings
except ImportError:
    from shared.supabase_config import supabase_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# JWKS key loader
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _fetch_jwks() -> dict[str, Any]:
    """Fetch the JSON Web Key Set from Supabase (cached for process lifetime)."""
    url = supabase_settings.supabase_jwks_url
    if not url:
        raise RuntimeError("SUPABASE_JWKS_URL not configured in .env")

    resp = httpx.get(url, timeout=10.0)
    resp.raise_for_status()
    jwks = resp.json()
    logger.info("Fetched %d JWKS keys from %s", len(jwks.get("keys", [])), url)
    return jwks


def _decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a Supabase JWT using JWKS."""
    jwks = _fetch_jwks()
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def _extract_bearer(request: Request) -> str:
    """Extract Bearer token from the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header. Expected: Bearer <token>",
        )
    return auth_header[7:]  # strip "Bearer "


async def require_auth(request: Request) -> dict[str, Any]:
    """Dependency: require a valid Supabase JWT.

    Returns the decoded JWT payload (contains sub, email, app_metadata, etc.).
    """
    token = _extract_bearer(request)
    payload = _decode_token(token)
    return payload


def _role_from_payload(payload: dict[str, Any]) -> str:
    """Read the user's role from the *server-controlled* app_metadata claim.

    Roles are stored in ``app_metadata`` (settable only with the service-role
    key), never in ``user_metadata`` which the user can rewrite via
    ``auth.updateUser({data:{...}})``. Reading from app_metadata prevents
    privilege escalation.
    """
    app_meta = payload.get("app_metadata") or {}
    role = app_meta.get("role", "")
    return role if isinstance(role, str) else ""


async def require_admin(request: Request) -> dict[str, Any]:
    """Dependency: require a valid JWT with app_metadata.role == 'admin'.

    Master admin can see all data across RLS boundaries. The role is read from
    the server-controlled ``app_metadata`` claim so it cannot be self-assigned.
    """
    token = _extract_bearer(request)
    payload = _decode_token(token)

    role = _role_from_payload(payload)
    if role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required. Your role: " + (role or "none"),
        )
    return payload


class ScopedContext:
    """Per-request auth context carrying the caller's identity + a user-scoped
    Supabase client so all DB access respects Row Level Security.

    Use via ``ctx: ScopedContext = Depends(require_scoped)`` and pass
    ``client=ctx.db, user_id=ctx.user_id`` into store/audit helpers.
    """

    __slots__ = ("payload", "token", "_db")

    def __init__(self, payload: dict[str, Any], token: str) -> None:
        self.payload = payload
        self.token = token
        self._db = None

    @property
    def user_id(self) -> str | None:
        return self.payload.get("sub")

    @property
    def email(self) -> str | None:
        return self.payload.get("email")

    @property
    def role(self) -> str:
        return _role_from_payload(self.payload)

    @property
    def db(self):
        """Lazily built Supabase client scoped to this request's JWT."""
        if self._db is None:
            from shared.supabase_client import get_supabase_user

            self._db = get_supabase_user(self.token)
        return self._db


async def require_scoped(request: Request) -> ScopedContext:
    """Dependency: validate the JWT and return a RLS-scoped request context."""
    token = _extract_bearer(request)
    payload = _decode_token(token)
    return ScopedContext(payload, token)
