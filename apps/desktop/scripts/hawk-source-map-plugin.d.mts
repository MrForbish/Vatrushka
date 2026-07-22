/* eslint-disable */
import type { Plugin } from 'vite';

declare function hawkSourceMapPlugin(options: {
  token: string;
  release: string;
  removeSourceMaps?: boolean;
}): Plugin | undefined;

export default hawkSourceMapPlugin;
