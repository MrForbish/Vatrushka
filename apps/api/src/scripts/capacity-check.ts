import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RoomServiceClient } from 'livekit-server-sdk';
import pg from 'pg';
import { createClient } from 'redis';

const CONFIRMATION = 'I_UNDERSTAND_VATRUSHKA_CAPACITY_TEST';
const componentNames = ['api', 'websocket', 'postgresql', 'redis', 's3', 'livekit-control'] as const;
type ComponentName = (typeof componentNames)[number];

interface CapacityProfile {
  iterations: number;
  concurrency: number;
  p95Milliseconds: Record<ComponentName, number>;
}

interface ComponentResult {
  component: ComponentName;
  attempted: number;
  succeeded: number;
  failed: number;
  p50Milliseconds: number;
  p95Milliseconds: number;
  maxMilliseconds: number;
  thresholdMilliseconds: number;
  passed: boolean;
  errors: string[];
}

const profiles: Record<'smoke' | 'baseline', CapacityProfile> = {
  smoke: {
    iterations: 5,
    concurrency: 2,
    p95Milliseconds: { api: 750, websocket: 1_500, postgresql: 150, redis: 100, s3: 2_500, 'livekit-control': 1_500 },
  },
  baseline: {
    iterations: 100,
    concurrency: 10,
    p95Milliseconds: { api: 500, websocket: 1_000, postgresql: 100, redis: 75, s3: 1_500, 'livekit-control': 1_000 },
  },
};

export function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] ?? 0;
}

function hostFromConnectionString(value: string): string | null {
  try { return new URL(value).hostname; } catch { return null; }
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isProductionHost(host: string): boolean {
  return host === '213.171.7.154' || host === 'myvatrushka.ru' || host.endsWith('.myvatrushka.ru');
}

export function assertCapacitySafety(env: NodeJS.ProcessEnv): void {
  if (env.CAPACITY_CONFIRM !== CONFIRMATION) throw new Error(`Set CAPACITY_CONFIRM=${CONFIRMATION} to acknowledge the test`);
  const targets = [env.CAPACITY_API_URL, env.CAPACITY_WS_URL, env.CAPACITY_DATABASE_URL, env.CAPACITY_REDIS_URL, env.CAPACITY_S3_ENDPOINT, env.CAPACITY_LIVEKIT_HTTP_URL]
    .flatMap((value) => value ? [hostFromConnectionString(value)] : [])
    .flatMap((host) => host ? [host] : []);
  if (targets.some((host) => !isLocalHost(host)) && env.CAPACITY_ALLOW_REMOTE !== 'true') {
    throw new Error('Remote targets require CAPACITY_ALLOW_REMOTE=true');
  }
  if (targets.some(isProductionHost) && env.CAPACITY_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Production targets require CAPACITY_ALLOW_PRODUCTION=true');
  }
}

async function benchmark(component: ComponentName, profile: CapacityProfile, operation: (iteration: number) => Promise<void>): Promise<ComponentResult> {
  const durations: number[] = [];
  const errors: string[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(profile.concurrency, profile.iterations) }, async () => {
    while (cursor < profile.iterations) {
      const iteration = cursor++;
      const started = performance.now();
      try {
        await operation(iteration);
        durations.push(performance.now() - started);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }));
  const p95Milliseconds = percentile(durations, 0.95);
  return {
    component,
    attempted: profile.iterations,
    succeeded: durations.length,
    failed: errors.length,
    p50Milliseconds: Number(percentile(durations, 0.5).toFixed(1)),
    p95Milliseconds: Number(p95Milliseconds.toFixed(1)),
    maxMilliseconds: Number(Math.max(0, ...durations).toFixed(1)),
    thresholdMilliseconds: profile.p95Milliseconds[component],
    passed: errors.length === 0 && durations.length === profile.iterations && p95Milliseconds <= profile.p95Milliseconds[component],
    errors: [...new Set(errors)].slice(0, 5),
  };
}

function waitForWebSocketRoundTrip(url: string, token: string, iteration: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error('WebSocket round trip timed out'));
    }, 5_000);
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error); else resolvePromise();
    };
    socket.addEventListener('error', () => finish(new Error('WebSocket connection failed')));
    socket.addEventListener('message', (event) => {
      let message: { type?: string; code?: string };
      try {
        if (typeof event.data !== 'string') throw new Error('Non-text frame');
        message = JSON.parse(event.data) as { type?: string; code?: string };
      }
      catch { return finish(new Error('WebSocket returned invalid JSON')); }
      if (message.type === 'hello') socket.send(JSON.stringify({ type: 'auth', token, deviceId: `capacity-${iteration}-${randomUUID()}` }));
      else if (message.type === 'authenticated') socket.send(JSON.stringify({ type: 'ping' }));
      else if (message.type === 'pong') finish();
      else if (message.type === 'error') finish(new Error(`WebSocket rejected command: ${message.code ?? 'UNKNOWN'}`));
    });
  });
}

function missingComponents(env: NodeJS.ProcessEnv): ComponentName[] {
  const present: Record<ComponentName, boolean> = {
    api: Boolean(env.CAPACITY_API_URL),
    websocket: Boolean(env.CAPACITY_WS_URL && env.CAPACITY_ACCESS_TOKEN),
    postgresql: Boolean(env.CAPACITY_DATABASE_URL),
    redis: Boolean(env.CAPACITY_REDIS_URL),
    s3: Boolean(env.CAPACITY_S3_ENDPOINT && env.CAPACITY_S3_REGION && env.CAPACITY_S3_BUCKET && env.CAPACITY_S3_ACCESS_KEY_ID && env.CAPACITY_S3_SECRET_ACCESS_KEY),
    'livekit-control': Boolean(env.CAPACITY_LIVEKIT_HTTP_URL && env.CAPACITY_LIVEKIT_API_KEY && env.CAPACITY_LIVEKIT_API_SECRET),
  };
  return componentNames.filter((name) => !present[name]);
}

async function run(): Promise<void> {
  assertCapacitySafety(process.env);
  const profileName = process.env.CAPACITY_PROFILE === 'baseline' ? 'baseline' : 'smoke';
  const selected = profiles[profileName];
  const requestedIterations = Number(process.env.CAPACITY_ITERATIONS ?? selected.iterations);
  const requestedConcurrency = Number(process.env.CAPACITY_CONCURRENCY ?? selected.concurrency);
  if (!Number.isInteger(requestedIterations) || requestedIterations < 1 || requestedIterations > 100_000) throw new Error('CAPACITY_ITERATIONS must be an integer between 1 and 100000');
  if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1 || requestedConcurrency > 1_000) throw new Error('CAPACITY_CONCURRENCY must be an integer between 1 and 1000');
  const profile: CapacityProfile = { ...selected, iterations: requestedIterations, concurrency: requestedConcurrency };
  const missing = missingComponents(process.env);
  if (missing.length > 0 && process.env.CAPACITY_REQUIRE_ALL !== 'false') throw new Error(`Missing configuration for: ${missing.join(', ')}`);
  const results: ComponentResult[] = [];

  if (process.env.CAPACITY_API_URL) {
    const url = new URL(process.env.CAPACITY_HTTP_PATH ?? '/health/live', process.env.CAPACITY_API_URL);
    results.push(await benchmark('api', profile, async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.arrayBuffer();
    }));
  }
  const websocketUrl = process.env.CAPACITY_WS_URL;
  const accessToken = process.env.CAPACITY_ACCESS_TOKEN;
  if (websocketUrl && accessToken) {
    results.push(await benchmark('websocket', profile, (iteration) => waitForWebSocketRoundTrip(websocketUrl, accessToken, iteration)));
  }
  if (process.env.CAPACITY_DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.CAPACITY_DATABASE_URL, max: profile.concurrency });
    try { results.push(await benchmark('postgresql', profile, async () => { await pool.query('select 1'); })); }
    finally { await pool.end(); }
  }
  if (process.env.CAPACITY_REDIS_URL) {
    const redis = createClient({ url: process.env.CAPACITY_REDIS_URL });
    await redis.connect();
    try {
      results.push(await benchmark('redis', profile, async (iteration) => {
        const key = `vatrushka:capacity:${process.pid}:${iteration}:${randomUUID()}`;
        await redis.set(key, 'ok', { expiration: { type: 'EX', value: 60 } });
        if (await redis.get(key) !== 'ok') throw new Error('Redis read-after-write mismatch');
        await redis.del(key);
      }));
    } finally { await redis.quit(); }
  }
  const s3Endpoint = process.env.CAPACITY_S3_ENDPOINT;
  const s3Region = process.env.CAPACITY_S3_REGION;
  const s3Bucket = process.env.CAPACITY_S3_BUCKET;
  const s3AccessKeyId = process.env.CAPACITY_S3_ACCESS_KEY_ID;
  const s3SecretAccessKey = process.env.CAPACITY_S3_SECRET_ACCESS_KEY;
  if (s3Endpoint && s3Region && s3Bucket && s3AccessKeyId && s3SecretAccessKey) {
    const client = new S3Client({
      endpoint: s3Endpoint,
      region: s3Region,
      forcePathStyle: process.env.CAPACITY_S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey },
    });
    try {
      results.push(await benchmark('s3', profile, async (iteration) => {
        const key = `capacity/${Date.now()}-${process.pid}-${iteration}-${randomUUID()}.bin`;
        try {
          await client.send(new PutObjectCommand({ Bucket: s3Bucket, Key: key, Body: Buffer.alloc(1_024, iteration % 255), ContentType: 'application/octet-stream' }));
          const response = await client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));
          if (!response.Body || (await response.Body.transformToByteArray()).length !== 1_024) throw new Error('S3 read-after-write mismatch');
        } finally { await client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key })); }
      }));
    } finally { client.destroy(); }
  }
  const livekitUrl = process.env.CAPACITY_LIVEKIT_HTTP_URL;
  const livekitApiKey = process.env.CAPACITY_LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.CAPACITY_LIVEKIT_API_SECRET;
  if (livekitUrl && livekitApiKey && livekitApiSecret) {
    const rooms = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
    results.push(await benchmark('livekit-control', profile, async () => { await rooms.listRooms(); }));
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    profile: profileName,
    iterations: profile.iterations,
    concurrency: profile.concurrency,
    skipped: missing,
    passed: results.length > 0 && results.every((result) => result.passed) && (process.env.CAPACITY_REQUIRE_ALL === 'false' || missing.length === 0),
    results,
    note: 'LiveKit result covers its control plane. Media-plane voice/screen capacity requires the separate two-machine WebRTC procedure.',
  };
  const reportPath = resolve(process.env.CAPACITY_REPORT_PATH ?? `artifacts/capacity/capacity-${Date.now()}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.table(results.map(({ component, attempted, failed, p50Milliseconds, p95Milliseconds, thresholdMilliseconds, passed }) => ({ component, attempted, failed, p50Milliseconds, p95Milliseconds, thresholdMilliseconds, passed })));
  console.log(`Capacity report: ${reportPath}`);
  if (!report.passed) process.exitCode = 1;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
