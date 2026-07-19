ALTER TABLE "servers" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_cover_object_key" text;--> statement-breakpoint
CREATE INDEX "servers_public_name_idx" ON "servers" USING btree ("visibility","name");