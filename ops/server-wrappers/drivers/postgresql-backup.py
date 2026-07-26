#!/usr/bin/env python3
"""Create one encrypted, checksum-bound PostgreSQL backup without exposing credentials."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import boto3
except ImportError:
    boto3 = None

RUNTIME_CONFIG = Path("/etc/vatrushka/runtime.env")
BACKUP_CONFIG = Path("/etc/vatrushka/backup.env")
BACKUP_ROOT = Path("/var/lib/vatrushka/backups")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(64)


def require_root_file(path: Path) -> None:
    try:
        metadata = path.stat()
    except FileNotFoundError:
        fail("Required protected backup file is missing.")
    if not path.is_file() or metadata.st_uid != 0 or metadata.st_gid != 0 or (metadata.st_mode & 0o777) != 0o600:
        fail("Protected backup file permissions are unsafe.")


def parse_config(path: Path, required: dict[str, str]) -> dict[str, str]:
    require_root_file(path)
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            fail("Backup configuration is malformed.")
        key, value = line.split("=", 1)
        if key not in required or not re.fullmatch(required[key], value):
            fail("Backup configuration is invalid.")
        values[key] = value
    if set(values) != set(required):
        fail("Backup configuration is incomplete.")
    return values


def require_command(name: str) -> str:
    result = shutil.which(name)
    if result is None:
        fail("Required backup dependency is unavailable.")
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, output=None) -> None:
    try:
        subprocess.run(command, check=True, stdout=output, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError:
        fail("PostgreSQL backup operation failed.")


runtime = parse_config(
    RUNTIME_CONFIG,
    {
        "VATRUSHKA_RUNTIME_ENVIRONMENT": r"production",
        "VATRUSHKA_APP_DIR": r"/[A-Za-z0-9._/-]+",
        "VATRUSHKA_ENV_FILE": r"/[A-Za-z0-9._/-]+",
        "VATRUSHKA_RUNTIME_RELEASES_DIR": r"/[A-Za-z0-9._/-]+",
        "VATRUSHKA_API_IMAGE_REPOSITORY": r"[a-z0-9./:_-]+",
        "VATRUSHKA_REGISTRY_AUTH_DIR": r"/[A-Za-z0-9._/-]+",
        "VATRUSHKA_UPDATE_FEED_DIR": r"/[A-Za-z0-9._/-]+",
    },
)
backup = parse_config(
    BACKUP_CONFIG,
    {
        "BACKUP_S3_ENDPOINT": r"https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?",
        "BACKUP_S3_REGION": r"[a-z0-9-]{2,32}",
        "BACKUP_S3_BUCKET": r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]",
        "BACKUP_S3_PREFIX": r"[A-Za-z0-9._/-]{1,128}",
        "BACKUP_AWS_ACCESS_KEY_ID": r"[A-Za-z0-9/+=._-]{8,256}",
        "BACKUP_AWS_SECRET_ACCESS_KEY": r"[A-Za-z0-9/+=._-]{8,256}",
        "BACKUP_AGE_RECIPIENT": r"age1[ac-hj-np-z02-9]{20,200}",
    },
)

app_dir = Path(runtime["VATRUSHKA_APP_DIR"])
environment_file = Path(runtime["VATRUSHKA_ENV_FILE"])
compose_file = app_dir / "infra/docker/docker-compose.yml"
require_root_file(environment_file)
docker = require_command("docker")
age = require_command("age")
if boto3 is None:
    fail("Required backup dependency is unavailable.")

# A protected tag must establish whether there is a database to preserve before
# it can activate a new runtime. On the first deployment there is deliberately
# no active release yet: validate the protected backup boundary and return a
# distinct no-op result instead of manufacturing an empty backup or allowing
# the release pipeline to bypass this gate.
if app_dir.is_symlink() is False:
    print("backup=not-required environment=production reason=runtime-inactive")
    raise SystemExit(0)
if not compose_file.is_file():
    fail("Production runtime is invalid.")

BACKUP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(BACKUP_ROOT, 0o700)

now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
backup_id = now.strftime("%Y%m%dT%H%M%SZ")
workspace = Path(tempfile.mkdtemp(prefix=f"postgresql-{backup_id}-", dir=BACKUP_ROOT))
dump = workspace / f"vatrushka-postgresql-{backup_id}.dump"
encrypted = workspace / f"vatrushka-postgresql-{backup_id}.dump.age"
manifest = workspace / f"vatrushka-postgresql-{backup_id}.json"

try:
    with dump.open("wb") as destination:
        run(
            [
                docker,
                "compose",
                "--env-file",
                str(environment_file),
                "-p",
                "vatrushka",
                "-f",
                str(compose_file),
                "exec",
                "-T",
                "postgres",
                "sh",
                "-ec",
                'exec pg_dump --format=custom --compress=9 --no-owner --no-privileges --username="$POSTGRES_USER" "$POSTGRES_DB"',
            ],
            output=destination,
        )
    run([age, "-r", backup["BACKUP_AGE_RECIPIENT"], "-o", str(encrypted), str(dump)])
    digest = sha256(encrypted)
    document = {
        "schemaVersion": 1,
        "backupId": backup_id,
        "createdAt": now.isoformat().replace("+00:00", "Z"),
        "environment": "production",
        "format": "pg_dump custom, compressed, age encrypted",
        "sha256": digest,
        "sizeBytes": encrypted.stat().st_size,
    }
    manifest.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    s3 = boto3.client(
        "s3",
        endpoint_url=backup["BACKUP_S3_ENDPOINT"],
        region_name=backup["BACKUP_S3_REGION"],
        aws_access_key_id=backup["BACKUP_AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=backup["BACKUP_AWS_SECRET_ACCESS_KEY"],
    )

    def upload(local: Path, root: str) -> None:
        try:
            s3.upload_file(str(local), backup["BACKUP_S3_BUCKET"], f"{root}/{local.name}")
        except Exception:
            fail("PostgreSQL backup upload failed.")

    target_root = f"{backup['BACKUP_S3_PREFIX'].strip('/')}/daily/{backup_id}"
    for local in (encrypted, manifest):
        upload(local, target_root)
    if now.weekday() == 6:
        weekly_root = f"{backup['BACKUP_S3_PREFIX'].strip('/')}/weekly/{backup_id}"
        for local in (encrypted, manifest):
            upload(local, weekly_root)
finally:
    shutil.rmtree(workspace, ignore_errors=True)

print(f"backup=ready environment=production backup_id={backup_id}")
