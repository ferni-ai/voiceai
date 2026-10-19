import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
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
      update: async (data: Record<string, unknown>) =>
        void coll(name).set(id, { ...coll(name).get(id), ...data }),
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
/** POST /api/waitlist/approve as an admin (requireAdmin is mocked to pass). */
async function approve(target: string): Promise<{ status: number }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ email: target }))]), {
    url: '/api/waitlist/approve',
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json' },
  });
  let status = 0;
  const res = { writeHead: (s: number) => void (status = s), setHeader: () => {}, end: () => {} };
  await handleWaitlistRoutes(req as never, res as never);
  return { status };
}
type Profile = Record<string, unknown> & { subscription: Record<string, unknown> };
const docId = (e: string) => Buffer.from(e).toString('base64').replace(/[/+=]/g, '_');

describe('waitlist check', () => {
  afterEach(() => {
    email.value = 'newcomer@example.com';
    email.verified = true;
    store.clear();
    vi.unstubAllEnvs();
  });

  it('lets a brand-new person in on the free tier', async () => {
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, status: 'approved', tier: 'free' });
    const profile = coll('user_profiles').get(docId(email.value)) as {
      subscription: Record<string, unknown>;
    };
    expect(profile.subscription).toMatchObject({
      tier: 'free',
      status: 'active',
      grantedVia: 'open-access',
    });
  });

  it('lets in someone who was left pending on the waitlist', async () => {
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'pending' });
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, tier: 'free' });
    expect(coll('waitlist').get(docId(email.value))).toMatchObject({
      status: 'approved',
      source: 'open_access',
    });
  });

  it('makes an approved waitlist entry a founding member on the free tier, not a partner', async () => {
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'approved' });
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, tier: 'free', foundingMember: true, foundingWave: 0 }); // prettier-ignore
    const profile = coll('user_profiles').get(docId(email.value)) as Profile;
    expect(profile).toMatchObject({ foundingMember: true, foundingWave: 0 });
    expect(profile.subscription).toMatchObject({ tier: 'free', status: 'active' });
    expect(profile.subscription.currentPeriodEnd).toBeUndefined(); // no 10-year grant
  });

  it('a wave seat claimed on sign-in: founding member of that wave, and the seat is joined', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'admitted', foundingWave: 3 }); // prettier-ignore
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, tier: 'free', foundingMember: true, foundingWave: 3 }); // prettier-ignore
    expect(coll('user_profiles').get(docId(email.value))).toMatchObject({ foundingMember: true, foundingWave: 3 }); // prettier-ignore
    expect(coll('waitlist').get(docId(email.value))).toMatchObject({ status: 'joined' });
  });

  it('leaves an existing grant untouched: an active partner stays partner, no founding write', async () => {
    const id = docId(email.value);
    const partner = { email: email.value, subscription: { tier: 'partner', status: 'active' } };
    coll('user_profiles').set(id, partner);
    coll('waitlist').set(id, { email: email.value, status: 'approved' });
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, tier: 'partner' });
    expect(coll('user_profiles').get(id)).toEqual(partner);
  });

  it('admin approval: a founding member on the free tier, an existing active grant keeps its tier', async () => {
    vi.stubEnv('SENDGRID_API_KEY', ''); // the welcome email is skipped, never sent
    const fresh = 'fresh@example.com';
    coll('waitlist').set(docId(fresh), { email: fresh, status: 'pending' });
    expect((await approve(fresh)).status).toBe(200);
    const profile = coll('user_profiles').get(docId(fresh)) as Profile;
    expect(profile).toMatchObject({ foundingMember: true, foundingWave: 0 });
    expect(profile.subscription).toMatchObject({ tier: 'free', status: 'active' });
    expect(profile.subscription.currentPeriodEnd).toBeUndefined();

    const paying = 'paying@example.com';
    coll('waitlist').set(docId(paying), { email: paying, status: 'pending' });
    coll('user_profiles').set(docId(paying), { email: paying, subscription: { tier: 'partner', status: 'active' } }); // prettier-ignore
    await approve(paying);
    expect(coll('user_profiles').get(docId(paying))).toMatchObject({
      foundingMember: true,
      subscription: { tier: 'partner', status: 'active' },
    });
  });

  it('keeps the gate when WAITLIST_GATE=on', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    const { body } = await check();
    expect(body).toMatchObject({ approved: false, status: 'pending' });
    expect(coll('user_profiles').size).toBe(0);
  });

  // A made-up address: the real owner address is the OWNER_EMAIL secret.
  it.each(['pat.example@gmail.com', 'patexample@gmail.com'])(
    'lets the owner in as partner when OWNER_EMAIL is set (%s)',
    async (signedIn) => {
      vi.stubEnv('OWNER_EMAIL', 'pat.example@gmail.com');
      vi.stubEnv('WAITLIST_GATE', 'on');
      email.value = signedIn;
      const { body } = await check();
      expect(body).toMatchObject({ approved: true, status: 'approved', tier: 'partner' });
      expect(coll('user_profiles').size).toBe(0); // the bypass, not open access
    }
  );

  it('gives no owner bypass while OWNER_EMAIL is unset', async () => {
    vi.stubEnv('OWNER_EMAIL', '');
    vi.stubEnv('WAITLIST_GATE', 'on');
    email.value = 'pat.example@gmail.com';
    const { body } = await check();
    expect(body).toMatchObject({ approved: false, status: 'pending' });
  });

  it("never acts on an unverified email: no access, no write to that email's profile", async () => {
    email.verified = false; // e.g. an email/password account claiming someone else's address
    const owner = docId(email.value);
    coll('user_profiles').set(owner, {
      email: email.value,
      subscription: { tier: 'partner', status: 'active' },
    });
    const { body } = await check();
    expect(body).toMatchObject({ approved: false, status: 'unverified_email' });
    expect(coll('user_profiles').get(owner)).toEqual({
      email: email.value,
      subscription: { tier: 'partner', status: 'active' },
    });
  });
});
