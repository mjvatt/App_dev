"""Postgres backup -> S3.

Runs pg_dump in custom format (compressed, parallel-restore-capable),
streams the dump to S3 with a timestamped key, and applies SSE-S3
encryption at rest.

Designed to run on a schedule (cron, GitHub Actions, Render Scheduled
Job, etc.). Reads DATABASE_URL from the environment so the same script
backs up local dev or production by pointing at the right env file.

Retention is NOT handled here — configure an S3 lifecycle policy on
the backup bucket to age objects out (recommended: 30 days standard,
then delete or transition to Glacier IR).

Usage (from powerupcode/):
    python scripts/backup_db.py --bucket my-puc-backups
    python scripts/backup_db.py --bucket my-puc-backups --dry-run
    python scripts/backup_db.py --bucket my-puc-backups --prefix prod/

Required IAM policy on the destination bucket:
    s3:PutObject
    s3:PutObjectAcl  (only if your bucket uses ACLs)

AWS credentials are picked up from the standard chain (env vars,
shared credentials file, instance profile). No code change needed.
"""
import argparse
import os
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _import_boto3():  # type: ignore[no-untyped-def]
    """Defer boto3 import so the pure helpers (URL parsing, key
    generation) can be unit-tested without installing the optional
    backups dependency group."""
    try:
        import boto3
    except ImportError as exc:
        raise SystemExit(
            "boto3 is not installed. Install with: pip install -e '.[backups]'"
        ) from exc
    return boto3


def _parse_database_url(url: str) -> dict[str, str]:
    """Strip any SQLAlchemy dialect prefix (postgresql+asyncpg://, etc.)
    and break the URL into kwargs pg_dump expects via env vars. We pass
    PG* env vars instead of building a connection string so the password
    never lands on the command line."""
    parsed = urlparse(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ValueError(
            f"DATABASE_URL has unexpected scheme {parsed.scheme!r}; "
            "expected postgres:// or postgresql://"
        )
    if not parsed.path or parsed.path == "/":
        raise ValueError("DATABASE_URL is missing the database name")
    return {
        "PGHOST": parsed.hostname or "localhost",
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": parsed.username or "postgres",
        "PGPASSWORD": parsed.password or "",
        "PGDATABASE": parsed.path.lstrip("/"),
    }


def _backup_key(prefix: str, db_name: str, now: datetime | None = None) -> str:
    """Build the S3 object key for this backup. Format:
        {prefix}{db_name}/YYYY/MM/DD/db_name-YYYY-MM-DDTHH-MM-SSZ.dump

    The date-segmented prefix keeps the bucket browsable and plays
    well with S3 lifecycle rules that filter by prefix."""
    stamp = (now or datetime.now(UTC)).strftime("%Y-%m-%dT%H-%M-%SZ")
    date_path = (now or datetime.now(UTC)).strftime("%Y/%m/%d")
    base = f"{db_name}/{date_path}/{db_name}-{stamp}.dump"
    return f"{prefix.rstrip('/')}/{base}" if prefix else base


def _run_pg_dump(env_extra: dict[str, str], output_path: Path, pg_dump_path: str) -> None:
    """Run pg_dump with custom format. Custom format is compressed by
    default and supports parallel restore via pg_restore -j. The dump
    file is the canonical backup artifact."""
    cmd = [
        pg_dump_path,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file", str(output_path),
        env_extra["PGDATABASE"],
    ]
    env = {**os.environ, **env_extra}
    subprocess.run(cmd, check=True, env=env)


def _upload_to_s3(local_path: Path, bucket: str, key: str, s3_client) -> int:  # type: ignore[no-untyped-def]
    size = local_path.stat().st_size
    s3_client.upload_file(
        Filename=str(local_path),
        Bucket=bucket,
        Key=key,
        ExtraArgs={
            "ServerSideEncryption": "AES256",
            "ContentType": "application/octet-stream",
            "Metadata": {
                "puc-backup-version": "1",
                "puc-backup-created-at": datetime.now(UTC).isoformat(),
            },
        },
    )
    return size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True, help="Destination S3 bucket name.")
    parser.add_argument(
        "--prefix",
        default="",
        help=(
            "Optional key prefix (e.g. 'prod/'). Useful when one bucket "
            "holds backups from multiple envs."
        ),
    )
    parser.add_argument(
        "--pg-dump-path",
        default="pg_dump",
        help="Path to pg_dump binary if it's not on PATH.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run pg_dump locally; skip the S3 upload.",
    )
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL is not set in the environment")
    env_extra = _parse_database_url(db_url)
    db_name = env_extra["PGDATABASE"]

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / f"{db_name}.dump"
        print(f"Running pg_dump for database {db_name!r}...", flush=True)
        try:
            _run_pg_dump(env_extra, out, args.pg_dump_path)
        except subprocess.CalledProcessError as exc:
            raise SystemExit(f"pg_dump failed with exit code {exc.returncode}") from exc

        size_mb = out.stat().st_size / (1024 * 1024)
        print(f"Dump complete ({size_mb:.2f} MB)")

        key = _backup_key(args.prefix, db_name)

        if args.dry_run:
            print(f"[dry-run] would upload to s3://{args.bucket}/{key}")
            return

        print(f"Uploading to s3://{args.bucket}/{key}...", flush=True)
        s3 = _import_boto3().client("s3")
        uploaded = _upload_to_s3(out, args.bucket, key, s3)
        print(f"Uploaded {uploaded / (1024 * 1024):.2f} MB to {key}")


if __name__ == "__main__":
    main()
