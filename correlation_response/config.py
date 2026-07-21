"""Correlation-response service settings (env / .env)."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Bind 0.0.0.0 by default so the service is reachable inside a container.
    # Env-driven via CORR_HOST / CORR_PORT (override CORR_HOST=127.0.0.1 for
    # local-only dev).
    host: str = "0.0.0.0"
    port: int = 8001

    # Neo4j Aura — optional; service works without it
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # Gemini LLM — optional; narrative falls back to template-only if missing
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    narrative_max_tokens: int = 1024

    log_requests: bool = True

    model_config = {"env_prefix": "CORR_", "env_file": ".env", "extra": "ignore"}

    @property
    def neo4j_enabled(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_password)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)


settings = Settings()
