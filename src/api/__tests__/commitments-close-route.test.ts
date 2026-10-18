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
const wins = vi.hoisted(() => ({ recorded: [] as string[] }));
vi.mock('../../services/superhuman/wins.js', () => ({
  recordWinFromCommitment: async (_u: string, id: string) => void wins.recorded.push(id),
}));

const { handleCommitmentsRoutes } = await import('../routes/commitments.js');

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
    expect(await listIds('u1')).toEqual([]);
  });

  it('dismisses it without counting a win', async () => {
    expect((await close('u1', 'AutoId123', 'dismiss')).status).toBe(200);
    expect(db.docs.get(path('u1', 'AutoId123'))).toMatchObject({ status: 'abandoned' });
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
});
