/**
 * POST /api/intelligence/record-emotion against the Firestore emulator, through
 * the real route, the real persist and the real @google-cloud/firestore client
 * (transactions included):
 * - free text, or a slice of it, in every field is never stored;
 * - a stored point with a bad time doesn't stop a new point saving;
 * - two records (one after a restart, two at once from two instances) keep both.
 * Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   firebase emulators:exec --only firestore --project demo-emotion \
 *     "pnpm vitest run -c vitest.config.unit.ts src/api/__tests__/record-emotion.emulator.test.ts"
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { Firestore } from '@google-cloud/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { leakedPieces, PARTIALS, SENTINEL } from '../../tests/helpers/snippet-leak.js';

const handle = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../tools/semantic-router/persistence/firestore-persistence.js', () => ({
  initializeFirestorePersistence: async () => undefined,
  getFirestore: () => handle.db,
}));

const ON = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const db = new Firestore({ projectId: `demo-emotion-${Date.now()}`, databaseId: '(default)' });
handle.db = db;

type Route = typeof import('../routes/intelligence-routes.js').handleIntelligenceRoutes;

async function post(route: Route, uid: string, body: unknown) {
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
  await route(req as unknown as IncomingMessage, res as unknown as ServerResponse, path, new URL(`http://localhost${path}`));
  return { status, sent };
}

const ref = (uid: string) => db.collection('emotional_history').doc(uid);
const stored = async (uid: string) =>
  ((await ref(uid).get()).data()?.dataPoints ?? []) as Array<Record<string, unknown>>;
/** The route saves without waiting: wait until the document holds `n` points. */
const settled = async (uid: string, n: number) =>
  vi.waitFor(async () => expect(await stored(uid)).toHaveLength(n), { timeout: 5000 });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const VALID = { emotion: 'anxious', intensity: 0.7, valence: -0.4, source: 'text' };

describe.skipIf(!ON)('record-emotion on the emulator', () => {
  let route: Route;
  beforeAll(async () => {
    route = (await import('../routes/intelligence-routes.js')).handleIntelligenceRoutes;
  });

  it('stores no free text from any field: refused values, extra fields, slices', async () => {
    const uid = 'emu-free-text';
    const attempts: Array<Record<string, unknown>> = [
      { emotion: SENTINEL },
      { emotion: PARTIALS[1] },
      { emotion: { label: 'sad', why: PARTIALS[0] } },
      { source: PARTIALS[2] },
      { intensity: { why: SENTINEL } },
      { intensity: PARTIALS[0] },
      { valence: PARTIALS[1] },
    ];
    for (const override of attempts) {
      const { status, sent } = await post(route, uid, { ...VALID, ...override });
      expect(status).toBe(400);
      expect(leakedPieces(sent)).toEqual([]);
    }
    // Accepted, with every other field the client sends dropped
    const ok = await post(route, uid, {
      ...VALID,
      context: SENTINEL,
      notes: [PARTIALS[0]],
      meta: { snippet: PARTIALS[1] },
      transcript: PARTIALS[2],
      timestamp: '2021-01-01T00:00:00.000Z',
    });
    expect(ok.status).toBe(200);
    await settled(uid, 1);

    const doc = (await ref(uid).get()).data()!;
    expect(leakedPieces(doc)).toEqual([]);
    expect(Object.keys(doc).sort()).toEqual(['dataPoints', 'lastUpdated', 'userId']);
    expect(Object.keys(doc.dataPoints[0]).sort()).toEqual(['emotion', 'intensity', 'source', 'timestamp', 'valence']);
    expect(doc.dataPoints[0]).toMatchObject(VALID);
    expect(doc.dataPoints[0].timestamp).not.toBe('2021-01-01T00:00:00.000Z');
  });

  it('a stored point with a bad time is dropped and the new point still saves', async () => {
    const uid = 'emu-bad-time';
    await ref(uid).set({
      userId: uid,
      dataPoints: [
        { emotion: 'sad', intensity: 0.5, valence: -0.6, source: 'text', timestamp: 'last tuesday' },
        { emotion: 'sad', intensity: 0.5, valence: -0.6, source: 'text' },
        { context: PARTIALS[0] },
        { emotion: 'calm', intensity: 0.3, valence: 0.5, source: 'voice', timestamp: hoursAgo(5) },
      ],
    });
    expect((await post(route, uid, VALID)).status).toBe(200);
    await settled(uid, 2);
    const points = await stored(uid);
    expect(points.map((p) => p.emotion)).toEqual(['calm', 'anxious']);
    expect(leakedPieces(points)).toEqual([]);
  });

  it('a record after a restart keeps the point an earlier process saved', async () => {
    const uid = 'emu-restart';
    await ref(uid).set({
      userId: uid,
      dataPoints: [{ emotion: 'hopeful', intensity: 0.6, valence: 0.4, source: 'text', timestamp: hoursAgo(3) }],
    });
    expect((await post(route, uid, VALID)).status).toBe(200);
    await settled(uid, 2);
    expect((await stored(uid)).map((p) => p.emotion)).toEqual(['hopeful', 'anxious']);

    expect((await post(route, uid, { ...VALID, emotion: 'calm', valence: 0.5 })).status).toBe(200);
    await settled(uid, 3);
    expect((await stored(uid)).map((p) => p.emotion)).toEqual(['hopeful', 'anxious', 'calm']);
  });

  it('two instances recording at once keep both points (real transactions)', async () => {
    // The route loads better-than-human lazily, so two route modules would share
    // one history; load two copies of it directly, one in-memory history each.
    const uid = 'emu-race';
    const BTH = '../../tools/semantic-router/advanced/better-than-human.js';
    vi.resetModules();
    const a = await import(BTH);
    vi.resetModules();
    const b = await import(BTH);
    expect(a).not.toBe(b);

    a.recordEmotionalDataPoint(uid, 'lonely', 0.6, -0.5, 'voice');
    b.recordEmotionalDataPoint(uid, 'grateful', 0.6, 0.7, 'text');
    await Promise.all([a.persistEmotionalHistory(uid), b.persistEmotionalHistory(uid)]);
    expect((await stored(uid)).map((p) => p.emotion).sort()).toEqual(['grateful', 'lonely']);
  });
});
