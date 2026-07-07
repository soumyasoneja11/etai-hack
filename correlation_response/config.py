"""Correlation-response service settings (env / .env)."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8001

    # Neo4j Aura — optional; service works without it
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    log_requests: bool = True

    model_config = {"env_prefix": "CORR_", "env_file": ".env", "extra": "ignore"}

    @property
    def neo4j_enabled(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_password)


settings = Settings()
