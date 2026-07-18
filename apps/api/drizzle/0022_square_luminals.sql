CREATE TABLE "object_deletion_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"reason" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "object_deletion_jobs_object_key_unique" ON "object_deletion_jobs" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "object_deletion_jobs_available_idx" ON "object_deletion_jobs" USING btree ("available_at","id");