CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "email" text NOT NULL,
  "display_name" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE ("email")
);

CREATE TABLE "auth_codes" (
  "id" uuid PRIMARY KEY,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "purpose" text NOT NULL CHECK ("purpose" = 'login'),
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX "auth_codes_email_idx" ON "auth_codes" ("email");
CREATE INDEX "auth_codes_expires_at_idx" ON "auth_codes" ("expires_at");

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "token_family_id" uuid NOT NULL,
  "device_name" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "replaced_by_session_id" uuid,
  "created_at" timestamptz NOT NULL,
  "last_used_at" timestamptz NOT NULL
);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "sessions"("id");
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX "sessions_family_id_idx" ON "sessions" ("token_family_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions" ("expires_at");

CREATE TABLE "rooms" (
  "id" uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "livekit_room_name" text NOT NULL UNIQUE,
  "status" text NOT NULL CHECK ("status" IN ('active', 'closed', 'expired')),
  "is_locked" boolean NOT NULL DEFAULT false,
  "max_participants" integer NOT NULL DEFAULT 5 CHECK ("max_participants" = 5),
  "expires_at" timestamptz NOT NULL,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX "rooms_owner_idx" ON "rooms" ("owner_user_id");
CREATE INDEX "rooms_status_expires_idx" ON "rooms" ("status", "expires_at");

CREATE TABLE "guest_sessions" (
  "id" uuid PRIMARY KEY,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX "guest_sessions_room_idx" ON "guest_sessions" ("room_id");
CREATE INDEX "guest_sessions_expires_idx" ON "guest_sessions" ("expires_at");

CREATE TABLE "screen_share_leases" (
  "room_id" uuid PRIMARY KEY REFERENCES "rooms"("id") ON DELETE CASCADE,
  "participant_identity" text NOT NULL,
  "participant_display_name" text NOT NULL,
  "acquired_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);
CREATE INDEX "screen_share_lease_expires_idx" ON "screen_share_leases" ("expires_at");
