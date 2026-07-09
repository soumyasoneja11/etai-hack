"""Supabase client singleton — shared across services."""

from __future__ import annotations

import logging
from functools import lru_cache

from supabase import Client, create_client

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


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Return a Supabase client using the *service-role* key (bypasses RLS).

    Use this for server-to-server operations and background tasks.
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
