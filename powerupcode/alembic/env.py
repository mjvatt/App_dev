import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from api.config import settings
from api.models.base import Base
from api.models.challenge import Attempt, UserProgress  # noqa: F401
from api.models.user import User  # noqa: F401


def _resolve_url() -> str:
    """Prefer the live env var so test fixtures and dev-runtime overrides
    take effect even after api.config.settings was frozen at import time."""
    return os.getenv("DATABASE_URL") or settings.database_url


config = context.config
config.set_main_option("sqlalchemy.url", _resolve_url())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(_resolve_url())
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
