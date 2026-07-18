CREATE OR REPLACE FUNCTION enqueue_deleted_attachment_objects()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO object_deletion_jobs (id, object_key, reason, available_at, created_at)
  VALUES (gen_random_uuid(), OLD.object_key, 'attachment_row_deleted', now(), now())
  ON CONFLICT (object_key) DO NOTHING;

  IF OLD.preview_object_key IS NOT NULL THEN
    INSERT INTO object_deletion_jobs (id, object_key, reason, available_at, created_at)
    VALUES (gen_random_uuid(), OLD.preview_object_key, 'attachment_preview_row_deleted', now(), now())
    ON CONFLICT (object_key) DO NOTHING;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER conversation_message_attachments_cleanup
BEFORE DELETE ON conversation_message_attachments
FOR EACH ROW
EXECUTE FUNCTION enqueue_deleted_attachment_objects();
