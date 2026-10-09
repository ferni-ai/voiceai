import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory Firestore: collection -> doc id -> data
const { store, email } = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
  email: { value: 'newcomer@example.com', verified: true },
}));
const coll = (name: string) => store.get(name) ?? store.set(name, new Map()).get(name)!;
const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: async () => ({ exists: coll(name).has(id), data: () => coll(name).get(id) }),
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void coll(name).set(id, opts?.merge ? { ...coll(name).get(id), ...data } : data),
    }),
    where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
  }),
};
vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    auth: () => ({
      verifyIdToken: async () => ({
        uid: 'uid-1',
        email: email.value,
        email_verified: email.verified,
      }),
    }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb, FieldValue: {} }));

const { handleWaitlistRoutes } = await import('../waitlist-routes.js');

/** Same caller (same IP), as a browser reloading the app would be. */
async function call(url: string, method = 'GET'): Promise<number> {
  const req = Object.assign(new EventEmitter(), {
    url,
    method,
    headers: { host: 'localhost', authorization: 'Bearer a.b.c' },
    socket: { remoteAddress: '203.0.113.7' },
  });
  let status = 0;
  const res = {
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: () => {},
  };
  // POST sign-ups wait for a body; give them an empty one
  const done = handleWaitlistRoutes(req as never, res as never);
  if (method === 'POST') req.emit('end');
  await done;
  return status;
}

describe('waitlist rate limits', () => {
  it('lets a returning user reload the app many times in a minute', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push(await call('/api/waitlist/check'));
    expect(statuses.filter((s) => s === 429)).toEqual([]);
  });

  it('still caps anonymous sign-ups, in their own bucket', async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push(await call('/api/waitlist', 'POST'));
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});
