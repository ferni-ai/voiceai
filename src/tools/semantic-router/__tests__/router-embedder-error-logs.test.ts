/**
 * The tool router embeds the user's live utterance. A refused request must name
 * what failed, never what was embedded: the provider's response body can echo the
 * utterance, and callers log the error. The thrown message keeps the provider and
 * the numeric status; the log line carries the class and status only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = {
    debug: capture,
    info: capture,
    warn: capture,
    error: capture,
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
  return {
    ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

// Google embeddings go to Vertex through the shared client; its SDK error can quote the input too.
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  isGeminiConfigured: () => true,
  getGeminiClient: async () => ({
    models: {
      embedContent: async () => {
        throw Object.assign(new Error(`quota exceeded for input: ${SENTINEL}`), { status: 429 });
      },
    },
  }),
}));

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

const calls: Array<[string, string, (t: string) => Promise<unknown>]> = [
  [
    'OpenAI embed',
    'OpenAI',
    (t) => new OpenAIEmbeddingProvider({ apiKey: 'k', useCache: false }).embed(t),
  ],
  [
    'OpenAI embedBatch',
    'OpenAI',
    (t) => new OpenAIEmbeddingProvider({ apiKey: 'k', useCache: false }).embedBatch([t]),
  ],
  ['Google embed', 'Vertex AI', (t) => new GoogleEmbeddingProvider({ useCache: false }).embed(t)],
  [
    'Google embedBatch',
    'Vertex AI',
    (t) => new GoogleEmbeddingProvider({ useCache: false }).embedBatch([t]),
  ],
];

describe('semantic router embedding errors', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_EMBEDDINGS_VERTEX', 'on'); // the Google cases reach the mocked client
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    logged.length = 0;
  });

  it.each(calls)('%s throws the status, not the response body', async (_name, provider, call) => {
    vi.stubGlobal('fetch', echoingFetch());
    const thrown = (await call(SENTINEL).then(
      () => undefined,
      (e: unknown) => e
    )) as Error & { status?: number };
    expect(thrown.name).toBe('EmbeddingApiError');
    expect(thrown.message).toBe(`${provider} API error: 429`);
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
