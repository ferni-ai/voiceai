/**
 * The embedding worker embeds whatever query it is handed (PipelineOptimizer passes
 * the user's). When the provider fails, its logs carry the error's class and status,
 * never a message that can quote the query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

function echoError(): Error {
  const error = new Error(`400 could not embed "${SENTINEL}"`);
  error.name = 'ProviderEchoError';
  return Object.assign(error, { status: 502 });
}

vi.mock('../../../embedding-providers.js', () => ({
  getEmbedding: async () => {
    throw echoError();
  },
  getEmbeddings: async () => {
    throw echoError();
  },
}));

import { EmbeddingWorker } from '../embedding-worker.js';

const FIELDS = { error: 'ProviderEchoError', status: 502 };

describe('EmbeddingWorker error logs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    logged.length = 0;
  });

  it('a failed batch logs the class and status, not the message', async () => {
    const worker = new EmbeddingWorker();
    void worker.getEmbedding(SENTINEL, 'normal'); // queued; never resolves on failure
    await vi.advanceTimersByTimeAsync(200);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([FIELDS, 'Failed to process embedding batch']);
  });

  it('a failed pre-warm logs the class and status, not the message', async () => {
    new EmbeddingWorker().prewarm([SENTINEL]);
    await vi.advanceTimersByTimeAsync(200);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([FIELDS, 'Pre-warm failed']);
  });

  it('a failed queue run logs the class and status, from the call and from the timer', async () => {
    const worker = new EmbeddingWorker();
    vi.spyOn(
      worker as unknown as { processQueue: () => Promise<void> },
      'processQueue'
    ).mockRejectedValue(echoError());
    void worker.getEmbedding(SENTINEL, 'normal'); // the call's own trigger
    await vi.advanceTimersByTimeAsync(200); // the 50 ms timer sees the queue still full
    const failures = logged.filter(([, msg]) => msg === 'Embedding queue processing failed');
    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    for (const [fields] of failures) expect(fields).toEqual(FIELDS);
  });
});
