import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { defineConfig } from 'vitest/config';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['aria-query', 'msw-storybook-addon', 'qrcode'] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/renderer/src/test-setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          restoreMocks: true,
        },
      },
      {
        extends: true,
        plugins: [storybookTest({ configDir: join(currentDirectory, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                // The Windows runner can inherit a VPN/system proxy. Browser
                // interaction tests only use the local Vitest server.
                args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
              },
            }),
            instances: [{ browser: 'chromium' }],
            api: { host: '127.0.0.1', port: 63315 },
            fileParallelism: false,
          },
        },
      },
    ],
  },
});
