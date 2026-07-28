-- Enable the approved camera capability for existing ordinary members.
-- Channel and member-level deny overwrites still take precedence at runtime.
UPDATE "server_roles"
SET "permissions" = "permissions" || '["STREAM_VIDEO"]'::jsonb
WHERE "kind" = 'EVERYONE'
  AND NOT ("permissions" @> '["STREAM_VIDEO"]'::jsonb);
