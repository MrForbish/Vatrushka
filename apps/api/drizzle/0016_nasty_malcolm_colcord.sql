CREATE TABLE "message_mentions" (
	"message_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"start" integer NOT NULL,
	"length" integer NOT NULL,
	CONSTRAINT "message_mentions_message_id_start_pk" PRIMARY KEY("message_id","start")
);
--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_message_id_text_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."text_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_mentions_message_idx" ON "message_mentions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_mentions_user_idx" ON "message_mentions" USING btree ("mentioned_user_id","message_id");