from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8000
    log_requests: bool = True
    # B (correlation_response) — live handoff after scored ingest
    correlation_base_url: str = "http://127.0.0.1:8001"
    correlation_forward_enabled: bool = True
    correlation_forward_timeout_sec: float = 10.0
    default_scenario: str = "portscan"


settings = Settings()
