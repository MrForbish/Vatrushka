ALTER TABLE "servers" ADD COLUMN "system_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "welcome_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_system_channel_id_fk" FOREIGN KEY ("system_channel_id") REFERENCES "server_channels"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_welcome_channel_id_fk" FOREIGN KEY ("welcome_channel_id") REFERENCES "server_channels"("id") ON DELETE set null;
