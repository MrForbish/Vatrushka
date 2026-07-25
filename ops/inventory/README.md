# Redacted infrastructure inventory contract

This directory contains metadata needed for delivery planning, never credentials or live secret values.

Each host record must state: role, lifecycle (`planned`, `active`, `retired`), environment, owner, public DNS aliases, private network identity/CIDR reference, deploy wrapper path, observability agent role, backup class and last audited date. Do not commit IP addresses unless they are intentionally public, passwords, private keys, `.env` contents, bucket credentials, database URLs or user personal data.

The staging record remains `planned` until the new production migration and observation window are complete, then the former production VPS is intentionally retired and reinstalled.
