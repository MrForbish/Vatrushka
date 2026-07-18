CREATE TABLE "server_member_aliases" (
	"server_id" uuid NOT NULL,
	"viewer_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "server_member_aliases_server_id_viewer_user_id_target_user_id_pk" PRIMARY KEY("server_id","viewer_user_id","target_user_id")
);
--> statement-breakpoint
ALTER TABLE "server_member_aliases" ADD CONSTRAINT "server_member_aliases_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_member_aliases" ADD CONSTRAINT "server_member_aliases_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_member_aliases" ADD CONSTRAINT "server_member_aliases_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_member_aliases_target_idx" ON "server_member_aliases" USING btree ("server_id","target_user_id");