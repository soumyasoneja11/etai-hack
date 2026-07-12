"""Supabase JWT authentication — FastAPI dependencies."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

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

    Returns the decoded JWT payload (contains sub, email, user_metadata, etc.).
    """
    token = _extract_bearer(request)
    payload = _decode_token(token)
    return payload


async def require_admin(request: Request) -> dict[str, Any]:
    """Dependency: require a valid JWT with user_metadata.role == 'admin'.

    Master admin can see all data across RLS boundaries.
    """
    token = _extract_bearer(request)
    payload = _decode_token(token)

    user_meta = payload.get("user_metadata", {})
    role = user_meta.get("role", "")
    if role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required. Your role: " + (role or "none"),
        )
    return payload
