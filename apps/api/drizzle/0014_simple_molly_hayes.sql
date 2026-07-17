ALTER TABLE "direct_message_attachments" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "storage_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "direct_message_attachments_storage_key_unique" ON "direct_message_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_attachments_storage_key_unique" ON "message_attachments" USING btree ("storage_key");