/**
 * What the real speaker-embedding worker tells an integration log: that the
 * model it loaded matched the pinned sha256 (and which one), and how long an
 * embedding takes. Only the logger is replaced, to read the lines.
 */

import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { ...logged, child: () => logger };
  return { createLogger: () => logger, getLogger: () => logger, default: () => logger };
});

import {
  EMBED_LATENCY_INFO_EVERY,
  embedOffMainThread,
  getSpeakerEmbeddingMethod,
  resetSpeakerEmbeddingWorker,
} from '../speaker-embedding-worker.js';
import { sha256Of, useSpeakerModel } from './speaker-model-fixture.js';

const WAVEFORM = join(__dirname, 'fixtures', 'waveform-contract.onnx');

const lines = (fn: typeof logged.info, msg: string): Array<Record<string, unknown>> =>
  fn.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);

afterEach(async () => {
  await resetSpeakerEmbeddingWorker();
  useSpeakerModel(undefined);
  vi.clearAllMocks();
});

it('says at load, once, at info, that the model matched its pinned sha256, with the prefix', async () => {
  useSpeakerModel(WAVEFORM);

  expect(await getSpeakerEmbeddingMethod()).toBe('neural');

  const loaded = lines(
    logged.info,
    'Speaker embeddings: neural model in a worker thread, sha256 verified'
  );
  expect(loaded).toHaveLength(1);
  // the digest the worker computed from the file, not just the configured pin
  expect(loaded[0].sha256Prefix).toBe(sha256Of(WAVEFORM).slice(0, 12));
  expect(loaded[0].sha256Verified).toBe(true);
});

it('reports embedMs on every embedding: debug each time, info for the first and 1 in N', async () => {
  useSpeakerModel(WAVEFORM);
  const audio = new Float32Array(32000).map((_, i) => 0.2 * Math.sin(i / 7));

  const n = 20;
  const results = [];
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-await-in-loop -- the worker serves one request at a time
    results.push(await embedOffMainThread(audio));
  }

  for (const r of results) {
    expect(typeof r.embedMs).toBe('number');
    expect(r.embedMs).toBeGreaterThanOrEqual(r.inferMs);
    expect(Number.isInteger(r.inferMs)).toBe(true); // measured in the worker, whole ms
  }
  expect(lines(logged.debug, 'Speaker embedding')).toHaveLength(n);
  const sampled = lines(logged.info, 'Speaker embedding latency');
  expect(EMBED_LATENCY_INFO_EVERY).toBe(n);
  expect(sampled.map((l) => l.n)).toEqual([1, n]);
  expect(sampled[0]).toMatchObject({ audioMs: 2000, sampledEvery: EMBED_LATENCY_INFO_EVERY });
  expect(typeof sampled[0].embedMs).toBe('number');
});
