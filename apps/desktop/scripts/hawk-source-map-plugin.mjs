import { readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Blob, Buffer } from 'node:buffer';

/* global AbortSignal, FormData, fetch */

function collectorEndpoint(token) {
  try {
    const { integrationId } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (typeof integrationId !== 'string' || integrationId.length === 0) throw new Error('missing integration id');
    return `https://${integrationId}.k1.hawk.so/release`;
  } catch {
    throw new Error('HAWK integration token has an invalid format');
  }
}

async function responseDetail(response) {
  const body = (await response.text()).trim();
  return body.length > 0 ? body.slice(0, 512) : 'empty response body';
}

export async function uploadHawkSourceMap({ filePath, token, release, endpoint = collectorEndpoint(token) }) {
  const data = await readFile(filePath, 'utf8');
  const form = new FormData();
  form.set('release', release);
  form.set('file', new Blob([data], { type: 'application/json' }), basename(filePath));

  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const detail = await responseDetail(response);

  if (!response.ok) {
    throw new Error(`Hawk source-map upload failed with HTTP ${response.status}: ${detail}`);
  }

  try {
    const parsed = JSON.parse(detail);
    if (parsed?.error) throw new Error(`Hawk source-map upload rejected: ${parsed.message ?? 'unknown error'}`);
  } catch (error) {
    if (error instanceof SyntaxError) return;
    throw error;
  }
}

export default function hawkSourceMapPlugin({ token, release, removeSourceMaps = true }) {
  if (!token) return undefined;
  if (!release || release === 'unknown') throw new Error('HAWK release is required for production source-map upload');

  return {
    name: 'vatrushka-hawk-source-maps',
    async writeBundle(outputOptions, bundle) {
      const outputDirectory = outputOptions.dir ?? 'dist';
      const sourceMaps = Object.values(bundle)
        .filter((item) => item.type === 'asset' && item.fileName.endsWith('.map'))
        .map((item) => join(outputDirectory, item.fileName));

      for (const filePath of sourceMaps) {
        await uploadHawkSourceMap({ filePath, token, release });
        if (removeSourceMaps) await rm(filePath);
      }
    },
  };
}
