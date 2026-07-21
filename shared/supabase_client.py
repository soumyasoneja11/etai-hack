"""Supabase client singleton — shared across services."""

from __future__ import annotations

import logging
from functools import lru_cache

from supabase import Client, create_client

try:
    from .supabase_config import supabase_settings
except ImportError:
    from shared.supabase_config import supabase_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a Supabase client using the *publishable* key (respects RLS)."""
    if not supabase_settings.is_configured:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env"
        )
    client = create_client(
        supabase_settings.supabase_url,
        supabase_settings.supabase_publishable_key,
    )
    logger.info("Supabase client initialised (publishable key)")
    return client


def get_supabase_user(access_token: str) -> Client:
    """Return a Supabase client scoped to the *caller's* JWT (RLS applies).

    The client authenticates to PostgREST as the end user by forwarding their
    access token, so Postgres Row Level Security policies (per-user isolation
    from 001_create_tables.sql / 003_audit_soar.sql) are enforced on every
    read and write.

    This is the client that MUST be used for any table access reachable from an
    authenticated request. It is intentionally NOT cached: the token is
    per-user and short-lived, and caching would leak one tenant's session into
    another request.
    """
    if not access_token:
        raise RuntimeError("get_supabase_user() requires a non-empty access token")
    if not supabase_settings.supabase_url or not supabase_settings.supabase_publishable_key:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and "
            "SUPABASE_PUBLISHABLE_KEY in .env"
        )
    client = create_client(
        supabase_settings.supabase_url,
        supabase_settings.supabase_publishable_key,
    )
    # Forward the caller's JWT to PostgREST so auth.uid()/auth.jwt() resolve to
    # the end user and RLS policies apply as that user.
    client.postgrest.auth(access_token)
    return client


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Return a Supabase client using the *service-role* key (BYPASSES RLS).

    DANGER: this client ignores Row Level Security and can read/write every
    tenant's data. Reserve it strictly for trusted, server-only privileged
    operations that have no end-user identity, such as GoTrue user management
    (``auth.admin.create_user`` / ``update_user_by_id``).

    It must NOT be used for tenant-scoped table access reachable from an
    authenticated request — use :func:`get_supabase_user` instead so RLS is
    enforced. There are currently no background jobs that legitimately need
    admin table access; if one is added, document why here.
    """
    if not supabase_settings.supabase_service_role_key:
        raise RuntimeError(
            "Supabase service-role key not configured. "
            "Set SUPABASE_SERVICE_ROLE_KEY in .env"
        )
    client = create_client(
        supabase_settings.supabase_url,
        supabase_settings.supabase_service_role_key,
    )
    logger.info("Supabase admin client initialised (service-role key)")
    return client
