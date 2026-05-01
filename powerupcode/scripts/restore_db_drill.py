"""Restore drill — verify that backups actually work.

Untested backups are not backups. This script:
  1. Lists recent objects under the configured backup prefix.
  2. Downloads the most recent (or a user-specified) dump.
  3. Spins up a one-off Docker Postgres container on a non-default port.
  4. pg_restore the dump into the container.
  5. Runs a smoke check: COUNT(*) on every table to confirm the schema
     restored and data is queryable.
  6. Tears the container down.

Designed to run monthly so the backup chain stays trustworthy. Never
points at production — the restore target is always an isolated local
container.

Usage (from powerupcode/):
    python scripts/restore_db_drill.py --bucket my-puc-backups
    python scripts/restore_db_drill.py --bucket my-puc-backups --key prod/powerupcode/2026/05/01/...

Required IAM policy on the bucket:
    s3:GetObject
    s3:ListBucket
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _import_boto3():  # type: ignore[no-untyped-def]
    try:
        import boto3
    except ImportError as exc:
        raise SystemExit(
            "boto3 is not installed. Install with: pip install -e '.[backups]'"
        ) from exc
    return boto3

# Smoke check: tables we expect to exist post-restore. The list mirrors
# the migrations chain; an empty count is fine (test bucket), but a
# missing table means the dump didn't restore cleanly.
_EXPECTED_TABLES = (
    "users",
    "user_progress",
    "attempts",
    "challenges",
    "proposed_challenges",
    "review_schedule",
    "daily_challenges",
    "friendships",
    "subscriptions",
    "sessions",
)

_RESTORE_CONTAINER = "powerupcode-restore-drill"
_RESTORE_PORT = "55440"
_RESTORE_PASSWORD = "drill"
_RESTORE_DB = "drill"


def _latest_backup_key(s3_client, bucket: str, prefix: str) -> str:  # type: ignore[no-untyped-def]
    """Return the key of the most recently modified object under prefix.
    Pagination handled because the bucket may hold many days of dumps."""
    paginator = s3_client.get_paginator("list_objects_v2")
    latest: tuple[str, object] | None = None
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents") or []:
            key = obj["Key"]
            modified = obj["LastModified"]
            if not key.endswith(".dump"):
                continue
            if latest is None or modified > latest[1]:
                latest = (key, modified)
    if latest is None:
        raise SystemExit(
            f"No .dump objects found under s3://{bucket}/{prefix}"
        )
    return latest[0]


def _docker(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args],
        check=True,
        capture_output=True,
        text=True,
    )


def _wait_for_postgres(container: str, timeout_s: int = 30) -> None:
    """Poll pg_isready inside the container until it succeeds. Postgres
    starts the listener before it's actually ready; without this wait
    pg_restore would race and fail intermittently."""
    deadline = time.monotonic() + timeout_s
    last_err = ""
    while time.monotonic() < deadline:
        result = subprocess.run(
            ["docker", "exec", container, "pg_isready", "-U", "postgres"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return
        last_err = result.stdout + result.stderr
        time.sleep(0.5)
    raise SystemExit(f"Postgres did not become ready in {timeout_s}s: {last_err}")


def _run_in_container(container: str, *cmd: str) -> str:
    result = subprocess.run(
        ["docker", "exec", container, *cmd],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def _smoke_check(container: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    missing: list[str] = []
    for table in _EXPECTED_TABLES:
        try:
            out = _run_in_container(
                container,
                "psql", "-U", "postgres", "-d", _RESTORE_DB,
                "-tAc", f"SELECT COUNT(*) FROM {table};",
            )
            counts[table] = int(out.strip())
        except subprocess.CalledProcessError:
            missing.append(table)
    if missing:
        raise SystemExit(
            f"Smoke check failed — tables missing after restore: {missing}"
        )
    return counts


def _ensure_docker_available() -> None:
    if shutil.which("docker") is None:
        raise SystemExit(
            "docker not on PATH. The restore drill spins up a temporary "
            "Postgres container and cannot run without it."
        )


def _teardown(container: str) -> None:
    """Best-effort: kill any leftover container so re-runs work."""
    subprocess.run(
        ["docker", "rm", "-f", container],
        check=False,
        capture_output=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True, help="S3 bucket holding the backups.")
    parser.add_argument(
        "--prefix",
        default="",
        help="Object prefix to scan (must match what backup_db.py wrote).",
    )
    parser.add_argument(
        "--key",
        default=None,
        help=(
            "Specific dump key to restore. If omitted, the most recent "
            ".dump under --prefix is used."
        ),
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Leave the restore container running for inspection.",
    )
    args = parser.parse_args()

    _ensure_docker_available()

    s3 = _import_boto3().client("s3")
    key = args.key or _latest_backup_key(s3, args.bucket, args.prefix)
    print(f"Restoring s3://{args.bucket}/{key}")

    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / "backup.dump"
        s3.download_file(Bucket=args.bucket, Key=key, Filename=str(local))
        print(f"Downloaded {local.stat().st_size / (1024 * 1024):.2f} MB")

        # Always start clean — leftover containers from a prior failed
        # run would block the port and the name.
        _teardown(_RESTORE_CONTAINER)

        print(f"Starting Postgres container {_RESTORE_CONTAINER}...")
        _docker(
            "run", "-d", "--rm",
            "--name", _RESTORE_CONTAINER,
            "-e", f"POSTGRES_PASSWORD={_RESTORE_PASSWORD}",
            "-e", f"POSTGRES_DB={_RESTORE_DB}",
            "-p", f"{_RESTORE_PORT}:5432",
            "postgres:16-alpine",
        )

        try:
            _wait_for_postgres(_RESTORE_CONTAINER)

            # Copy the dump into the container so pg_restore can see it.
            _docker("cp", str(local), f"{_RESTORE_CONTAINER}:/tmp/backup.dump")

            print("Running pg_restore...")
            _run_in_container(
                _RESTORE_CONTAINER,
                "pg_restore",
                "-U", "postgres",
                "-d", _RESTORE_DB,
                "--no-owner",
                "--no-privileges",
                "/tmp/backup.dump",
            )

            print("Smoke checking restored schema...")
            counts = _smoke_check(_RESTORE_CONTAINER)
            print()
            print("Table row counts:")
            for table, count in counts.items():
                print(f"  {table:<25} {count}")
            print()
            print("PASS: backup restored cleanly.")

        finally:
            if args.keep:
                print(
                    f"\n--keep set: container left running on port {_RESTORE_PORT}. "
                    f"Connect with: psql -h localhost -p {_RESTORE_PORT} "
                    f"-U postgres -d {_RESTORE_DB}"
                )
            else:
                _teardown(_RESTORE_CONTAINER)


if __name__ == "__main__":
    main()
