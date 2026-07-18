CREATE TYPE "public"."conversation_mention_type" AS ENUM('user', 'role', 'everyone');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('server_channel', 'direct', 'group_direct');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('direct_message', 'mention', 'reply', 'server_invite', 'moderation', 'system');--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"notifications_muted_until" timestamp with time zone,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_message_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" bigint,
	"uploader_user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"preview_object_key" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_message_mentions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" bigint NOT NULL,
	"mention_type" "conversation_mention_type" NOT NULL,
	"mentioned_user_id" uuid,
	"mentioned_role_id" uuid,
	"start" integer,
	"length" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_message_reactions" (
	"message_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_message_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "conversation_notification_preferences" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"level" text DEFAULT 'mentions' NOT NULL,
	"muted_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_notification_preferences_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_read_states" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_delivered_message_id" bigint,
	"last_read_message_id" bigint,
	"last_delivered_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"mention_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_read_states_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "conversation_type" NOT NULL,
	"server_id" uuid,
	"channel_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"reply_to_message_id" bigint,
	"client_message_id" uuid NOT NULL,
	"legacy_text_message_id" uuid,
	"legacy_direct_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"actor_user_id" uuid,
	"conversation_id" uuid,
	"message_id" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "server_notification_preferences" (
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"level" text DEFAULT 'mentions' NOT NULL,
	"muted_until" timestamp with time zone,
	"suppress_everyone" boolean DEFAULT false NOT NULL,
	"suppress_roles" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_notification_preferences_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"desktop_enabled" boolean DEFAULT true NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"show_preview" boolean DEFAULT true NOT NULL,
	"direct_messages_enabled" boolean DEFAULT true NOT NULL,
	"mentions_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"quiet_hours_timezone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_attachments" ADD CONSTRAINT "conversation_message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_attachments" ADD CONSTRAINT "conversation_message_attachments_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_mentioned_role_id_server_roles_id_fk" FOREIGN KEY ("mentioned_role_id") REFERENCES "public"."server_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_reactions" ADD CONSTRAINT "conversation_message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_reactions" ADD CONSTRAINT "conversation_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notification_preferences" ADD CONSTRAINT "conversation_notification_preferences_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notification_preferences" ADD CONSTRAINT "conversation_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_last_delivered_message_id_messages_id_fk" FOREIGN KEY ("last_delivered_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_server_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."server_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_notification_preferences" ADD CONSTRAINT "server_notification_preferences_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_notification_preferences" ADD CONSTRAINT "server_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_members_user_active_idx" ON "conversation_members" USING btree ("user_id","left_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_attachments_object_key_unique" ON "conversation_message_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "conversation_message_attachments_message_idx" ON "conversation_message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversation_message_attachments_uploader_idx" ON "conversation_message_attachments" USING btree ("uploader_user_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_message_mentions_message_idx" ON "conversation_message_mentions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversation_message_mentions_user_idx" ON "conversation_message_mentions" USING btree ("mentioned_user_id","message_id");--> statement-breakpoint
CREATE INDEX "conversation_message_mentions_role_idx" ON "conversation_message_mentions" USING btree ("mentioned_role_id","message_id");--> statement-breakpoint
CREATE INDEX "conversation_message_reactions_message_idx" ON "conversation_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversation_notification_preferences_user_idx" ON "conversation_notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_read_states_user_idx" ON "conversation_read_states" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_channel_unique" ON "conversations" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "conversations_server_updated_idx" ON "conversations" USING btree ("server_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_type_updated_idx" ON "conversations" USING btree ("type","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_author_client_message_unique" ON "messages" USING btree ("author_id","client_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_legacy_text_unique" ON "messages" USING btree ("legacy_text_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_legacy_direct_unique" ON "messages" USING btree ("legacy_direct_message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_history_idx" ON "messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "messages_author_history_idx" ON "messages" USING btree ("author_id","id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_conversation_idx" ON "notifications" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_available_idx" ON "outbox_events" USING btree ("available_at","id");--> statement-breakpoint
CREATE INDEX "server_notification_preferences_user_idx" ON "server_notification_preferences" USING btree ("user_id");--> statement-breakpoint

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shape_check" CHECK (
	("type" = 'server_channel' AND "server_id" IS NOT NULL AND "channel_id" IS NOT NULL)
	OR ("type" IN ('direct', 'group_direct') AND "server_id" IS NULL AND "channel_id" IS NULL)
);--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_target_check" CHECK (
	("mention_type" = 'user' AND "mentioned_user_id" IS NOT NULL AND "mentioned_role_id" IS NULL)
	OR ("mention_type" = 'role' AND "mentioned_user_id" IS NULL AND "mentioned_role_id" IS NOT NULL)
	OR ("mention_type" = 'everyone' AND "mentioned_user_id" IS NULL AND "mentioned_role_id" IS NULL)
);--> statement-breakpoint
ALTER TABLE "server_notification_preferences" ADD CONSTRAINT "server_notification_preferences_level_check" CHECK ("level" IN ('all', 'mentions', 'none'));--> statement-breakpoint
ALTER TABLE "conversation_notification_preferences" ADD CONSTRAINT "conversation_notification_preferences_level_check" CHECK ("level" IN ('all', 'mentions', 'none'));--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" ("user_id", "created_at" DESC) WHERE "read_at" IS NULL AND "dismissed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_events_unprocessed_idx" ON "outbox_events" ("available_at", "id") WHERE "processed_at" IS NULL AND "failed_at" IS NULL;--> statement-breakpoint

-- Backfill every existing text channel and direct dialog without changing the
-- legacy tables. The compatibility API remains available during dual-write.
INSERT INTO "conversations" ("id", "type", "server_id", "channel_id", "created_by", "created_at", "updated_at")
SELECT channel."id", 'server_channel', channel."server_id", channel."id", server."owner_user_id", channel."created_at", channel."updated_at"
FROM "server_channels" channel
JOIN "servers" server ON server."id" = channel."server_id"
WHERE channel."type" = 'text'
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "conversations" ("id", "type", "created_by", "created_at", "updated_at")
SELECT direct."id", 'direct', direct."user_a_id", direct."created_at", direct."updated_at"
FROM "direct_conversations" direct
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "conversation_members" ("conversation_id", "user_id", "joined_at")
SELECT direct."id", direct."user_a_id", direct."created_at" FROM "direct_conversations" direct
UNION ALL
SELECT direct."id", direct."user_b_id", direct."created_at" FROM "direct_conversations" direct
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;--> statement-breakpoint

INSERT INTO "messages" ("conversation_id", "author_id", "content", "client_message_id", "legacy_text_message_id", "created_at", "edited_at")
SELECT legacy."channel_id", legacy."author_user_id", legacy."content", legacy."id", legacy."id", legacy."created_at", legacy."edited_at"
FROM "text_messages" legacy
ORDER BY legacy."created_at", legacy."id";--> statement-breakpoint

INSERT INTO "messages" ("conversation_id", "author_id", "content", "client_message_id", "legacy_direct_message_id", "created_at", "edited_at")
SELECT legacy."conversation_id", legacy."author_user_id", legacy."content", legacy."id", legacy."id", legacy."created_at", legacy."edited_at"
FROM "direct_messages" legacy
ORDER BY legacy."created_at", legacy."id";--> statement-breakpoint

UPDATE "messages" canonical
SET "reply_to_message_id" = reply."id"
FROM "text_messages" legacy
JOIN "messages" reply ON reply."legacy_text_message_id" = legacy."reply_to_message_id"
WHERE canonical."legacy_text_message_id" = legacy."id";--> statement-breakpoint

UPDATE "messages" canonical
SET "reply_to_message_id" = reply."id"
FROM "direct_messages" legacy
JOIN "messages" reply ON reply."legacy_direct_message_id" = legacy."reply_to_message_id"
WHERE canonical."legacy_direct_message_id" = legacy."id";--> statement-breakpoint

INSERT INTO "conversation_message_attachments" ("id", "message_id", "uploader_user_id", "object_key", "original_name", "mime_type", "size_bytes", "finalized_at", "created_at")
SELECT attachment."id", canonical."id", attachment."uploader_user_id", attachment."storage_key", attachment."file_name", attachment."mime_type", attachment."size", attachment."created_at", attachment."created_at"
FROM "message_attachments" attachment
JOIN "messages" canonical ON canonical."legacy_text_message_id" = attachment."message_id"
WHERE attachment."storage_key" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "conversation_message_attachments" ("id", "message_id", "uploader_user_id", "object_key", "original_name", "mime_type", "size_bytes", "finalized_at", "created_at")
SELECT attachment."id", canonical."id", attachment."uploader_user_id", attachment."storage_key", attachment."file_name", attachment."mime_type", attachment."size", attachment."created_at", attachment."created_at"
FROM "direct_message_attachments" attachment
JOIN "messages" canonical ON canonical."legacy_direct_message_id" = attachment."message_id"
WHERE attachment."storage_key" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "conversation_message_reactions" ("message_id", "user_id", "emoji", "created_at")
SELECT canonical."id", reaction."user_id", reaction."emoji", reaction."created_at"
FROM "message_reactions" reaction
JOIN "messages" canonical ON canonical."legacy_text_message_id" = reaction."message_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "conversation_message_reactions" ("message_id", "user_id", "emoji", "created_at")
SELECT canonical."id", reaction."user_id", reaction."emoji", reaction."created_at"
FROM "direct_message_reactions" reaction
JOIN "messages" canonical ON canonical."legacy_direct_message_id" = reaction."message_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "conversation_message_mentions" ("id", "message_id", "mention_type", "mentioned_user_id", "start", "length", "created_at")
SELECT gen_random_uuid(), canonical."id", 'user', mention."mentioned_user_id", mention."start", mention."length", canonical."created_at"
FROM "message_mentions" mention
JOIN "messages" canonical ON canonical."legacy_text_message_id" = mention."message_id";--> statement-breakpoint

INSERT INTO "conversation_read_states" ("conversation_id", "user_id", "last_delivered_message_id", "last_read_message_id", "last_delivered_at", "last_read_at", "mention_count")
SELECT state."channel_id", state."user_id", latest."id", latest."id", state."read_at", state."read_at", COALESCE(unread_mentions."count", 0)::integer
FROM "channel_read_states" state
JOIN "conversations" conversation ON conversation."id" = state."channel_id"
LEFT JOIN LATERAL (
	SELECT message."id" FROM "messages" message
	WHERE message."conversation_id" = state."channel_id" AND message."created_at" <= state."read_at"
	ORDER BY message."id" DESC LIMIT 1
) latest ON true
LEFT JOIN LATERAL (
	SELECT count(*) AS "count" FROM "conversation_message_mentions" mention
	JOIN "messages" message ON message."id" = mention."message_id"
	WHERE message."conversation_id" = state."channel_id" AND mention."mentioned_user_id" = state."user_id" AND message."id" > COALESCE(latest."id", 0)
) unread_mentions ON true
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;--> statement-breakpoint

INSERT INTO "conversation_read_states" ("conversation_id", "user_id", "last_delivered_message_id", "last_read_message_id", "last_delivered_at", "last_read_at")
SELECT direct."id", member."user_id", read_message."id", read_message."id", member."read_at", member."read_at"
FROM "direct_conversations" direct
CROSS JOIN LATERAL (VALUES
	(direct."user_a_id", direct."user_a_read_at", direct."user_a_read_message_id"),
	(direct."user_b_id", direct."user_b_read_at", direct."user_b_read_message_id")
) member("user_id", "read_at", "read_message_id")
LEFT JOIN "messages" read_message ON read_message."legacy_direct_message_id" = member."read_message_id"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;--> statement-breakpoint

UPDATE "conversations" conversation
SET "updated_at" = latest."created_at"
FROM (
	SELECT message."conversation_id", max(message."created_at") AS "created_at"
	FROM "messages" message
	GROUP BY message."conversation_id"
) latest
WHERE latest."conversation_id" = conversation."id";
