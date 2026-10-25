/**
 * A failed tool-retrieval embedding logs the error's class and status, never its
 * message: the GenAI SDK's error can carry the request, which holds the user's words.
 */
import { describe, expect, it, vi } from 'vitest';
import { DenseToolIndex } from '../dense-index.js';
import { TurnToolRetrieval } from '../turn-tool-retrieval.js';
import { fakeEmbedder } from './fake-embedder.js';

const logged = vi.hoisted(() => [] as Array<{ fields: Record<string, unknown>; msg: string }>);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => {
    const rec = (fields: Record<string, unknown>, msg: string) => logged.push({ fields, msg });
    return { info: rec, warn: rec, error: rec, debug: rec };
  },
}));

describe('TurnToolRetrieval.pick embedding failure', () => {
  it('logs the error class and status, not the message that quotes the user', async () => {
    const index = await DenseToolIndex.build(
      {
        tools: {
          setTimer: { domain: 'simple-utilities', description: 'timer', queries: ['timer'] },
        },
      },
      fakeEmbedder()
    );
    const failing = {
      model: 'fake',
      embed: async () => {
        const error = new Error(`400 INVALID_ARGUMENT: contents "${SENTINEL}"`);
        error.name = 'ApiError';
        throw Object.assign(error, { status: 400 });
      },
    };
    const r = new TurnToolRetrieval({
      sessionId: 's',
      embedder: failing,
      index: async () => index,
      domainOf: () => 'simple-utilities',
      k: 1,
    });

    expect(await r.pick(SENTINEL)).toBeNull();

    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual({
      fields: { sessionId: 's', error: 'ApiError', status: 400 },
      msg: 'tool retrieval failed',
    });
  });
});
