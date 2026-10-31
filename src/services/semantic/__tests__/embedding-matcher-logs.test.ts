/**
 * The matcher embeds the user's words, on Vertex through the shared client. A
 * refused or failed request rejects with EmbeddingApiError carrying the status
 * only: neither the SDK's message nor anything logged may quote the user, and
 * an outage is no longer reported as "no match".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const embedContent = vi.hoisted(() => vi.fn());
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

vi.mock('../../../config/gemini-config.js', () => ({
  getGeminiClient: async () => ({ models: { embedContent } }),
}));

import { clearEmbeddingCache, matchCategories } from '../embedding-matcher.js';

async function rejection(input: string): Promise<Error & { status?: number }> {
  return (await matchCategories(input, []).then(
    () => {
      throw new Error('matchCategories resolved during an outage');
    },
    (e: unknown) => e
  )) as Error & { status?: number };
}

describe('embedding-matcher error logs', () => {
  afterEach(() => {
    embedContent.mockReset();
    clearEmbeddingCache();
    logged.length = 0;
  });

  it('a refused request rejects with the status, not the message that echoed the input', async () => {
    embedContent.mockRejectedValue(Object.assign(new Error(`quota: ${SENTINEL}`), { status: 429 }));
    const thrown = await rejection(`${SENTINEL} refused`);
    expect(thrown.name).toBe('EmbeddingApiError');
    expect(thrown.status).toBe(429);
    expect(thrown.message).not.toContain(SENTINEL);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
  });

  it('a failed request with no status rejects with status 0, not its message', async () => {
    const error = new Error(`could not embed ${SENTINEL}`);
    error.name = 'FetchEchoError';
    embedContent.mockRejectedValue(error);
    const thrown = await rejection(`${SENTINEL} failed`);
    expect(thrown.name).toBe('EmbeddingApiError');
    expect(thrown.status).toBe(0);
    expect(thrown.message).not.toContain(SENTINEL);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
  });
});
