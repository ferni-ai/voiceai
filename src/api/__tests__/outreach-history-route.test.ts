/**
 * GET /api/outreach/history tells failure apart from "nothing sent".
 *
 * A history read that fails used to be indistinguishable from an empty history (the
 * panel swallowed errors into "No outreach history yet"). The route now answers 500
 * when the store can't be read, so the panel can show its error state. It also reads
 * for the caller from requireAuth only, never a `userId` the query names.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: { admin: false }, isAnonymous: false } : null
  ),
}));
// The store behind the real reader: `fail` makes every read reject, `reads` records
// which user and limit each read asked for.
const store = vi.hoisted(() => ({ fail: false, reads: [] as Array<[string, number]> }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (path: string) => ({
      orderBy: () => ({
        limit: (n: number) => ({
          get: async () => {
            store.reads.push([path.split('/')[1] ?? '', n]);
            if (store.fail) throw new Error('firestore unavailable');
            return { docs: [] };
          },
        }),
      }),
    }),
  }),
}));

const { handleOutreachRoutes } = await import('../outreach.routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
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
beforeEach(() => {
  store.fail = false;
  store.reads = [];
});

const get = (query: string) =>
  fetch(`${base}/api/outreach/history${query}`, { headers: { authorization: 'Bearer tok-A' } });

describe('GET /api/outreach/history', () => {
  it('answers 500, not an empty list, when the store cannot be read', async () => {
    store.fail = true;

    const res = await get('?limit=20');

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ success: false });
  });

  it('reads for the signed-in caller, whatever userId the query names', async () => {
    const res = await get('?limit=20&userId=uid-B');

    expect(await res.json()).toEqual({ success: true, history: [], count: 0 });
    expect(store.reads).toEqual([['uid-A', 20]]);
  });

  it('keeps the limit between 1 and 50', async () => {
    await get('?limit=999');
    await get('?limit=abc');

    expect(store.reads.map(([, n]) => n)).toEqual([50, 20]);
  });
});
