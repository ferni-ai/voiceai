import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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
      create: async (data: Record<string, unknown>) => {
        if (coll(name).has(id)) throw Object.assign(new Error('exists'), { code: 6 });
        coll(name).set(id, data);
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void coll(name).set(id, opts?.merge ? { ...coll(name).get(id), ...data } : data),
      update: async (data: Record<string, unknown>) =>
        void coll(name).set(id, { ...coll(name).get(id), ...data }),
    }),
    where: (field: string, _op: string, value: string) => ({
      limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
      // feature_cohorts membership (array-contains), for the admission rules
      get: async () => ({ docs: [...coll(name)].filter(([, d]) => (d[field] as string[] | undefined)?.includes(value)).map(([id, d]) => ({ id, data: () => d })) }), // prettier-ignore
    }),
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
      getUser: async () => ({ disabled: false }), // a live account (token-revocation.ts)
    }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb, FieldValue: {} }));
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => fakeDb, // the queue store (services/waitlist) writes to the same docs
}));
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false, requireAdmin: () => true }));
// The admission rules (admission.ts) read the same in-memory database
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fakeDb,
}));

const { handleWaitlistRoutes } = await import('../waitlist-routes.js');
const { forgetAdmissionCache } = await import('../admission.js');

async function check(
  referralCode?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  // prettier-ignore
  const req = Object.assign(new EventEmitter(), {
    url: `/api/waitlist/check${referralCode ? `?referralCode=${referralCode}` : ''}`,
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
/** POST /api/waitlist (the public landing form). */
async function signup(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: '/api/waitlist',
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: `198.51.100.${Math.floor(Math.random() * 200)}` },
  });
  let status = 0;
  let text = '';
  const res = { writeHead: (s: number) => void (status = s), setHeader: () => {}, end: (b: string) => void (text = b) }; // prettier-ignore
  await handleWaitlistRoutes(req as never, res as never);
  return { status, body: JSON.parse(text) as unknown };
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
    forgetAdmissionCache();
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
    // An unconfigured transport: the welcome email is skipped, never sent.
    const { setEmailSenderForTests } = await import('../../services/email-transport/index.js');
    setEmailSenderForTests({ provider: 'gmail', isConfigured: () => false, send: vi.fn() });
    onTestFinished(() => setEmailSenderForTests(null));
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

  it('the public signup never overwrites an existing entry, and answers exactly as for a new one', async () => {
    const victim = 'victim@example.com';
    const seat = { email: victim, status: 'admitted', phone: '+15550000001', timestamp: 'then' };
    coll('waitlist').set(docId(victim), { ...seat });
    const attack = await signup({ email: victim, phone: '+15550009999', source: 'landing' });
    expect(coll('waitlist').get(docId(victim))).toEqual(seat);
    const fresh = await signup({ email: 'someone-new@example.com', source: 'landing' });
    expect(attack).toEqual(fresh);
    expect(coll('waitlist').get(docId('someone-new@example.com'))).toMatchObject({ status: 'pending' }); // prettier-ignore
  });

  it('gate on: signing in verifies an existing website signup and puts it in line', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'pending', source: 'landing' }); // prettier-ignore
    expect((await check()).body).toMatchObject({ approved: false, status: 'pending' });
    expect(coll('waitlist').get(docId(email.value))).toMatchObject({ inQueue: true, verifiedAt: expect.any(Date), uid: 'uid-1' }); // prettier-ignore
  });

  it('gate on: verifying a planted signup drops its phone and referrer, keeps its place', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    const joinedAt = new Date('2026-09-01T00:00:00Z');
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'pending', joinedAt, phone: '+15550001111', referralCode: 'aaaaaa-fern' }); // prettier-ignore
    await check();
    expect(coll('waitlist').get(docId(email.value))).toMatchObject({ phone: null, referralCode: null, joinedAt, verifiedAt: expect.any(Date) }); // prettier-ignore
  });

  it('a referral code offered after the first verification is not written', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'pending', verifiedAt: new Date() }); // prettier-ignore
    await check('abc123-fern');
    expect(coll('waitlist').get(docId(email.value))?.referralCode).toBeUndefined();
  });

  it('keeps the gate when WAITLIST_GATE=on', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    const { body } = await check();
    expect(body).toMatchObject({ approved: false, status: 'pending' });
    expect(coll('user_profiles').size).toBe(0);
    // A verified sign-in joins the line: verified, standard lane, with an invite code of their own
    expect(coll('waitlist').get(docId(email.value))).toMatchObject({
      status: 'pending',
      source: 'app_signin',
      inQueue: true,
      laneRank: 2,
      verifiedAt: expect.any(Date),
      inviteCode: expect.stringMatching(/^[a-z0-9]{6}-[a-z]+$/),
    });
  });

  it('gate on: lets in a friends-and-family member, as the token route would', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    coll('feature_cohorts').set('friends-and-family', { members: ['uid-1'] });
    const { body } = await check();
    expect(body).toMatchObject({ approved: true, status: 'approved', tier: 'free' });
    const profile = coll('user_profiles').get(docId(email.value)) as { subscription: Record<string, unknown> }; // prettier-ignore
    expect(profile.subscription).toMatchObject({ grantedVia: 'admission' });
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
