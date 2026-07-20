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

describe('Hawk configuration', () => {
  it('is disabled by default', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toEqual(expect.objectContaining({
      HAWK_ENABLED: false,
      HAWK_STARTUP_SMOKE_TEST: false,
    }));
  });

  it('requires a token only when enabled', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', HAWK_ENABLED: 'true' })).toThrow(/HAWK_INTEGRATION_TOKEN/);
    expect(loadConfig({
      NODE_ENV: 'test',
      HAWK_ENABLED: 'true',
      HAWK_INTEGRATION_TOKEN: 'test-token',
      HAWK_RELEASE: '0.8.0-test',
    })).toEqual(expect.objectContaining({ HAWK_ENABLED: true }));
  });
});
