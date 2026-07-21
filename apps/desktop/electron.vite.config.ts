import react from '@vitejs/plugin-react';
import hawkVitePlugin from '@hawk.so/vite-plugin';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

const hawkRendererToken = process.env.HAWK_DESKTOP_RENDERER_TOKEN;
const hawkMainToken = process.env.HAWK_DESKTOP_MAIN_TOKEN;
const hawkRelease = process.env.HAWK_DESKTOP_RELEASE ?? 'unknown';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'process.env.HAWK_DESKTOP_MAIN_ENABLED': JSON.stringify(process.env.HAWK_DESKTOP_MAIN_ENABLED ?? 'false'),
      'process.env.HAWK_DESKTOP_MAIN_TOKEN': JSON.stringify(hawkMainToken ?? ''),
      'process.env.HAWK_DESKTOP_RELEASE': JSON.stringify(hawkRelease),
    },
    build: { sourcemap: true },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [
      react(),
      ...(hawkRendererToken
        ? [hawkVitePlugin({ token: hawkRendererToken, release: hawkRelease, removeSourceMaps: true })]
        : []),
    ],
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/@tanstack/')) return 'tanstack-query';
            return undefined;
          },
        },
      },
    },
  },
});
