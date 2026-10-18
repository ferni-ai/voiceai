/**
 * Commitments can be closed from the app: done, or dismissed.
 *
 * 224 commitments in prod sat 'active' for good: nothing outside a call could
 * close one, and an after-call commitment (saved with .add()) carried no id in
 * its data, so the list sent the app items without an id. Real HTTP through the
 * real route and store; only Firestore is faked in memory.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failWrites: false,
}));
const docRef = (path: string) => ({
  path,
  get: async () => ({
    exists: db.docs.has(path),
    get: (f: string) => db.docs.get(path)?.[f],
    data: () => db.docs.get(path),
  }),
});
const fakeFirestore = {
  collection: (c: string) => ({
    doc: (uid: string) => ({
      collection: (sub: string) => {
        const base = `${c}/${uid}/${sub}`;
        const query = {
          where: () => query,
          orderBy: () => query,
          limit: () => query,
          get: async () => ({
            docs: [...db.docs.entries()]
              .filter(([p, d]) => p.startsWith(`${base}/`) && d.status === 'active')
              .map(([p, d]) => ({ id: p.split('/').pop()!, data: () => d })),
          }),
        };
        return { ...query, doc: (id: string) => docRef(`${base}/${id}`) };
      },
    }),
  }),
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        if (db.failWrites) throw new Error('firestore unavailable');
        db.docs.set(ref.path, { ...db.docs.get(ref.path), ...data });
      },
    }),
};
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore,
  recordDegradation: () => undefined,
}));
// The follow-through store, in memory: follow-ups by id.
const followUps = vi.hoisted(() => ({
  byId: new Map<string, Record<string, unknown>>(),
  failSaves: false,
}));
const followUpStore = vi.hoisted(() => ({
  live: async (userId: string) =>
    [...followUps.byId.values()].filter(
      (f) => f.userId === userId && (f.status === 'open' || f.status === 'surfaced')
    ) as never[],
  save: async (next: Record<string, unknown>, expected: string) => {
    if (followUps.failSaves) throw new Error('firestore unavailable');
    const current = followUps.byId.get(next.id as string);
    if (!current || current.updatedAt !== expected) return false;
    followUps.byId.set(next.id as string, next);
    return true;
  },
}));
vi.mock('../../services/stores/follow-through-store.js', () => ({
  firestoreFollowUpStore: () => followUpStore,
}));
const wins = vi.hoisted(() => ({ recorded: [] as string[] }));
vi.mock('../../services/superhuman/wins.js', () => ({
  recordWinFromCommitment: async (_u: string, id: string) => void wins.recorded.push(id),
}));

const { handleCommitmentsRoutes } = await import('../routes/commitments.js');
const { sendDueFollowUpTexts } = await import('../../services/outreach/follow-up-texts.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleCommitmentsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

const path = (uid: string, id: string) => `bogle_users/${uid}/commitments/${id}`;
beforeEach(() => {
  db.docs.clear();
  db.failWrites = false;
  wins.recorded = [];
  followUps.byId.clear();
  followUps.failSaves = false;
  // the follow-up the after-call import made from that commitment, already due
  followUps.byId.set('fu-c1', {
    id: 'fu-c1',
    userId: 'u1',
    kind: 'commitment',
    text: 'call my sister',
    dueAt: '2026-10-18T13:00:00.000Z',
    zone: 'America/New_York',
    repeat: null,
    source: { store: 'commitments', ref: 'AutoId123' },
    status: 'open',
    surfaced: [],
    createdAt: '2026-09-30T09:00:00.000Z',
    updatedAt: '2026-09-30T09:00:00.000Z',
  });
  // saved with .add(): no id in the data
  db.docs.set(path('u1', 'AutoId123'), {
    summary: 'call my sister',
    status: 'active',
    createdAt: 2,
  });
  db.docs.set(path('u2', 'TheirsId'), { summary: 'private', status: 'active', createdAt: 1 });
});

const as = (uid: string) => ({ 'x-firebase-uid': uid });
const close = (uid: string, id: string, action: string) =>
  fetch(`${base}/api/commitments/${id}/${action}`, { method: 'POST', headers: as(uid) });
const listIds = async (uid: string) => {
  const res = await fetch(`${base}/api/commitments?status=active`, { headers: as(uid) });
  return ((await res.json()) as { items: Array<{ id: string }> }).items.map((i) => i.id);
};

describe('closing a commitment from the app', () => {
  it('lists each commitment with its document id, even one saved without an id field', async () => {
    expect(await listIds('u1')).toEqual(['AutoId123']);
  });

  it('marks it done for its owner, records the win, and it leaves the list', async () => {
    const res = await close('u1', 'AutoId123', 'complete');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 'AutoId123', status: 'completed' });
    expect(db.docs.get(path('u1', 'AutoId123'))).toMatchObject({ status: 'completed' });
    expect(wins.recorded).toEqual(['AutoId123']);
    expect(followUps.byId.get('fu-c1')).toMatchObject({ status: 'done' });
    expect(await listIds('u1')).toEqual([]);
  });

  it("dismisses it as 'dismissed' (not 'abandoned') without counting a win", async () => {
    expect((await close('u1', 'AutoId123', 'dismiss')).status).toBe(200);
    expect(db.docs.get(path('u1', 'AutoId123'))).toMatchObject({ status: 'dismissed' });
    expect(wins.recorded).toEqual([]);
  });

  it("is 404 for another user's commitment and leaves it untouched", async () => {
    expect((await close('u1', 'TheirsId', 'complete')).status).toBe(404);
    expect(db.docs.get(path('u2', 'TheirsId'))).toMatchObject({ status: 'active' });
  });

  it('is 401 without a verified caller, whatever the query says', async () => {
    const res = await fetch(`${base}/api/commitments/AutoId123/complete?userId=u1`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
    expect(db.docs.get(path('u1', 'AutoId123'))).toMatchObject({ status: 'active' });
  });

  it('is 500, not success, when the write fails', async () => {
    db.failWrites = true;
    const res = await close('u1', 'AutoId123', 'complete');
    expect(res.status).toBe(500);
    expect(db.docs.get(path('u1', 'AutoId123'))).toMatchObject({ status: 'active' });
  });

  it('is 404 for one already closed', async () => {
    await close('u1', 'AutoId123', 'dismiss');
    expect((await close('u1', 'AutoId123', 'complete')).status).toBe(404);
  });

  it('a dismissed commitment is never texted about: its follow-up is released', async () => {
    const sendText = vi.fn(async () => ({ sent: true }));
    const textDeps = {
      store: followUpStore,
      optedIn: async () => ['u1'],
      resolveFlags: async () => ({ FOLLOW_THROUGH_TEXTS: 'on' }),
      sendText,
      forgotten: async () => [] as string[],
    } as unknown as Parameters<typeof sendDueFollowUpTexts>[0];
    const now = new Date('2026-10-18T15:00:00.000Z');
    // the precondition: left open, the follow-up job would text it
    await sendDueFollowUpTexts(textDeps, { dryRun: true, now }).then((r) =>
      expect(r.wouldSend).toBe(1)
    );

    expect((await close('u1', 'AutoId123', 'dismiss')).status).toBe(200);

    expect(followUps.byId.get('fu-c1')).toMatchObject({ status: 'released' });
    const report = await sendDueFollowUpTexts(textDeps, { now });
    expect(sendText).not.toHaveBeenCalled();
    expect(report.sent).toBe(0);
  });

  it('a follow-up that fails to close is a 500, and the retry finishes it', async () => {
    followUps.failSaves = true;
    expect((await close('u1', 'AutoId123', 'dismiss')).status).toBe(500);
    expect(followUps.byId.get('fu-c1')).toMatchObject({ status: 'open' });

    followUps.failSaves = false;
    expect((await close('u1', 'AutoId123', 'dismiss')).status).toBe(200);
    expect(followUps.byId.get('fu-c1')).toMatchObject({ status: 'released' });
  });
});
