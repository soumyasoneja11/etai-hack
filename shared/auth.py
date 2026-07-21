"""Supabase JWT authentication — FastAPI dependencies.

Verification hardening (P1-7):
  * Only the explicitly-configured signing algorithms are accepted (see
    supabase_settings.expected_algorithms) — we never accept "whatever
    verifies". HS256 (legacy shared secret) and RS256/ES256 (JWKS) are both
    supported explicitly.
  * The issuer (iss) is validated against the expected Supabase project URL.
  * JWKS are cached with a TTL and re-fetched on a kid-miss (unknown key id),
    so a rotated signing key is picked up without a service restart.
  * A small clock-skew leeway is applied to exp/nbf/iat.
"""

from __future__ import annotations

import logging
import threading
import time
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
# JWKS key loader — TTL cache with kid-miss refetch (P1-7)
# ---------------------------------------------------------------------------

# Minimum seconds between forced (kid-miss) refetches, to stop a flood of
# bogus-kid tokens from hammering the JWKS endpoint (DoS guard).
_MIN_FORCE_REFETCH_SEC = 30.0


def _fetch_jwks_raw() -> dict[str, Any]:
    """Fetch the JSON Web Key Set from Supabase (single HTTP call)."""
    url = supabase_settings.supabase_jwks_url
    if not url:
        raise RuntimeError("SUPABASE_JWKS_URL not configured in .env")
    resp = httpx.get(url, timeout=10.0)
    resp.raise_for_status()
    jwks = resp.json()
    logger.info("Fetched %d JWKS keys from %s", len(jwks.get("keys", [])), url)
    return jwks


class _JwksCache:
    """Thread-safe JWKS cache with TTL expiry and rate-limited forced refetch."""

    def __init__(self) -> None:
        self._jwks: dict[str, Any] | None = None
        self._fetched_at: float = 0.0
        self._last_force: float = 0.0
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._jwks = None
            self._fetched_at = 0.0
            self._last_force = 0.0

    def get(self, *, force: bool = False) -> dict[str, Any]:
        with self._lock:
            now = time.monotonic()
            ttl = supabase_settings.supabase_jwks_ttl_sec

            # (Re)fetch if empty or expired.
            if self._jwks is None or (now - self._fetched_at) > ttl:
                self._jwks = _fetch_jwks_raw()
                self._fetched_at = now
                return self._jwks

            # Forced refetch on kid-miss, rate-limited to avoid abuse.
            if force and (now - self._last_force) >= _MIN_FORCE_REFETCH_SEC:
                self._last_force = now
                self._jwks = _fetch_jwks_raw()
                self._fetched_at = now

            return self._jwks


_jwks_cache = _JwksCache()


def _has_kid(jwks: dict[str, Any], kid: str | None) -> bool:
    if not kid:
        # Tokens without a kid can only be matched against a single-key set.
        return True
    return any(k.get("kid") == kid for k in jwks.get("keys", []))


def _decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a Supabase JWT with explicit alg + issuer checks."""
    # 1. Inspect the (unverified) header to pin the algorithm explicitly.
    try:
        header = jwt.get_unverified_header(token)
    except Exception as exc:  # malformed token
        raise HTTPException(status_code=401, detail=f"Malformed token: {exc}") from exc

    alg = header.get("alg", "")
    expected_algs = supabase_settings.expected_algorithms
    if alg not in expected_algs:
        raise HTTPException(
            status_code=401,
            detail=f"Unexpected token signing algorithm '{alg or 'none'}'. "
            f"Accepted: {', '.join(expected_algs)}.",
        )

    issuer = supabase_settings.expected_issuer or None
    options = {
        "leeway": supabase_settings.supabase_jwt_leeway_sec,
        "verify_aud": True,
    }

    # 2. Resolve the verification key for the pinned algorithm.
    if alg == "HS256":
        secret = supabase_settings.supabase_jwt_secret
        if not secret:
            logger.error("HS256 token received but SUPABASE_JWT_SECRET is not configured")
            raise HTTPException(status_code=500, detail="Server auth misconfiguration")
        key: Any = secret
        decode_algs = ["HS256"]
    else:
        kid = header.get("kid")
        jwks = _jwks_cache.get()
        if not _has_kid(jwks, kid):
            # Unknown key id -> likely a rotation; refetch once and retry.
            jwks = _jwks_cache.get(force=True)
            if not _has_kid(jwks, kid):
                raise HTTPException(
                    status_code=401,
                    detail="Token signed by an unknown key (kid not in JWKS)",
                )
        key = jwks
        decode_algs = [a for a in expected_algs if a != "HS256"]

    # 3. Verify signature + claims (aud, iss, exp/nbf with leeway).
    try:
        return jwt.decode(
            token,
            key,
            algorithms=decode_algs,
            audience="authenticated",
            issuer=issuer,
            options=options,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {exc}") from exc


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
