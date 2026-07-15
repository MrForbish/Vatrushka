#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

PUBLIC_IP="$(curl --fail --silent --show-error --max-time 10 https://api.ipify.org)"
if [[ ! "${PUBLIC_IP}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not determine a public IPv4 address" >&2
  exit 1
fi

echo "Detected public IPv4: ${PUBLIC_IP}"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 7881/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 50000:60000/udp
ufw --force enable
ufw status verbose
