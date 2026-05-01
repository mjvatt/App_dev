"""Pure-logic tests for the backup script.

Subprocess + boto3 + Docker calls are integration concerns and not
worth mocking. The two helpers worth pinning are URL parsing (where
SQLAlchemy dialect prefixes can sneak in) and key generation (which
needs to match the S3 lifecycle rule prefix).
"""
import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import pytest

# scripts/ isn't a package, so import the module by path.
_SPEC = importlib.util.spec_from_file_location(
    "backup_db",
    Path(__file__).resolve().parents[2] / "scripts" / "backup_db.py",
)
assert _SPEC is not None and _SPEC.loader is not None
backup_db = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(backup_db)


def test_parse_database_url_strips_async_dialect_prefix() -> None:
    parsed = backup_db._parse_database_url(
        "postgresql+asyncpg://puc:secret@db.local:5433/powerupcode"
    )
    assert parsed["PGHOST"] == "db.local"
    assert parsed["PGPORT"] == "5433"
    assert parsed["PGUSER"] == "puc"
    assert parsed["PGPASSWORD"] == "secret"
    assert parsed["PGDATABASE"] == "powerupcode"


def test_parse_database_url_handles_plain_scheme() -> None:
    parsed = backup_db._parse_database_url(
        "postgresql://user:pw@example.com/mydb"
    )
    assert parsed["PGHOST"] == "example.com"
    assert parsed["PGPORT"] == "5432"  # default
    assert parsed["PGDATABASE"] == "mydb"


def test_parse_database_url_short_alias_postgres() -> None:
    parsed = backup_db._parse_database_url("postgres://u:p@h/db")
    assert parsed["PGDATABASE"] == "db"


def test_parse_database_url_rejects_unknown_scheme() -> None:
    with pytest.raises(ValueError, match="unexpected scheme"):
        backup_db._parse_database_url("mysql://u:p@h/db")


def test_parse_database_url_rejects_missing_database_name() -> None:
    with pytest.raises(ValueError, match="missing the database name"):
        backup_db._parse_database_url("postgresql://u:p@h/")


def test_backup_key_includes_db_name_and_iso_timestamp() -> None:
    key = backup_db._backup_key(
        prefix="prod",
        db_name="powerupcode",
        now=datetime(2026, 5, 1, 14, 30, 0, tzinfo=UTC),
    )
    assert key == "prod/powerupcode/2026/05/01/powerupcode-2026-05-01T14-30-00Z.dump"


def test_backup_key_handles_empty_prefix() -> None:
    key = backup_db._backup_key(
        prefix="",
        db_name="puc",
        now=datetime(2026, 5, 1, 0, 0, 0, tzinfo=UTC),
    )
    assert key == "puc/2026/05/01/puc-2026-05-01T00-00-00Z.dump"


def test_backup_key_normalizes_trailing_slash() -> None:
    key = backup_db._backup_key(
        prefix="prod/",
        db_name="puc",
        now=datetime(2026, 5, 1, 0, 0, 0, tzinfo=UTC),
    )
    assert key == "prod/puc/2026/05/01/puc-2026-05-01T00-00-00Z.dump"
