import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory Firestore: collection -> doc id -> data
const { store, email } = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
  email: { value: 'newcomer@example.com' },
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
    auth: () => ({ verifyIdToken: async () => ({ uid: 'uid-1', email: email.value }) }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb, FieldValue: {} }));
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false, requireAdmin: () => true }));

const { handleWaitlistRoutes } = await import('../waitlist-routes.js');

async function check(): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = Object.assign(new EventEmitter(), {
    url: '/api/waitlist/check',
    method: 'GET',
    headers: { host: 'localhost', authorization: 'Bearer a.b.c' },
  });
  let status = 0;
  let body = '';
  const res = {
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: (b: string) => void (body = b),
  };
  await handleWaitlistRoutes(req as never, res as never);
  return { status, body: JSON.parse(body) };
}
const docId = (e: string) => Buffer.from(e).toString('base64').replace(/[/+=]/g, '_');

describe('waitlist check', () => {
  afterEach(() => {
    store.clear();
    vi.unstubAllEnvs();
  });

  it('lets a brand-new person in on the free tier', async () => {
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, status: 'approved', tier: 'free' });
    const profile = coll('user_profiles').get(docId(email.value)) as { subscription: Record<string, unknown> };
    expect(profile.subscription).toMatchObject({ tier: 'free', status: 'active', grantedVia: 'open-access' });
  });

  it('lets in someone who was left pending on the waitlist', async () => {
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'pending' });
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, tier: 'free' });
    expect(coll('waitlist').get(docId(email.value))).toMatchObject({ status: 'approved', source: 'open_access' });
  });

  it('still gives an approved waitlist entry the partner tier', async () => {
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'approved' });
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, tier: 'partner' });
  });

  it('keeps the gate when WAITLIST_GATE=on', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    const { body } = await check();
    expect(body).toMatchObject({ approved: false, status: 'pending' });
    expect(coll('user_profiles').size).toBe(0);
  });
});
