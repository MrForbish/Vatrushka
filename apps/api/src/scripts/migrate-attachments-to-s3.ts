import { loadConfig } from '../config.js';
import { createPostgresStore } from '../db/postgres-store.js';
import { migrateLegacyAttachments } from '../services/attachment-objects.js';
import { createObjectStorage } from '../services/object-storage.js';

const config = loadConfig();
const database = createPostgresStore(config.DATABASE_URL);
const objectStorage = createObjectStorage(config);

if (objectStorage === null) {
  await database.close();
  throw new Error('MEDIA_STORAGE_DRIVER must be s3 to migrate attachments');
}

try {
  await objectStorage.healthCheck();
  const result = await migrateLegacyAttachments(database.store, objectStorage, config.S3_KEY_PREFIX);
  console.log(`Migrated ${result.channelAttachments} channel attachments and ${result.directAttachments} direct attachments to S3.`);
} finally {
  objectStorage.close();
  await database.close();
}
