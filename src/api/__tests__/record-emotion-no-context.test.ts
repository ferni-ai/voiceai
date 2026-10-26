/**
 * POST /api/intelligence/record-emotion keeps an allowlist: an emotion label
 * from a fixed list, intensity 0..1, valence -1..1, a source from three, and
 * the server's time. Free text in any field is refused (400) and never stored,
 * whole or as a slice; any other field (context, notes, a client timestamp) is
 * dropped. The emulator twin is record-emotion.emulator.test.ts.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../tests/helpers/fake-firestore.js';
import { leakedPieces, PARTIALS, SENTINEL } from '../../tests/helpers/snippet-leak.js';

const state = vi.hoisted(() => ({ fs: (() => null) as () => unknown }));

vi.mock('../../tools/semantic-router/persistence/firestore-persistence.js', () => ({
  initializeFirestorePersistence: async () => undefined,
  getFirestore: () => state.fs(),
}));

const fsState = newFakeFirestoreState();
state.fs = createFakeFirestore(fsState);

const { handleIntelligenceRoutes } = await import('../routes/intelligence-routes.js');

async function recordEmotion(uid: string, body: unknown) {
  const path = '/api/intelligence/record-emotion';
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: path,
    headers: { 'content-type': 'application/json', 'x-firebase-uid': uid },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  let sent = '';
  const res = {
    setHeader: () => undefined,
    getHeader: () => undefined,
    writeHead: (code: number) => void (status = code),
    end: (chunk?: string) => void (sent += chunk ?? ''),
  };
  await handleIntelligenceRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    path,
    new URL(`http://localhost${path}`)
  );
  return { status, sent };
}

/** The route persists without waiting; wait for the write. */
async function storedDoc(uid: string) {
  await vi.waitFor(() => expect(fsState.docs.has(`emotional_history/${uid}`)).toBe(true));
  return fsState.docs.get(`emotional_history/${uid}`) as {
    dataPoints: Array<Record<string, unknown>>;
  };
}

const VALID = { emotion: 'anxious', intensity: 0.7, valence: -0.4, source: 'text' };
const KEPT = ['emotion', 'intensity', 'source', 'timestamp', 'valence'];

beforeEach(() => resetFakeFirestore(fsState));

describe('POST /api/intelligence/record-emotion', () => {
  it('the leak check sees a 30-character slice, not only the whole sentence', () => {
    for (const slice of PARTIALS) {
      expect(JSON.stringify({ note: slice })).not.toContain(SENTINEL);
      expect(leakedPieces({ note: slice }).length).toBeGreaterThan(0);
    }
    expect(leakedPieces({ emotion: 'anxious', source: 'text', intensity: 0.7 })).toEqual([]);
  });

  it('stores the label, scores, source and server time, and no context', async () => {
    const before = Date.now();
    const { status } = await recordEmotion('u-ctx', { ...VALID, context: SENTINEL });
    expect(status).toBe(200);

    const doc = await storedDoc('u-ctx');
    expect(leakedPieces(doc)).toEqual([]);
    expect(doc.dataPoints).toHaveLength(1);
    expect(doc.dataPoints[0]).toMatchObject(VALID);
    expect(Date.parse(doc.dataPoints[0].timestamp as string)).toBeGreaterThanOrEqual(before - 1);
  });

  it('drops every field off the list: nested context, notes, a client timestamp', async () => {
    await recordEmotion('u-extra', {
      emotion: 'Sad',
      intensity: 0.5,
      valence: -0.6,
      context: { snippet: PARTIALS[1], words: [SENTINEL] },
      text: PARTIALS[0],
      notes: [PARTIALS[2]],
      timestamp: '2020-02-02T00:00:00.000Z',
      0: PARTIALS[1],
    });
    const doc = await storedDoc('u-extra');
    expect(leakedPieces(doc)).toEqual([]);
    expect(Object.keys(doc.dataPoints[0]).sort()).toEqual(KEPT);
    expect(doc.dataPoints[0]).toMatchObject({ emotion: 'sad', source: 'inferred' });
    expect(doc.dataPoints[0].timestamp).not.toBe('2020-02-02T00:00:00.000Z');
  });

  // Free text, a slice of it, or an object in each kept field
  const bad: Array<[string, Record<string, unknown>]> = [
    ['emotion: a sentence', { emotion: SENTINEL }],
    ['emotion: a 30-char slice', { emotion: PARTIALS[1] }],
    ['emotion: a label inside text', { emotion: `anxious, ${PARTIALS[0]}` }],
    ['emotion: an object', { emotion: { label: 'sad', why: PARTIALS[2] } }],
    ['source: a sentence', { source: PARTIALS[0] }],
    ['intensity: an object', { intensity: { why: SENTINEL } }],
    ['intensity: a string', { intensity: PARTIALS[1] }],
    ['intensity: out of range', { intensity: 7 }],
    ['valence: a string', { valence: SENTINEL }],
    ['valence: out of range', { valence: -3 }],
  ];
  it.each(bad)('refuses %s and stores nothing of it', async (_name, override) => {
    const uid = `u-bad-${Math.random().toString(36).slice(2)}`;
    const { status, sent } = await recordEmotion(uid, { ...VALID, ...override });
    expect(status).toBe(400);
    expect(leakedPieces(sent)).toEqual([]); // the error does not echo the input
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(fsState.docs.has(`emotional_history/${uid}`)).toBe(false);
    expect(leakedPieces([...fsState.docs.values()])).toEqual([]);
  });

  it('refuses a body that is not an object', async () => {
    expect((await recordEmotion('u-arr', [VALID])).status).toBe(400);
    expect((await recordEmotion('u-str', SENTINEL)).status).toBe(400);
    expect(fsState.docs.size).toBe(0);
  });
});
