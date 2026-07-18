# ADR 0005: Canonical messaging expand migration

## Status

Accepted for the 0.6 rollout.

## Context

Vatrushka currently persists server-channel messages and direct messages in separate UUID-based table families. That prevents one realtime contract, monotonic cursor pagination, reliable idempotency, shared read state, durable notifications, and transactional outbox delivery.

The production API must remain compatible while desktop clients migrate. Existing S3 attachment rows may also still be waiting for the legacy database-to-S3 migration.

## Decision

Migration `0017_canonical_messaging_expand` adds the canonical model without dropping or renaming a legacy table:

- one `conversations` table for server text channels, direct messages, and future feature-flagged group DMs;
- monotonic `BIGINT` message IDs, serialized as strings at API boundaries;
- client-generated idempotency IDs;
- shared reactions, structured mentions, read states, notification preferences, notifications, and outbox tables;
- attachment metadata containing S3 object keys only;
- legacy UUID mapping columns used only for backfill and the compatibility window.

Existing channels, direct dialogs, messages, replies, S3-backed attachments, reactions, user mentions, and read positions are backfilled in the same migration. Database-backed legacy attachment bytes remain in their existing tables until the established S3 migration finalizes them; they are never copied into the canonical metadata table.

Canonical attachment/reaction/mention tables use a `conversation_message_` prefix during the additive window because the legacy names are still occupied. A later explicit contract migration may rename them after all compatibility reads and dual-writes have been removed.

## Rollout

1. Expand and backfill with legacy API compatibility.
2. Enable canonical dual-write and consistency metrics.
3. Migrate desktop reads and writes to conversation APIs.
4. Verify parity and complete outstanding attachment migration.
5. Remove legacy API in a later release.
6. Perform a separately reviewed destructive contract migration.

## Consequences

The expand release temporarily stores compatible message metadata twice. This costs database space but permits rollback of application code. Redis remains ephemeral and is not involved in migration correctness. PostgreSQL stays the only durable source of truth.
