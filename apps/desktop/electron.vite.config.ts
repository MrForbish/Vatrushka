import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';
import hawkSourceMapPlugin from './scripts/hawk-source-map-plugin.mjs';

const hawkRendererToken = process.env.HAWK_DESKTOP_RENDERER_TOKEN;
const hawkMainToken = process.env.HAWK_DESKTOP_MAIN_TOKEN;
const hawkRelease = process.env.HAWK_DESKTOP_RELEASE ?? 'unknown';

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      ...(hawkMainToken ? [hawkSourceMapPlugin({ token: hawkMainToken, release: hawkRelease })] : []),
    ],
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
        ? [hawkSourceMapPlugin({ token: hawkRendererToken, release: hawkRelease })]
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
