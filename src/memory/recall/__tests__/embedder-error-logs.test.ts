/**
 * When the embedder or the nearest-vector search fails on a fact, a logged error
 * names its class and nothing else: the error's message, body or cause can echo
 * the fact text back (an unquoted echo survives any cut at the first quote).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);

vi.mock('../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

import { withFactEmbeddings } from '../../dynamic/fact-embeddings.js';
import { createSemanticIndex, type RetrievalEmbedder } from '../semantic-recall.js';

const SENTINEL = 'my sister Dolores has stage-three lupus';

class VertexEchoError extends Error {
  readonly body = `{"error":"invalid input ${SENTINEL}"}`;
  constructor() {
    super(`400 could not embed ${SENTINEL}, retry`);
    this.name = 'VertexEchoError';
  }
}

const failing: RetrievalEmbedder = async () => {
  throw new VertexEchoError();
};
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Every logged call, as one string, with the error class it must carry. */
function expectOnlyTheClass() {
  expect(JSON.stringify(logged)).not.toContain(SENTINEL);
  expect(logged.some(([fields]) => (fields as { error?: string })?.error === 'VertexEchoError')).toBe(
    true
  );
}

describe('embedder error logs', () => {
  afterEach(() => {
    logged.length = 0;
  });

  it('withFactEmbeddings logs the class of a failed embedding, not its message', async () => {
    const out = await withFactEmbeddings([{ key: 'health', value: SENTINEL }], {
      enabled: true,
      embed: failing,
      model: async () => 'text-embedding-005',
    });
    expect(out).toEqual([{ key: 'health', value: SENTINEL }]); // still written, without a vector
    expectOnlyTheClass();
  });

  it('the recall index logs the class when it cannot be built', async () => {
    const index = createSemanticIndex([{ id: 'a', text: SENTINEL }], failing);
    await index.ready;
    expectOnlyTheClass();
  });

  it('the recall index logs the class when a turn cannot be embedded', async () => {
    const index = createSemanticIndex([], failing);
    index.observe(`tell me about ${SENTINEL} again please`);
    await settle();
    expectOnlyTheClass();
  });

  it('the recall index logs the class when the nearest search fails', async () => {
    const embed: RetrievalEmbedder = async (texts) => texts.map(() => [1, 0, 0]);
    const index = createSemanticIndex([{ id: 'a', text: 'a dog' }], embed, async () => {
      throw new VertexEchoError();
    });
    await index.ready;
    index.observe(`tell me about ${SENTINEL} again please`);
    await settle();
    expectOnlyTheClass();
  });
});
