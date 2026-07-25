#!/usr/bin/env sh
set -eu
set -f
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

usage() {
  printf '%s\n' 'Usage: verify-host-bootstrap.sh --deploy-user <user> --environment <staging|production>' >&2
  exit 64
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_metadata() {
  path=$1
  expected=$2
  test -f "$path" || fail "Required bootstrap file is missing: $path"
  actual=$(stat -c '%U:%G:%a' -- "$path") || fail "Cannot inspect bootstrap file: $path"
  test "$actual" = "$expected" || fail "Unsafe bootstrap file permissions: $path"
}

test "$(id -u)" -eq 0 || fail 'Run this bootstrap verifier as root.'
deploy_user=''
environment=''
while test "$#" -gt 0; do
  case "$1" in
    --deploy-user) deploy_user=${2-}; shift 2 ;;
    --environment) environment=${2-}; shift 2 ;;
    *) usage ;;
  esac
done
test -n "$deploy_user" && test -n "$environment" || usage
case "$deploy_user" in [a-z_][a-z0-9_-]*) ;; *) fail 'Deploy user is invalid.' ;; esac
case "$environment" in staging|production) ;; *) usage ;; esac

id "$deploy_user" >/dev/null 2>&1 || fail 'Deploy user does not exist.'
id -nG "$deploy_user" | tr ' ' '\n' | grep -Fx docker >/dev/null && fail 'Deploy user must not be in the Docker group.' || true

wrapper_root=/usr/local/lib/vatrushka
for file in \
  "$wrapper_root/vatrushka-wrapper-common.sh" \
  "$wrapper_root/vatrushka-preflight" \
  "$wrapper_root/vatrushka-deploy" \
  "$wrapper_root/vatrushka-rollback" \
  "$wrapper_root/vatrushka-runtime-status" \
  "$wrapper_root/drivers/compose-digest-deploy" \
  "$wrapper_root/drivers/compose-digest-rollback" \
  "$wrapper_root/drivers/observability-deploy" \
  "$wrapper_root/drivers/runtime-status"; do
  require_metadata "$file" root:root:750
done

require_metadata /etc/vatrushka/runtime.env root:root:600
require_metadata /etc/vatrushka/app.env root:root:600
require_metadata /etc/vatrushka/observability.env root:root:600
runtime_environment=$(sed -n 's/^VATRUSHKA_RUNTIME_ENVIRONMENT=//p' /etc/vatrushka/runtime.env)
test "$runtime_environment" = "$environment" || fail 'Runtime environment does not match the requested environment.'

registry_directory=$(sed -n 's/^VATRUSHKA_REGISTRY_AUTH_DIR=//p' /etc/vatrushka/runtime.env)
case "$registry_directory" in /*) ;; *) fail 'Registry credential directory is invalid.' ;; esac
registry_metadata=$(stat -c '%U:%G:%a' -- "$registry_directory") || fail 'Registry credential directory is missing.'
test "$registry_metadata" = root:root:700 || fail 'Registry credential directory permissions are unsafe.'
require_metadata "$registry_directory/config.json" root:root:600

test -d /var/lib/vatrushka/inbox || fail 'Deploy inbox is missing.'
inbox_metadata=$(stat -c '%U:%G:%a' -- /var/lib/vatrushka/inbox)
test "$inbox_metadata" = "$deploy_user:$deploy_user:700" || fail 'Deploy inbox ownership or permissions are unsafe.'
visudo -cf /etc/sudoers.d/vatrushka-deploy >/dev/null || fail 'Deploy sudoers validation failed.'

printf 'bootstrap=ready environment=%s deploy_user=%s\n' "$environment" "$deploy_user"
