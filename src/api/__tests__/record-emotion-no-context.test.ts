/**
 * POST /api/intelligence/record-emotion takes an optional `context` from the
 * client, which is the caller's words. The emotion, its scores and source are
 * stored in emotional_history; the context is not, whole or nested.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../tools/semantic-router/persistence/firestore-persistence.js', () => ({
  initializeFirestorePersistence: async () => undefined,
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: false, data: () => undefined }),
        set: async (value: Record<string, unknown>) =>
          void store.set(`${name}/${id}`, structuredClone(value)),
      }),
    }),
  }),
}));

const { handleIntelligenceRoutes } = await import('../routes/intelligence-routes.js');

const SENTINEL = 'my sister Dolores has stage-three lupus';

async function recordEmotion(uid: string, body: Record<string, unknown>) {
  const path = '/api/intelligence/record-emotion';
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: path,
    headers: { 'content-type': 'application/json', 'x-firebase-uid': uid },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  const res = {
    setHeader: () => undefined,
    getHeader: () => undefined,
    writeHead: (code: number) => void (status = code),
    end: () => undefined,
  };
  await handleIntelligenceRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    path,
    new URL(`http://localhost${path}`)
  );
  return status;
}

/** The route persists without waiting; wait for the write. */
async function storedDoc(uid: string) {
  await vi.waitFor(() => expect(store.has(`emotional_history/${uid}`)).toBe(true));
  return store.get(`emotional_history/${uid}`) as { dataPoints: Array<Record<string, unknown>> };
}

beforeEach(() => store.clear());

describe('POST /api/intelligence/record-emotion', () => {
  it('stores the emotion and scores, not the client context', async () => {
    const status = await recordEmotion('u-ctx', {
      emotion: 'anxious',
      intensity: 0.7,
      valence: -0.4,
      source: 'text',
      context: SENTINEL,
    });
    expect(status).toBe(200);

    const doc = await storedDoc('u-ctx');
    expect(JSON.stringify(doc)).not.toContain('Dolores');
    expect(doc.dataPoints).toHaveLength(1);
    expect(doc.dataPoints[0]).toEqual({
      timestamp: expect.any(String),
      emotion: 'anxious',
      intensity: 0.7,
      valence: -0.4,
      source: 'text',
    });
  });

  it('stores nothing of a nested context or extra fields', async () => {
    await recordEmotion('u-nested', {
      emotion: 'sad',
      intensity: 0.5,
      valence: -0.6,
      context: { snippet: SENTINEL.slice(3, 22), words: [SENTINEL] },
      text: SENTINEL,
    });
    const doc = await storedDoc('u-nested');
    expect(JSON.stringify(doc)).not.toContain('Dolores');
    expect(Object.keys(doc.dataPoints[0]).sort()).toEqual([
      'emotion',
      'intensity',
      'source',
      'timestamp',
      'valence',
    ]);
    expect(doc.dataPoints[0].source).toBe('inferred');
  });
});
