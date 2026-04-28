from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_SECRET_KEY_DEFAULT = "dev-secret-change-in-production"
_NON_PROD_ENVS = frozenset({"dev", "development", "local", "test", "ci"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5434/powerupcode"
    secret_key: str = _DEV_SECRET_KEY_DEFAULT
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_weekly: str = ""
    stripe_price_monthly: str = ""
    stripe_price_annual: str = ""
    engine_module: str = "stub"
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@powerupcode.com"
    app_url: str = "http://localhost:3001"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


def _enforce_production_secret(s: Settings) -> None:
    """Refuse to boot in production with the dev secret key default."""
    env_normalized = (s.env or "").strip().lower()
    if env_normalized in _NON_PROD_ENVS:
        return
    if s.secret_key == _DEV_SECRET_KEY_DEFAULT or len(s.secret_key) < 32:
        raise RuntimeError(
            f"SECRET_KEY must be set to a non-default value of at least 32 chars when "
            f"ENV='{s.env}'. Generate one with: python -c \"import secrets; "
            f"print(secrets.token_urlsafe(48))\""
        )


settings = Settings()
_enforce_production_secret(settings)
