from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Bind 0.0.0.0 by default so the service is reachable inside a container.
    # For local-only dev, override with HOST=127.0.0.1 (env or .env). PORT also
    # env-driven (HOST/PORT).
    host: str = "0.0.0.0"
    port: int = 8000
    log_requests: bool = True
    # B (correlation_response) — live handoff after scored ingest
    correlation_base_url: str = "http://127.0.0.1:8001"
    correlation_forward_enabled: bool = True
    correlation_forward_timeout_sec: float = 10.0
    default_scenario: str = "portscan"

    # ----- Signup hardening (P0-3) -----
    # Public signup is CLOSED unless an invite token is configured. When set,
    # a request must present a matching `invite_token`. Leave empty to disable
    # public signup entirely (admins provision accounts via make-admin flow).
    signup_invite_token: str = ""
    # Per-IP and per-email sliding-window limits.
    signup_rate_limit_max: int = 5
    signup_rate_limit_window_sec: float = 3600.0


settings = Settings()
