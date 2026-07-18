CREATE TABLE "blocked_users" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_users_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "pending_email_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"new_email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_bans" (
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	CONSTRAINT "server_bans_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "server_channel_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"destination_channel_id" uuid,
	"token_hash" text NOT NULL,
	"token_preview" text NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_audit_logs" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "server_channels" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "server_channels" ADD COLUMN "slow_mode_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server_channels" ADD COLUMN "max_participants" integer;--> statement-breakpoint
ALTER TABLE "server_channels" ADD COLUMN "bitrate" integer;--> statement-breakpoint
ALTER TABLE "server_channels" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "server_channels" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server_members" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "server_members" ADD COLUMN "muted_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server_members" ADD COLUMN "deafened" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server_members" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "language" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "timezone" text DEFAULT 'Europe/Moscow' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "icon_object_key" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "banner_object_key" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "default_notification_level" text DEFAULT 'mentions' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "default_voice_inactivity_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "verification_level" text DEFAULT 'email_verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "new_member_restriction_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "message_rate_limit_per_minute" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "mention_limit_per_message" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_object_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivation_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_email_changes" ADD CONSTRAINT "pending_email_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_channel_categories" ADD CONSTRAINT "server_channel_categories_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invites" ADD CONSTRAINT "server_invites_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invites" ADD CONSTRAINT "server_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_invites" ADD CONSTRAINT "server_invites_destination_channel_id_server_channels_id_fk" FOREIGN KEY ("destination_channel_id") REFERENCES "public"."server_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_idx" ON "blocked_users" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_email_changes_new_email_unique" ON "pending_email_changes" USING btree ("new_email");--> statement-breakpoint
CREATE INDEX "pending_email_changes_user_idx" ON "pending_email_changes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "server_bans_user_idx" ON "server_bans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "server_bans_server_active_idx" ON "server_bans" USING btree ("server_id","revoked_at");--> statement-breakpoint
CREATE INDEX "server_channel_categories_server_position_idx" ON "server_channel_categories" USING btree ("server_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "server_invites_token_hash_unique" ON "server_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "server_invites_server_active_idx" ON "server_invites" USING btree ("server_id","revoked_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_not_self_check" CHECK ("blocker_user_id" <> "blocked_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_check" CHECK ("username" IS NULL OR ("username" = lower("username") AND "username" ~ '^[a-z0-9_]{3,32}$'));--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_default_notification_level_check" CHECK ("default_notification_level" IN ('all', 'mentions', 'none'));--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_limits_check" CHECK (
	"default_voice_inactivity_seconds" BETWEEN 0 AND 86400
	AND "new_member_restriction_minutes" BETWEEN 0 AND 10080
	AND "message_rate_limit_per_minute" BETWEEN 1 AND 600
	AND "mention_limit_per_message" BETWEEN 0 AND 100
);--> statement-breakpoint
ALTER TABLE "server_channels" ADD CONSTRAINT "server_channels_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "server_channel_categories"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "server_channels" ADD CONSTRAINT "server_channels_limits_check" CHECK (
	"slow_mode_seconds" BETWEEN 0 AND 21600
	AND ("max_participants" IS NULL OR "max_participants" BETWEEN 1 AND 1000)
	AND ("bitrate" IS NULL OR "bitrate" BETWEEN 16000 AND 510000)
);--> statement-breakpoint
ALTER TABLE "server_invites" ADD CONSTRAINT "server_invites_usage_check" CHECK (
	"use_count" >= 0 AND ("max_uses" IS NULL OR ("max_uses" > 0 AND "use_count" <= "max_uses"))
);--> statement-breakpoint
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_reason_check" CHECK (length(trim("reason")) > 0);
