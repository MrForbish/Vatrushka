-- vatrushka: destructive-contract
-- Standalone rooms were retired before this contract migration. Server channels and channel_screen_share_leases are intentionally preserved.
DROP TABLE "guest_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "rooms" CASCADE;--> statement-breakpoint
DROP TABLE "screen_share_leases" CASCADE;
