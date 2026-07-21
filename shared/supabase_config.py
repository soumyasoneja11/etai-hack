"""Supabase configuration — shared across all services."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class SupabaseSettings(BaseSettings):
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwks_url: str = ""
    supabase_service_role_key: str = ""

    # ----- JWT verification (P1-7) -----
    # HS256 legacy shared secret (Supabase Dashboard -> Settings -> API -> JWT
    # Secret). Required only when the project signs access tokens with HS256.
    supabase_jwt_secret: str = ""
    # Explicit allow-list of accepted signing algorithms (comma-separated), e.g.
    # "RS256" or "ES256" or "HS256". Leave empty to auto-derive: JWKS URL set ->
    # asymmetric (RS256, ES256); else JWT secret set -> HS256. We NEVER accept
    # "whatever verifies" — the alg in the token header must be in this set.
    supabase_jwt_algorithms: str = ""
    # Expected issuer (iss). Leave empty to derive "{supabase_url}/auth/v1".
    supabase_issuer: str = ""
    # JWKS cache TTL (seconds) — bounds staleness after key rotation.
    supabase_jwks_ttl_sec: int = 600
    # Clock-skew leeway (seconds) applied to exp/nbf/iat validation.
    supabase_jwt_leeway_sec: int = 10

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def is_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)

    @property
    def expected_algorithms(self) -> list[str]:
        """Explicit list of accepted JWT signing algorithms."""
        if self.supabase_jwt_algorithms.strip():
            return [a.strip() for a in self.supabase_jwt_algorithms.split(",") if a.strip()]
        if self.supabase_jwks_url:
            return ["RS256", "ES256"]
        if self.supabase_jwt_secret:
            return ["HS256"]
        # Default assumes modern Supabase asymmetric signing keys (JWKS).
        return ["RS256", "ES256"]

    @property
    def expected_issuer(self) -> str:
        """Expected iss claim; derived from the project URL when not set."""
        if self.supabase_issuer:
            return self.supabase_issuer
        if self.supabase_url:
            return f"{self.supabase_url.rstrip('/')}/auth/v1"
        return ""


supabase_settings = SupabaseSettings()
