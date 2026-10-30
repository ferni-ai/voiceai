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

// Google embeddings go to Vertex through the shared client: every text gets the same small vector.
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  isGeminiConfigured: () => true,
  getGeminiClient: async () => ({
    models: {
      embedContent: async ({ contents }: { contents: string[] }) => ({
        embeddings: contents.map(() => ({ values: [1, 0, 0, 0] })),
      }),
    },
  }),
}));

import { EmbeddingTimeoutError, queueEmbeddingForWorker } from '../embedding-worker-integration.js';
import { routeVoiceInput } from '../voice-integration.js';

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
    // router start-up embeds the tool set through the mocked client
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
