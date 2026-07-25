#!/usr/bin/env python3
"""Fail-closed, value-redacted production runtime readiness validation."""

from __future__ import annotations

import re
import sys
from uuid import uuid4
from pathlib import Path
from urllib.parse import urlparse

RUNTIME_CONFIG = Path("/etc/vatrushka/runtime.env")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(64)


def require_root_file(path: Path) -> None:
    try:
        metadata = path.stat()
    except FileNotFoundError:
        fail("Required production configuration is missing.")
    if (
        not path.is_file()
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or (metadata.st_mode & 0o777) != 0o600
    ):
        fail("Production configuration permissions are unsafe.")


def parse_environment(path: Path) -> dict[str, str]:
    require_root_file(path)
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            fail("Production application configuration is malformed.")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            fail("Production application configuration is malformed.")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


runtime = parse_environment(RUNTIME_CONFIG)
if runtime.get("VATRUSHKA_RUNTIME_ENVIRONMENT") != "production":
    fail("Production runtime environment is invalid.")
environment_path = runtime.get("VATRUSHKA_ENV_FILE", "")
if not re.fullmatch(r"/[A-Za-z0-9._/-]+", environment_path):
    fail("Production runtime environment is invalid.")

values = parse_environment(Path(environment_path))


def require_nonempty(*keys: str) -> None:
    if any(not values.get(key, "") for key in keys):
        fail("Production application configuration is incomplete.")


def require_https(key: str) -> None:
    parsed = urlparse(values.get(key, ""))
    if parsed.scheme != "https" or not parsed.netloc:
        fail("Production application configuration is invalid.")


def require_wss(key: str) -> None:
    parsed = urlparse(values.get(key, ""))
    if parsed.scheme != "wss" or not parsed.netloc:
        fail("Production application configuration is invalid.")


def require_hostname(key: str) -> None:
    if not re.fullmatch(
        r"(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}",
        values.get(key, ""),
        re.I,
    ):
        fail("Production application configuration is invalid.")


require_nonempty(
    "POSTGRES_PASSWORD",
    "REDIS_PASSWORD",
    "ACCESS_TOKEN_SECRET",
    "CREDENTIAL_ENCRYPTION_KEY",
    "OTP_PEPPER",
    "SMTP_HOST",
    "SMTP_FROM_EMAIL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LIVEKIT_WEBHOOK_URL",
    "DOMAIN",
    "ACME_EMAIL",
    "TURN_DOMAIN",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_KEY_PREFIX",
)
if values.get("MEDIA_STORAGE_DRIVER") != "s3":
    fail("Production application configuration is invalid.")
if (
    values.get("S3_ENDPOINT") != "https://s3.twcstorage.ru"
    or values.get("S3_REGION") != "ru-1"
    or values.get("S3_BUCKET") != "media-vatrushka"
    or values.get("S3_FORCE_PATH_STYLE") != "true"
    or values.get("S3_KEY_PREFIX") != "uploads"
):
    fail("Production media storage configuration is invalid.")
for key in ("ACCESS_TOKEN_SECRET", "CREDENTIAL_ENCRYPTION_KEY", "OTP_PEPPER"):
    if len(values[key]) < 32 or values[key].startswith("development-"):
        fail("Production application configuration is invalid.")
for key in (
    "PUBLIC_API_URL",
    "PUBLIC_INVITE_URL",
    "LIVEKIT_HTTP_URL",
    "LIVEKIT_WEBHOOK_URL",
    "S3_ENDPOINT",
):
    require_https(key)
require_wss("LIVEKIT_URL")
for key in ("DOMAIN", "TURN_DOMAIN"):
    require_hostname(key)
if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", values["SMTP_FROM_EMAIL"]):
    fail("Production application configuration is invalid.")
if not re.fullmatch(r"[a-z0-9](?:[a-z0-9/_-]*[a-z0-9])?", values["S3_KEY_PREFIX"]):
    fail("Production application configuration is invalid.")
certificate_root = values.get("TURN_CERT_DIRECTORY", "/etc/letsencrypt/live")
if not re.fullmatch(r"/etc/letsencrypt(?:/[A-Za-z0-9._-]+)*", certificate_root):
    fail("Production application configuration is invalid.")
certificate_directory = Path(certificate_root) / values["TURN_DOMAIN"]
if not (certificate_directory / "fullchain.pem").is_file() or not (
    certificate_directory / "privkey.pem"
).is_file():
    fail("Production application configuration is incomplete.")


def verify_media_storage() -> None:
    try:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=values["S3_ENDPOINT"],
            region_name=values["S3_REGION"],
            aws_access_key_id=values["S3_ACCESS_KEY_ID"],
            aws_secret_access_key=values["S3_SECRET_ACCESS_KEY"],
            config=Config(s3={"addressing_style": "path"}),
        )
        key = f"{values['S3_KEY_PREFIX']}/.runtime-preflight/{uuid4().hex}"
        try:
            client.put_object(Bucket=values["S3_BUCKET"], Key=key, Body=b"vatrushka")
            client.head_object(Bucket=values["S3_BUCKET"], Key=key)
        finally:
            client.delete_object(Bucket=values["S3_BUCKET"], Key=key)
    except Exception:
        fail("Production media storage probe failed.")


verify_media_storage()
print("runtime_preflight=ready environment=production")
