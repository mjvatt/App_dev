from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    anthropic_api_key: str = Field(default="")
    database_url: str = Field(
        default="postgresql+asyncpg://pathfinder:pathfinder@localhost:5436/pathfinder"
    )
    synthesizer_model: str = Field(default="claude-opus-4-7")
    default_model: str = Field(default="claude-sonnet-4-6")
    allowed_origins: str = Field(default="http://localhost:3002")


@lru_cache
def get_settings() -> Settings:
    return Settings()
