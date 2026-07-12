"""Supabase configuration — shared across all services."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class SupabaseSettings(BaseSettings):
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwks_url: str = ""
    supabase_service_role_key: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def is_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)


supabase_settings = SupabaseSettings()
