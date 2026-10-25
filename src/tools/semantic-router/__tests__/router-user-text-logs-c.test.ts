/**
 * Two places outside the log lines used to keep the caller's words: a timed-out
 * worker embedding put 50 characters of the text in its thrown message (callers
 * log what they catch), and voice routing stored a 100-character snippet with each
 * emotional data point, a history that is written to Firestore. The error now has
 * a fixed message and carries the length; the data point carries no snippet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const SENTINEL = 'my sister Dolores has stage-three lupus';

const recorded = vi.hoisted(() => [] as unknown[][]);

vi.mock('../../../config/feature-flags.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/feature-flags.js')>()),
  isFeatureEnabled: (flag: string) => flag === 'experimental.embeddingWorkerIntegration',
}));

vi.mock('../../../services/async-events/index.js', () => ({
  AsyncEvents: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock('../advanced/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../advanced/index.js')>()),
  recordEmotionalDataPoint: (...args: unknown[]) => void recorded.push(args),
}));

import { EmbeddingTimeoutError, queueEmbeddingForWorker } from '../embedding-worker-integration.js';
import { routeVoiceInput } from '../voice-integration.js';

/** A Google embeddings endpoint that answers every text with the same small vector. */
async function fakeEmbeddings(_url: string, init?: { body?: string }) {
  const body = JSON.parse(init?.body ?? '{}') as { requests?: unknown[] };
  const values = [1, 0, 0, 0];
  return {
    ok: true,
    status: 200,
    json: async () =>
      body.requests
        ? { embeddings: body.requests.map(() => ({ values })) }
        : { embedding: { values } },
    text: async () => '',
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  recorded.length = 0;
});

describe('caller text outside the logs', () => {
  it('a worker embedding timeout throws a fixed message and the length', async () => {
    vi.useFakeTimers();
    const pending = queueEmbeddingForWorker(SENTINEL).then(
      () => undefined,
      (e: unknown) => e
    );
    await vi.advanceTimersByTimeAsync(10_100); // batch flush (50 ms) + per-text timeout (10 s)
    const thrown = (await pending) as EmbeddingTimeoutError;

    expect(thrown).toBeInstanceOf(EmbeddingTimeoutError);
    expect(thrown.message).toBe('Embedding timeout');
    expect(thrown.textLength).toBe(SENTINEL.length);
    expect(JSON.stringify({ ...thrown, message: thrown.message })).not.toContain(SENTINEL);
  });

  it('voice routing records the emotional data point without a snippet of the words', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'k');
    vi.stubGlobal('fetch', fakeEmbeddings); // router start-up embeds the tool set
    await routeVoiceInput(SENTINEL, {
      userId: 'u1',
      sessionId: 's1',
      personaId: 'ferni',
      conversationHistory: [],
      recentTools: [],
      locale: 'en',
      detectedEmotion: { emotion: 'anxious', intensity: 0.7, valence: -0.4, source: 'text' },
    });

    expect(recorded).toEqual([['u1', 'anxious', 0.7, -0.4, 'text']]);
    expect(JSON.stringify(recorded)).not.toContain(SENTINEL);
  });
});
