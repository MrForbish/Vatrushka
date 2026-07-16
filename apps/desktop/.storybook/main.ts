import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: [
    '../src/renderer/src/ui/**/*.stories.@(ts|tsx)',
    '../src/renderer/src/features/**/*.stories.@(ts|tsx)',
  ],
  staticDirs: ['../public'],
  addons: [
    getAbsolutePath('@storybook/addon-vitest'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
  ],
  framework: getAbsolutePath('@storybook/react-vite'),
  viteFinal: (config) => mergeConfig(config, { esbuild: { jsx: 'automatic' }, optimizeDeps: { include: ['livekit-client'] } }),
};

export default config;
