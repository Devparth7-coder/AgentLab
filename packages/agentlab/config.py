"""Environment-only runtime configuration; never persist credential values."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENTLAB_", env_file=".env", extra="ignore")
    env: str = "development"
    database_url: str = "sqlite:///./agentlab.db"
    redis_url: str = "redis://localhost:6379/0"
    queue_mode: str = "local-thread"
    auth_mode: str = "required"
    api_key: str = ""
    readonly_api_key: str = ""
    demo_seed: bool = False
    max_request_bytes: int = 1_048_576
    rate_limit_per_minute: int = 180
    provider_timeout_seconds: int = 45
    trace_capture: str = "redacted"  # metadata | redacted

    def validate_deployment(self) -> None:
        if self.env not in {"development", "test", "production"}:
            raise RuntimeError("Unknown AGENTLAB_ENV")
        if self.queue_mode not in {"celery", "local-thread"}:
            raise RuntimeError("Unknown AGENTLAB_QUEUE_MODE")
        if self.auth_mode not in {"required", "disabled"}:
            raise RuntimeError("Unknown AGENTLAB_AUTH_MODE")
        if self.env == "production":
            if self.auth_mode != "required" or len(self.api_key) < 32:
                raise RuntimeError("Production requires an API key of at least 32 characters")
            if self.queue_mode != "celery" or not self.database_url.startswith("postgresql"):
                raise RuntimeError("Production requires PostgreSQL and Celery/Redis")
        if self.auth_mode == "disabled" and self.env not in {"development", "test"}:
            raise RuntimeError("Authentication can only be disabled for local development/tests")
        if self.auth_mode == "required" and not self.api_key:
            raise RuntimeError("Set AGENTLAB_API_KEY (see .env.example)")
        if self.readonly_api_key and (
            self.readonly_api_key == self.api_key
            or (self.env == "production" and len(self.readonly_api_key) < 32)
        ):
            raise RuntimeError(
                "Viewer API key must differ from admin key and be >=32 chars in production"
            )


@lru_cache
def settings() -> Settings:
    return Settings()
