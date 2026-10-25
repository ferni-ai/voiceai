/**
 * The matcher embeds the user's words. A refused request logs the status, and a
 * failed one the error's class and status: neither the response body nor the
 * error's message, either of which can quote the user.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

import { matchCategories } from '../embedding-matcher.js';

describe('embedding-matcher error logs', () => {
  beforeAll(() => {
    vi.stubEnv('GOOGLE_API_KEY', 'k');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logged.length = 0;
  });

  it('a refused request logs the status, not the body that echoed the input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, text: async () => `quota: ${SENTINEL}` }))
    );
    await matchCategories(`${SENTINEL} refused`, []);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([{ status: 429 }, 'Embedding API error']);
  });

  it('a failed request logs the error class and status, not its message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error(`could not embed ${SENTINEL}`);
        error.name = 'FetchEchoError';
        throw Object.assign(error, { status: 502 });
      })
    );
    await matchCategories(`${SENTINEL} failed`, []);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      { error: 'FetchEchoError', status: 502 },
      'Failed to get embedding',
    ]);
  });
});
