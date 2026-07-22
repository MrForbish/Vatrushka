import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { uploadHawkSourceMap } from './hawk-source-map-plugin.mjs';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/release`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('uploads a map with release metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hawk-map-'));
  const filePath = join(directory, 'app.js.map');
  await writeFile(filePath, '{"version":3}', 'utf8');
  const token = Buffer.from(JSON.stringify({ integrationId: 'test' })).toString('base64');

  try {
    await withServer((request, response) => {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: false }));
    }, (endpoint) => uploadHawkSourceMap({ filePath, token, release: '0.8.16', endpoint }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('shows Hawk rejection instead of hiding it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hawk-map-'));
  const filePath = join(directory, 'app.js.map');
  await writeFile(filePath, '{"version":3}', 'utf8');
  const token = Buffer.from(JSON.stringify({ integrationId: 'test' })).toString('base64');

  try {
    await withServer((_request, response) => {
      response.statusCode = 401;
      response.end('invalid release token');
    }, async (endpoint) => {
      await assert.rejects(
        uploadHawkSourceMap({ filePath, token, release: '0.8.16', endpoint }),
        /HTTP 401: invalid release token/u,
      );
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
