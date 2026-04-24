from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/powerupcode"
    secret_key: str = "dev-secret-change-in-production"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_weekly: str = ""
    stripe_price_monthly: str = ""
    stripe_price_annual: str = ""
    engine_module: str = "stub"
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
