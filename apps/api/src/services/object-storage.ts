import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { AppConfig } from '../config.js';
import type { ObjectStorage, ObjectStoragePutInput } from '../ports.js';

export class S3ObjectStorage implements ObjectStorage {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: AppConfig) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async putObject({ content, key, mimeType }: ObjectStoragePutInput): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentLength: content.length,
      ContentType: mimeType,
      CacheControl: 'private, max-age=3600',
    }));
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (response.Body === undefined) throw new Error('S3 object body is empty');
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async createPutUrl(key: string, mimeType: string, size: number, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: size, CacheControl: 'private, max-age=3600' }), { expiresIn: expiresInSeconds });
  }

  async createGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async headObject(key: string): Promise<{ size: number; mimeType: string | null }> {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return { size: result.ContentLength ?? 0, mimeType: result.ContentType ?? null };
  }

  close(): void {
    this.client.destroy();
  }
}

export function createObjectStorage(config: AppConfig): ObjectStorage | null {
  return config.MEDIA_STORAGE_DRIVER === 's3' ? new S3ObjectStorage(config) : null;
}
