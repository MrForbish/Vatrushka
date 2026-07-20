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
import { technicalMetrics } from './metrics.js';

type ObjectStorageOperation = 'health' | 'put' | 'get' | 'delete' | 'presign_put' | 'presign_get' | 'head';

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
    await this.measure('health', () => this.client.send(new HeadBucketCommand({ Bucket: this.bucket })));
  }

  async putObject({ content, key, mimeType }: ObjectStoragePutInput): Promise<void> {
    await this.measure('put', () => this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentLength: content.length,
      ContentType: mimeType,
      CacheControl: 'private, max-age=3600',
    })));
  }

  async getObject(key: string): Promise<Buffer> {
    return this.measure('get', async () => {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (response.Body === undefined) throw new Error('S3 object body is empty');
      return Buffer.from(await response.Body.transformToByteArray());
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.measure('delete', () => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })));
  }

  async createPutUrl(key: string, mimeType: string, size: number, expiresInSeconds: number): Promise<string> {
    return this.measure('presign_put', () => getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: size, CacheControl: 'private, max-age=3600' }), { expiresIn: expiresInSeconds }));
  }

  async createGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return this.measure('presign_get', () => getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds }));
  }

  async headObject(key: string): Promise<{ size: number; mimeType: string | null }> {
    return this.measure('head', async () => {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: result.ContentLength ?? 0, mimeType: result.ContentType ?? null };
    });
  }

  close(): void {
    this.client.destroy();
  }

  private async measure<T>(operation: ObjectStorageOperation, action: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    let result = 'success';
    try {
      return await action();
    } catch (error) {
      result = 'error';
      throw error;
    } finally {
      const labels = { operation, result };
      technicalMetrics.increment('object_storage_requests_total', 1, labels);
      technicalMetrics.observeHistogram(
        'object_storage_request_duration_seconds',
        Math.max(0, performance.now() - startedAt) / 1_000,
        [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        labels,
      );
    }
  }
}

export function createObjectStorage(config: AppConfig): ObjectStorage | null {
  return config.MEDIA_STORAGE_DRIVER === 's3' ? new S3ObjectStorage(config) : null;
}
