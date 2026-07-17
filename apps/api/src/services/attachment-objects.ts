import type { DataStore, ObjectStorage } from '../ports.js';

export interface AttachmentMigrationResult {
  channelAttachments: number;
  directAttachments: number;
}

export function attachmentObjectKey(prefix: string, scope: 'channels' | 'direct', messageId: string, attachmentId: string): string {
  return `${prefix}/attachments/${scope}/${messageId}/${attachmentId}`;
}

export async function migrateLegacyAttachments(store: DataStore, objectStorage: ObjectStorage, prefix: string, batchSize = 100): Promise<AttachmentMigrationResult> {
  const result: AttachmentMigrationResult = { channelAttachments: 0, directAttachments: 0 };

  for (;;) {
    const attachments = await store.listLegacyMessageAttachments(batchSize);
    if (attachments.length === 0) break;
    let moved = 0;
    for (const attachment of attachments) {
      const storageKey = attachmentObjectKey(prefix, 'channels', attachment.messageId, attachment.id);
      await objectStorage.putObject({ key: storageKey, content: attachment.content, mimeType: attachment.mimeType });
      if (await store.moveMessageAttachmentToStorage(attachment.id, storageKey)) moved += 1;
    }
    if (moved === 0) throw new Error('Channel attachment migration made no progress');
    result.channelAttachments += moved;
  }

  for (;;) {
    const attachments = await store.listLegacyDirectMessageAttachments(batchSize);
    if (attachments.length === 0) break;
    let moved = 0;
    for (const attachment of attachments) {
      const storageKey = attachmentObjectKey(prefix, 'direct', attachment.messageId, attachment.id);
      await objectStorage.putObject({ key: storageKey, content: attachment.content, mimeType: attachment.mimeType });
      if (await store.moveDirectMessageAttachmentToStorage(attachment.id, storageKey)) moved += 1;
    }
    if (moved === 0) throw new Error('Direct attachment migration made no progress');
    result.directAttachments += moved;
  }

  return result;
}
