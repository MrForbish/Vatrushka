import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './storybook-e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:6006',
    colorScheme: 'dark',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run storybook -- --ci',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
