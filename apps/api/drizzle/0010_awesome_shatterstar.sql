CREATE TABLE "channel_permission_overwrites" (
	"channel_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"allow" jsonb NOT NULL,
	"deny" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "channel_permission_overwrites_channel_id_target_type_target_id_pk" PRIMARY KEY("channel_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "server_audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_roles" ADD COLUMN "kind" text DEFAULT 'CUSTOM' NOT NULL;--> statement-breakpoint
UPDATE "server_roles" SET "kind" = 'EVERYONE' WHERE "is_default" = true;--> statement-breakpoint
UPDATE "server_roles" SET "kind" = 'OWNER' WHERE "is_default" = false AND "position" = 100;--> statement-breakpoint
UPDATE "server_roles" AS role SET "permissions" = (
	SELECT COALESCE(jsonb_agg(permission ORDER BY permission), '[]'::jsonb)
	FROM (
		SELECT DISTINCT CASE value
			WHEN 'STREAM' THEN 'STREAM_SCREEN'
			WHEN 'CREATE_INVITES' THEN 'MANAGE_INVITES'
			ELSE value
		END AS permission
		FROM jsonb_array_elements_text(role."permissions") AS value
		UNION
		SELECT extra FROM unnest(ARRAY['READ_MESSAGE_HISTORY', 'SEND_ATTACHMENTS', 'ADD_REACTIONS', 'EMBED_LINKS', 'MANAGE_OWN_MESSAGES']) AS extra
		WHERE role."is_default" = true
) normalized
);--> statement-breakpoint
UPDATE "server_roles" SET "permissions" = '["ADMINISTRATOR","VIEW_SERVER","MANAGE_SERVER","MANAGE_CHANNELS","MANAGE_ROLES","MANAGE_INVITES","MANAGE_INTEGRATIONS","VIEW_AUDIT_LOG","MANAGE_SERVER_SECURITY","KICK_MEMBERS","BAN_MEMBERS","TIMEOUT_MEMBERS","MANAGE_NICKNAMES","VIEW_MODERATION_NOTES","MANAGE_REPORTS","VIEW_CHANNEL","READ_MESSAGE_HISTORY","SEND_MESSAGES","SEND_ATTACHMENTS","ADD_REACTIONS","EMBED_LINKS","MENTION_EVERYONE","MANAGE_OWN_MESSAGES","MANAGE_MESSAGES","PIN_MESSAGES","CREATE_THREADS","CONNECT_VOICE","SPEAK","STREAM_SCREEN","STREAM_APPLICATION_AUDIO","USE_PRIORITY_VOICE","MUTE_MEMBERS","DEAFEN_MEMBERS","MOVE_MEMBERS","STOP_OTHERS_STREAM","CREATE_TEMPORARY_VOICE","MANAGE_2FA_POLICY","MANAGE_SESSIONS","VIEW_TECHNICAL_LOGS","EXPORT_SERVER_DATA"]'::jsonb WHERE "kind" = 'OWNER';--> statement-breakpoint
ALTER TABLE "channel_permission_overwrites" ADD CONSTRAINT "channel_permission_overwrites_channel_id_server_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."server_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_audit_logs" ADD CONSTRAINT "server_audit_logs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_audit_logs" ADD CONSTRAINT "server_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_overwrites_target_idx" ON "channel_permission_overwrites" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "server_audit_logs_server_created_idx" ON "server_audit_logs" USING btree ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "server_audit_logs_actor_idx" ON "server_audit_logs" USING btree ("actor_user_id");
