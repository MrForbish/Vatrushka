import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('media storage configuration', () => {
  it('keeps database attachment storage as the development fallback', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).MEDIA_STORAGE_DRIVER).toBe('database');
  });

  it('requires complete HTTPS S3 credentials when the driver is enabled', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', MEDIA_STORAGE_DRIVER: 's3' })).toThrow();
    expect(() => loadConfig({
      NODE_ENV: 'test',
      MEDIA_STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://storage.test',
      S3_BUCKET: 'media-vatrushka',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret-key',
    })).toThrow();
    expect(loadConfig({
      NODE_ENV: 'test',
      MEDIA_STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://s3.twcstorage.ru',
      S3_BUCKET: 'media-vatrushka',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret-key',
    })).toEqual(expect.objectContaining({ MEDIA_STORAGE_DRIVER: 's3', S3_REGION: 'ru-1', S3_FORCE_PATH_STYLE: true, S3_KEY_PREFIX: 'prod' }));
  });
});
