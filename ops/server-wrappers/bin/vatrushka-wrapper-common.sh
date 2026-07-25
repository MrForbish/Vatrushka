#!/usr/bin/env sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

readonly VATRUSHKA_WRAPPER_ROOT=/usr/local/lib/vatrushka
readonly VATRUSHKA_MANIFEST_ROOT=/var/lib/vatrushka/manifests
readonly VATRUSHKA_INBOX_ROOT=/var/lib/vatrushka/inbox
readonly VATRUSHKA_SOURCE_ROOT=/var/lib/vatrushka/sources
readonly VATRUSHKA_ACTIVE_CANDIDATE_FILE=/var/lib/vatrushka/manifests/active-candidate

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

require_root_file() {
  file=$1
  expected=$2
  test -f "$file" || fail "Required protected file is missing."
  owner=$(stat -c '%U:%G:%a' -- "$file") || fail "Protected file metadata cannot be read."
  test "$owner" = "$expected" || fail "Protected file permissions are unsafe."
}

audit() {
  # The identifier is intentionally limited to a release version or SHA from a
  # validated manifest. Do not put paths, environment values or secrets here.
  logger -t vatrushka-wrapper -- "wrapper=$1 release=$2 result=$3" 2>/dev/null || true
}

require_no_arguments() {
  test "$#" -eq 0 || fail "This command does not accept arguments."
}

require_manifest() {
  test "$#" -eq 1 || fail "Exactly one manifest path is required."
  candidate=$1
  case "$candidate" in
    "$VATRUSHKA_MANIFEST_ROOT"/*.json) ;;
    *) fail "Manifest path is not allowlisted." ;;
  esac

  manifest=$(readlink -f -- "$candidate") || fail "Manifest path cannot be resolved."
  case "$manifest" in
    "$VATRUSHKA_MANIFEST_ROOT"/*.json) ;;
    *) fail "Resolved manifest path is not allowlisted." ;;
  esac
  test -f "$manifest" || fail "Manifest is not a regular file."

  owner=$(stat -c '%U:%G:%a' -- "$manifest") || fail "Manifest metadata cannot be read."
  test "$owner" = 'root:root:640' || fail "Manifest must be root:root mode 0640."

  checksum_file="$manifest.sha256"
  test -f "$checksum_file" || fail "Manifest checksum is missing."
  checksum_owner=$(stat -c '%U:%G:%a' -- "$checksum_file") || fail "Manifest checksum metadata cannot be read."
  test "$checksum_owner" = 'root:root:640' || fail "Manifest checksum must be root:root mode 0640."
  (cd "$(dirname "$manifest")" && sha256sum --check --status "$(basename "$checksum_file")") || fail "Manifest checksum does not match."

  printf '%s\n' "$manifest"
}

stage_candidate_manifest() {
  test "$#" -eq 1 || fail "Exactly one candidate manifest path is required."
  candidate=$1
  case "$candidate" in
    "$VATRUSHKA_INBOX_ROOT"/*.json) ;;
    *) fail "Candidate manifest path is not allowlisted." ;;
  esac
  test ! -L "$candidate" || fail "Candidate manifest must not be a symlink."
  test -f "$candidate" || fail "Candidate manifest is not a regular file."

  owner=$(stat -c '%U:%G:%a' -- "$candidate") || fail "Candidate manifest metadata cannot be read."
  case "$owner" in
    vatrushka_deploy:vatrushka_deploy:600|vatrushka_deploy:vatrushka_deploy:640|vatrushka_deploy:vatrushka_deploy:644) ;;
    *) fail "Candidate manifest must be owned by the deploy user and not writable by others." ;;
  esac

  checksum=$(sha256sum -- "$candidate" | awk '{print $1}') || fail "Candidate manifest checksum cannot be calculated."
  case "$checksum" in
    *[!0-9a-f]*|'') fail "Candidate manifest checksum is invalid." ;;
  esac
  manifest="$VATRUSHKA_MANIFEST_ROOT/candidate-$checksum.json"
  checksum_file="$manifest.sha256"
  install -d -m 0750 -o root -g root "$VATRUSHKA_MANIFEST_ROOT"

  if test -e "$manifest"; then
    test -f "$checksum_file" || fail "Existing candidate manifest checksum is missing."
    (cd "$VATRUSHKA_MANIFEST_ROOT" && sha256sum --check --status "$(basename "$checksum_file")") || fail "Existing candidate manifest checksum does not match."
  else
    temp=$(mktemp "$VATRUSHKA_MANIFEST_ROOT/.candidate.XXXXXX") || fail "Candidate manifest staging failed."
    trap 'rm -f -- "$temp" "$temp.sha256"' EXIT HUP INT TERM
    install -m 0640 -o root -g root "$candidate" "$temp"
    printf '%s  %s\n' "$checksum" "$(basename "$manifest")" >"$temp.sha256"
    mv -- "$temp" "$manifest"
    mv -- "$temp.sha256" "$checksum_file"
    trap - EXIT HUP INT TERM
  fi
  rm -f -- "$candidate"
  printf '%s\n' "$manifest"
}

candidate_source_archive_sha() {
  python3 - "$1" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    value = json.load(source).get("sourceArchiveSha256")
if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value, re.I):
    raise SystemExit("Candidate source archive checksum is invalid")
print(value.lower())
PY
}

validate_candidate_source_archive() {
  python3 - "$1" <<'PY'
from pathlib import PurePosixPath
import tarfile
import sys

limit = 2 * 1024 * 1024 * 1024
total = 0
with tarfile.open(sys.argv[1], "r:gz") as archive:
    members = archive.getmembers()
    if len(members) > 10000:
        raise SystemExit("Candidate source archive has too many entries")
    for member in members:
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk() or member.isdev():
            raise SystemExit("Candidate source archive contains an unsafe entry")
        total += member.size
        if total > limit:
            raise SystemExit("Candidate source archive is too large")
PY
}

stage_candidate_source_archive() {
  manifest=$1
  checksum=$(candidate_source_archive_sha "$manifest") || fail "Candidate source archive checksum is invalid."
  candidate="$VATRUSHKA_INBOX_ROOT/$checksum.tar.gz"
  test ! -L "$candidate" || fail "Candidate source archive must not be a symlink."
  test -f "$candidate" || fail "Candidate source archive is missing."
  owner=$(stat -c '%U:%G:%a' -- "$candidate") || fail "Candidate source archive metadata cannot be read."
  case "$owner" in
    vatrushka_deploy:vatrushka_deploy:600|vatrushka_deploy:vatrushka_deploy:640|vatrushka_deploy:vatrushka_deploy:644) ;;
    *) fail "Candidate source archive must be owned by the deploy user and not writable by others." ;;
  esac
  actual=$(sha256sum -- "$candidate" | awk '{print $1}') || fail "Candidate source archive checksum cannot be calculated."
  test "$actual" = "$checksum" || fail "Candidate source archive checksum does not match manifest."
  validate_candidate_source_archive "$candidate" || fail "Candidate source archive is unsafe."

  archive="$VATRUSHKA_SOURCE_ROOT/$checksum.tar.gz"
  install -d -m 0750 -o root -g root "$VATRUSHKA_SOURCE_ROOT"
  if test -e "$archive"; then
    require_root_file "$archive" root:root:640
    existing=$(sha256sum -- "$archive" | awk '{print $1}') || fail "Stored source archive checksum cannot be calculated."
    test "$existing" = "$checksum" || fail "Stored source archive checksum does not match."
  else
    temp=$(mktemp "$VATRUSHKA_SOURCE_ROOT/.candidate-source.XXXXXX") || fail "Candidate source archive staging failed."
    trap 'rm -f -- "$temp"' EXIT HUP INT TERM
    install -m 0640 -o root -g root "$candidate" "$temp"
    mv -- "$temp" "$archive"
    trap - EXIT HUP INT TERM
  fi
  rm -f -- "$candidate"
}

manifest_release_id() {
  python3 - "$1" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    manifest = json.load(source)

def reject_sensitive(value, path="manifest"):
    if isinstance(value, dict):
        for key, nested in value.items():
            if re.search(r"password|secret|token|private.?key|database.?url|access.?key", key, re.I):
                raise SystemExit(f"Sensitive field in {path}")
            reject_sensitive(nested, f"{path}.{key}")
    elif isinstance(value, list):
        raise SystemExit("Manifest arrays are not allowed")

reject_sensitive(manifest)

value = manifest.get("version") or manifest.get("releaseVersion")
if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", value):
    raise SystemExit("Release identifier is invalid")
print(value)
PY
}

manifest_checksum() {
  manifest=$1
  sha256sum -- "$manifest" | awk '{print $1}' || fail "Manifest checksum cannot be calculated."
}

canonical_candidate_manifest_from_checksum() {
  checksum=$1
  case "$checksum" in
    *[!0-9a-f]*|'') fail "Candidate manifest checksum is invalid." ;;
  esac
  manifest="$VATRUSHKA_MANIFEST_ROOT/candidate-$checksum.json"
  require_manifest "$manifest" >/dev/null
  require_manifest_type "$manifest" candidate
  printf '%s\n' "$manifest"
}

require_manifest_type() {
  manifest=$1
  expected=$2
  python3 - "$manifest" "$expected" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    manifest = json.load(source)

expected = sys.argv[2]
if expected == "candidate":
    required = {"version", "commitSha", "sourceArchiveSha256", "dependencyLockSha256", "channel", "apiEnvironment", "images"}
elif expected == "rollback":
    required = {"releaseVersion", "previousCandidateSha256", "commitSha", "dependencyLockSha256", "images"}
else:
    raise SystemExit("Unknown manifest type")

if not required.issubset(manifest):
    raise SystemExit("Manifest does not have the required fields")

if expected == "candidate":
    allowed = required | {"migration", "desktop"}
    if set(manifest) - allowed:
        raise SystemExit("Candidate manifest has unsupported fields")
    if not isinstance(manifest["images"], dict) or not manifest["images"]:
        raise SystemExit("Candidate manifest images are invalid")
    for name, digest in manifest["images"].items():
        if not re.fullmatch(r"[a-z][a-z0-9-]*", name) or not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest, re.I):
            raise SystemExit("Candidate manifest image digest is invalid")
    if manifest["channel"] not in {"beta", "rc", "stable"} or manifest["apiEnvironment"] not in {"staging", "production"}:
        raise SystemExit("Candidate manifest environment is invalid")
    migration = manifest.get("migration")
    if migration is not None and (not isinstance(migration, dict) or set(migration) != {"required", "compatibility"} or type(migration["required"]) is not bool or migration["compatibility"] not in {"none", "backward-compatible", "manual-review"}):
        raise SystemExit("Candidate manifest migration metadata is invalid")
else:
    if set(manifest) - required:
        raise SystemExit("Rollback manifest has unsupported fields")
    if not isinstance(manifest["releaseVersion"], str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", manifest["releaseVersion"]):
        raise SystemExit("Rollback release version is invalid")
    for field in {"previousCandidateSha256", "dependencyLockSha256"}:
        if not isinstance(manifest[field], str) or not re.fullmatch(r"[a-f0-9]{64}", manifest[field], re.I):
            raise SystemExit("Rollback manifest checksum is invalid")
    if not isinstance(manifest["commitSha"], str) or not re.fullmatch(r"[a-f0-9]{40}", manifest["commitSha"], re.I):
        raise SystemExit("Rollback manifest commit is invalid")
    if not isinstance(manifest["images"], dict) or not manifest["images"]:
        raise SystemExit("Rollback manifest images are invalid")
    for name, digest in manifest["images"].items():
        if not re.fullmatch(r"[a-z][a-z0-9-]*", name) or not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest, re.I):
            raise SystemExit("Rollback manifest image digest is invalid")
PY
}

run_fixed_driver() {
  driver=$1
  manifest=$2
  release=$3
  path="$VATRUSHKA_WRAPPER_ROOT/drivers/$driver"
  test -x "$path" || fail "Approved runtime driver is not installed."
  audit "$(basename "$0")" "$release" "started"
  if "$path" "$manifest"; then
    audit "$(basename "$0")" "$release" "succeeded"
  else
    status=$?
    audit "$(basename "$0")" "$release" "failed"
    exit "$status"
  fi
}
