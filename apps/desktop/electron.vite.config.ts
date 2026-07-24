import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';
import hawkSourceMapPlugin from './scripts/hawk-source-map-plugin.mjs';

const hawkRendererToken = process.env.HAWK_DESKTOP_RENDERER_TOKEN;
const hawkMainToken = process.env.HAWK_DESKTOP_MAIN_TOKEN;
const hawkRelease = process.env.HAWK_DESKTOP_RELEASE ?? 'unknown';
const devApiProxyTarget = process.env.VATRUSHKA_DEV_API_PROXY_TARGET ?? 'https://api.myvatrushka.ru';

function stripBrowserOrigin(proxy: { on(event: string, listener: (...args: unknown[]) => void): void }): void {
  proxy.on('proxyReq', (request: unknown) => {
    (request as { removeHeader(name: string): void }).removeHeader('origin');
  });
  proxy.on('proxyReqWs', (request: unknown) => {
    (request as { removeHeader(name: string): void }).removeHeader('origin');
  });
}

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
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': {
          target: devApiProxyTarget,
          changeOrigin: true,
          configure: stripBrowserOrigin,
          secure: true,
        },
        '/ws': {
          target: devApiProxyTarget,
          changeOrigin: true,
          configure: stripBrowserOrigin,
          secure: true,
          ws: true,
        },
      },
    },
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
