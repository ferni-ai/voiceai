/**
 * The tool router embeds the user's live utterance. A refused request must name
 * what failed, never what was embedded: the provider's response body can echo the
 * utterance, and callers log the error. The thrown message keeps the provider and
 * the numeric status; the log line carries the class and status only.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return {
    ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

import { GoogleEmbeddingProvider, OpenAIEmbeddingProvider } from '../embedding-providers.js';
import { semanticSplit } from '../multi-intent/semantic-splitter.js';
import { warmStartSession } from '../voice-integration.js';

/** A provider that refuses with a body that quotes the request's input back. */
function echoingFetch() {
  return vi.fn(async () => ({
    ok: false,
    status: 429,
    text: async () => `{"error":"quota exceeded for input: ${SENTINEL}"}`,
  }));
}

const calls: Array<[string, (t: string) => Promise<unknown>]> = [
  ['OpenAI embed', (t) => new OpenAIEmbeddingProvider({ apiKey: 'k', useCache: false }).embed(t)],
  [
    'OpenAI embedBatch',
    (t) => new OpenAIEmbeddingProvider({ apiKey: 'k', useCache: false }).embedBatch([t]),
  ],
  ['Google embed', (t) => new GoogleEmbeddingProvider({ apiKey: 'k', useCache: false }).embed(t)],
  [
    'Google embedBatch',
    (t) => new GoogleEmbeddingProvider({ apiKey: 'k', useCache: false }).embedBatch([t]),
  ],
];

describe('semantic router embedding errors', () => {
  beforeAll(() => {
    vi.stubEnv('GOOGLE_API_KEY', 'k'); // the default provider getEmbedding() picks
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logged.length = 0;
  });

  it.each(calls)('%s throws the status, not the response body', async (name, call) => {
    vi.stubGlobal('fetch', echoingFetch());
    const thrown = (await call(SENTINEL).then(
      () => undefined,
      (e: unknown) => e
    )) as Error & { status?: number };
    expect(thrown.name).toBe('EmbeddingApiError');
    expect(thrown.message).toBe(`${name.split(' ')[0]} API error: 429`);
    expect(thrown.message).not.toContain(SENTINEL);
    expect(thrown.status).toBe(429);
  });

  it('semanticSplit logs the class and status, not the error or the clause', async () => {
    vi.stubGlobal('fetch', echoingFetch());
    await semanticSplit(`remind me about ${SENTINEL}`);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      { error: 'EmbeddingApiError', status: 429, clauseLength: SENTINEL.length + 16 },
      'Failed to score clause',
    ]);
  });

  it('semanticSplit summarises a multi-clause input by length, not text', async () => {
    vi.stubGlobal('fetch', echoingFetch());
    const input = `play some jazz and tell me about ${SENTINEL}`;
    await semanticSplit(input);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      expect.objectContaining({ inputLength: input.length, clauseCount: 2 }),
      'Semantic split complete',
    ]);
  });

  it('warmStartSession logs the class and status, not the response body', async () => {
    vi.stubGlobal('fetch', echoingFetch()); // router start-up embeds the tools first
    await warmStartSession({ sessionId: 's1' } as never);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      { error: 'EmbeddingApiError', status: 429, sessionId: 's1' },
      'Warm-start failed (non-fatal, will use cold start)',
    ]);
  });
});
