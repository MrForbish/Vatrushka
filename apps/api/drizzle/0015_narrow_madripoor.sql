ALTER TABLE "users" ADD COLUMN "presence_preference" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_status_text" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_status_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "direct_message_privacy" text DEFAULT 'shared_servers' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "presence_visibility" text DEFAULT 'shared_servers' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activity_visible" boolean DEFAULT true NOT NULL;