/**
 * The real @google-cloud/monitoring client with no credentials at all. Its first call used
 * to rethrow the credentials error as an uncaught exception (and five unhandled rejections),
 * which process-guards turn into exit(1): opening Operations killed the API server wherever
 * ADC is missing (local runs, the CI menu walk). Nothing is mocked here; nothing goes out
 * on the network (no credentials, and the metadata-server probe is off).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

const ENV_KEYS = [
  'HOME',
  'CLOUDSDK_CONFIG',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'METADATA_SERVER_DETECTION',
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const empty = mkdtempSync(join(tmpdir(), 'no-adc-'));

beforeAll(() => {
  process.env.HOME = empty;
  process.env.CLOUDSDK_CONFIG = empty;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.METADATA_SERVER_DETECTION = 'none';
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(empty, { recursive: true, force: true });
});

it('reports missing credentials as a reason, with nothing uncaught', async () => {
  const escaped: unknown[] = [];
  const onEscape = (error: unknown): void => void escaped.push(error);
  process.on('uncaughtException', onEscape);
  process.on('unhandledRejection', onEscape);
  try {
    const { readCloudRunMetrics } = await import('../cloud-run-metrics.js');
    const metrics = await readCloudRunMetrics({ projectId: 'demo-no-adc', service: 'svc' });
    await new Promise((resolve) => setTimeout(resolve, 200)); // let any late throw surface
    const reason = 'unavailable: no Google Cloud credentials on this server';
    expect(metrics.missing).toEqual({
      latencyMs: reason,
      errorRate: reason,
      requestCount: reason,
      instances: reason,
    });
    expect(escaped).toEqual([]);
  } finally {
    process.off('uncaughtException', onEscape);
    process.off('unhandledRejection', onEscape);
  }
}, 10_000);
