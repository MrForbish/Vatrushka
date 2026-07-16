ALTER TABLE "direct_conversations" ADD COLUMN "user_a_read_message_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD COLUMN "user_b_read_message_id" uuid;