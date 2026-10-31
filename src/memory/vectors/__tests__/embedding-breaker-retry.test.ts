/**
 * Two numbers that shape how embedding outages play out, pinned so a change is a
 * decision: the circuit breakers' thresholds, and how many times OpenAI's 429 is
 * retried before the caller sees the error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const made = vi.hoisted(() => [] as Array<{ kind: string; name: string; options: unknown }>);

vi.mock('../../../utils/circuit-breaker.js', () => {
  const breaker = { canRequest: () => true, execute: <T>(fn: () => Promise<T>) => fn() };
  return {
    getCircuitBreaker: (name: string, options: unknown) => {
      made.push({ kind: 'local', name, options });
      return breaker;
    },
    getRedisCircuitBreakerAsync: async (name: string, options: unknown) => {
      made.push({ kind: 'redis', name, options });
      return breaker;
    },
  };
});

import { OpenAIEmbeddings } from '../embeddings.js';

describe('embedding circuit breakers', () => {
  it('open after 5 failures, retry after 30 s, close after 2 successes', async () => {
    await vi.waitFor(() => expect(made.filter((m) => m.kind === 'redis')).toHaveLength(2));
    const config = { failureThreshold: 5, resetTimeout: 30000, successThreshold: 2 };
    expect(made.map((m) => [m.kind, m.name])).toEqual([
      ['local', 'openai-embeddings'],
      ['local', 'google-embeddings'],
      ['redis', 'openai-embeddings'],
      ['redis', 'google-embeddings'],
    ]);
    for (const m of made) expect(m.options).toEqual(config);
  });
});

describe('OpenAIEmbeddings 429 retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A server that answers each request with the next status; 200 carries one vector. */
  function serve(statuses: number[]) {
    const fetch = vi.fn(async () => {
      const status = statuses.shift() ?? 200;
      if (status !== 200) return { ok: false, status, text: async () => 'rate limited' };
      return {
        ok: true,
        status,
        json: async () => ({ data: [{ embedding: [1], index: 0 }], usage: { total_tokens: 1 } }),
      };
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('retries three times, then succeeds on the fourth request', async () => {
    vi.useFakeTimers();
    const fetch = serve([429, 429, 429]);
    const pending = new OpenAIEmbeddings({ apiKey: 'k' }).embedBatch(['hi']);
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 3000);
    await expect(pending).resolves.toEqual([[1]]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('gives up after the third retry with the 429 status', async () => {
    vi.useFakeTimers();
    const fetch = serve([429, 429, 429, 429, 429]);
    const settled = expect(
      new OpenAIEmbeddings({ apiKey: 'k' }).embedBatch(['hi'])
    ).rejects.toMatchObject({
      name: 'EmbeddingApiError',
      status: 429,
    });
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 3000);
    await settled;
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry other statuses', async () => {
    const fetch = serve([500]);
    await expect(new OpenAIEmbeddings({ apiKey: 'k' }).embedBatch(['hi'])).rejects.toMatchObject({
      status: 500,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
