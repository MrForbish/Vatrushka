import { randomUUID } from 'node:crypto';

import { loadConfig } from '../config.js';
import { createObjectStorage } from '../services/object-storage.js';

const config = loadConfig();
const objectStorage = createObjectStorage(config);
if (objectStorage === null) throw new Error('MEDIA_STORAGE_DRIVER must be s3 to verify object storage');

const key = `${config.S3_KEY_PREFIX}/health/${randomUUID()}`;
const content = Buffer.from('vatrushka-object-storage-check');
let uploaded = false;

try {
  await objectStorage.healthCheck();
  await objectStorage.putObject({ key, content, mimeType: 'text/plain' });
  uploaded = true;
  const downloaded = await objectStorage.getObject(key);
  if (!downloaded.equals(content)) throw new Error('Object storage returned different content');
} finally {
  try { if (uploaded) await objectStorage.deleteObject(key); } finally { objectStorage.close(); }
}

console.log(`S3-compatible storage ${config.S3_BUCKET} passed read, write and delete verification.`);
