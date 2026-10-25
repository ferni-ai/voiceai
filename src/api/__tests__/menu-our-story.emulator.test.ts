/**
 * "Our Story So Far" milestones, call → panel: the session stats the voice agent
 * records at the end of each call (cleanup-handler.ts → incrementSessionStats, stored in
 * bogle_users/{uid}/relationship_arc) come back as milestones through
 * GET /api/your-story/full, the route the panel calls. "One Week Together" means seven
 * days since the first conversation; it used to be "3 sessions", which could all be one
 * afternoon.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writer
// and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);
// Signed in as the user the test names (auth itself is covered elsewhere)
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
  requireAuth: vi.fn(async (req: IncomingMessage, _res: ServerResponse) => ({
    userId: req.headers['x-test-uid'] as string,
    isAdmin: false,
  })),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-our-story';

const DAY = 24 * 60 * 60 * 1000;
let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleYourStoryRoutes } = await import('../your-story-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleYourStoryRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());
afterEach(() => vi.restoreAllMocks());

/** What the agent records when a call ends, `daysAgo` days ago. */
async function callEndedDaysAgo(uid: string, daysAgo: number): Promise<void> {
  const { incrementSessionStats } =
    await import('../../intelligence/context-builders/relationship/arc/storage.js');
  const now = Date.now();
  const spy = vi.spyOn(Date, 'now').mockReturnValue(now - daysAgo * DAY);
  await incrementSessionStats(uid, 12);
  spy.mockRestore();
}

async function milestones(uid: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${base}/api/your-story/full`, { headers: { 'x-test-uid': uid } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data: { relationship: { milestones: Array<Record<string, unknown>> } };
  };
  return body.data.relationship.milestones;
}

const reached = (list: Array<Record<string, unknown>>) =>
  list.filter((m) => m.completed).map((m) => m.id);

describe.skipIf(!emulator)('Our Story milestones, call to panel (Firestore emulator)', () => {
  it('three calls in one afternoon are a first hello, not one week together', async () => {
    const uid = newUser();
    for (let i = 0; i < 3; i++) await callEndedDaysAgo(uid, 0);

    expect(reached(await milestones(uid))).toEqual(['first_hello']);
  });

  it('one week together is reached seven days after the first call, and dated then', async () => {
    const uid = newUser();
    await callEndedDaysAgo(uid, 8);
    await callEndedDaysAgo(uid, 0);

    const list = await milestones(uid);
    expect(reached(list)).toEqual(['first_hello', 'one_week']);
    const first = Date.parse(String(list[0]?.completedAt));
    const week = Date.parse(String(list[1]?.completedAt));
    expect(week - first).toBe(7 * DAY);
    expect(Date.now() - first).toBeGreaterThanOrEqual(8 * DAY - 60_000);
  });

  // A saved arc whose userId field held a device id: saves went to bogle_users/{that id},
  // so no call ever moved the doc the panel reads.
  it('a call updates the arc the panel reads even when the doc names an older user id', async () => {
    const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
    const { clearAllArcCache, createDefaultRelationshipArcData } =
      await import('../../intelligence/context-builders/relationship/arc/index.js');
    const db = getAdminFirestore();
    const uid = newUser();
    const oldId = `device:${uid}-old`;
    const arc = { ...createDefaultRelationshipArcData(oldId), totalSessions: 5 };
    await db
      .doc(`bogle_users/${uid}/relationship_arc/data`)
      .set({ ...arc, firstSessionDate: Date.now() - 30 * DAY, _migratedFrom: oldId });
    clearAllArcCache(); // a fresh worker: the call loads the doc from Firestore

    await callEndedDaysAgo(uid, 0);
    clearAllArcCache(); // the panel is served by another process (the UI server)

    const res = await fetch(`${base}/api/your-story/full`, { headers: { 'x-test-uid': uid } });
    const body = (await res.json()) as { data: { header: { totalConversations: number } } };
    expect(body.data.header.totalConversations).toBe(6);
    expect((await db.doc(`bogle_users/${oldId}/relationship_arc/data`).get()).exists).toBe(false);
  });
});
