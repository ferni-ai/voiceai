import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

// In-memory Firestore: collection -> doc id -> data
const { store, email, outage } = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
  email: { value: 'newcomer@example.com', verified: true },
  outage: { cohorts: false }, // the cohort lookup throws, as a Firestore outage would
}));
const coll = (name: string) => store.get(name) ?? store.set(name, new Map()).get(name)!;
type FakeRef = {
  get: () => Promise<unknown>;
  set: (d: Record<string, unknown>, o?: { merge?: boolean }) => Promise<void>;
  update: (d: Record<string, unknown>) => Promise<void>;
};
const fakeDb = {
  // Transactions run straight through: each step reads and writes the docs directly
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
    fn({
      get: (ref: FakeRef) => ref.get(),
      set: (ref: FakeRef, d: Record<string, unknown>, o?: { merge?: boolean }) => ref.set(d, o),
      update: (ref: FakeRef, d: Record<string, unknown>) => ref.update(d),
    }),
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
      get: async () => {
        if (outage.cohorts && name === 'feature_cohorts') throw new Error('unavailable');
        return { docs: [...coll(name)].filter(([, d]) => (d[field] as string[] | undefined)?.includes(value)).map(([id, d]) => ({ id, data: () => d })) }; // prettier-ignore
      },
    }),
  }),
};
// The app is already initialized: the global firebase-admin/app mock (setup.ts) reports one.
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async () => ({
      uid: 'uid-1',
      email: email.value,
      email_verified: email.verified,
    }),
    getUser: async () => ({ disabled: false }), // a live account (token-revocation.ts)
  }),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
  FieldValue: { arrayUnion: (...v: unknown[]) => ({ arrayUnion: v }) },
}));
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
/** POST /api/waitlist/vote (public, unauthenticated) for this address. */
async function vote(target: string, featureId = 'memory-lane'): Promise<{ status: number }> {
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify({ featureId, email: target }))]),
    {
      // prettier-ignore
      url: '/api/waitlist/vote',
      method: 'POST',
      headers: { host: 'localhost', 'content-type': 'application/json' },
    }
  );
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

// DURABLE_ACCESS_GRANTS (#2264): a grant stored for a reason that ends stops admitting when it does
describe('stored grants under the gate', () => {
  const gateOn = (flag: 'on' | 'off') => {
    forgetAdmissionCache();
    vi.stubEnv('WAITLIST_GATE', 'on');
    vi.stubEnv('DURABLE_ACCESS_GRANTS', flag);
  };
  const entry = () => coll('waitlist').get(docId(email.value));
  afterEach(() => {
    store.clear();
    outage.cohorts = false;
    forgetAdmissionCache();
    vi.unstubAllEnvs();
  });

  it.each([
    ['on', { approved: false, status: 'pending' }],
    ['off', { approved: true, status: 'approved' }], // main: the open-access grant never ends
  ] as const)(
    'flag %s: a grant made while the gate was off, once the gate is on',
    async (flag, want) => {
      vi.stubEnv('DURABLE_ACCESS_GRANTS', flag);
      expect((await check()).body).toMatchObject({ approved: true }); // gate off: open access
      expect(entry()).toMatchObject({ status: 'approved', source: 'open_access' });
      gateOn(flag);
      expect((await check()).body).toMatchObject(want);
      if (flag === 'on') {
        expect(entry()).toMatchObject({ status: 'pending', inQueue: true, lapsedApproval: { source: 'open_access' } }); // prettier-ignore
      } else {
        expect(entry()).toMatchObject({ status: 'approved', source: 'open_access' });
      }
    }
  );

  it.each([
    ['on', { approved: false, status: 'pending' }],
    ['off', { approved: true, status: 'approved' }], // main: membership ended, access did not
  ] as const)('flag %s: a friends-and-family grant when membership ends', async (flag, want) => {
    gateOn(flag);
    coll('feature_cohorts').set('friends-and-family', { members: ['uid-1'] });
    expect((await check()).body).toMatchObject({ approved: true });
    const granted = (coll('user_profiles').get(docId(email.value)) as Profile).subscription;
    expect(granted).toMatchObject({ grantedVia: 'admission' });
    gateOn(flag);
    expect((await check()).body).toMatchObject({ approved: true }); // still a member
    expect((coll('user_profiles').get(docId(email.value)) as Profile).subscription.subscribedAt).toBe(granted.subscribedAt); // prettier-ignore
    coll('feature_cohorts').set('friends-and-family', { members: [] });
    gateOn(flag);
    expect((await check()).body).toMatchObject(want);
  });

  it('flag on: an explicit admin approval still lets them in, even over an open-access approval', async () => {
    const { setEmailSenderForTests } = await import('../../services/email-transport/index.js');
    setEmailSenderForTests({ provider: 'gmail', isConfigured: () => false, send: vi.fn() });
    onTestFinished(() => setEmailSenderForTests(null));
    vi.stubEnv('DURABLE_ACCESS_GRANTS', 'on');
    await check(); // gate off: open access
    expect((await approve(email.value)).status).toBe(200); // not "already approved"
    gateOn('on');
    expect((await check()).body).toMatchObject({ approved: true, status: 'approved' });
    expect(entry()).toMatchObject({ status: 'approved', approvedBy: 'admin-api' });
  });

  it('flag on: a legacy grant with no recorded reason keeps admitting', async () => {
    coll('waitlist').set(docId(email.value), { email: email.value, status: 'approved', source: 'landing' }); // prettier-ignore
    coll('user_profiles').set(docId(email.value), { email: email.value, subscription: { tier: 'free', status: 'active' } }); // prettier-ignore
    gateOn('on');
    expect((await check()).body).toMatchObject({ approved: true, status: 'approved' });
  });

  it('flag on: a failed re-check answers a retryable 500 and writes nothing (fails closed)', async () => {
    vi.stubEnv('DURABLE_ACCESS_GRANTS', 'on');
    await check(); // gate off: open access
    const before = { ...entry() };
    outage.cohorts = true;
    gateOn('on');
    expect((await check()).status).toBe(500);
    expect(entry()).toEqual(before);
  });
  it('the open-access approval records approvedVia, written with status approved', async () => {
    await check(); // gate off: open access
    expect(entry()).toMatchObject({ status: 'approved', source: 'open_access', approvedVia: 'open_access' }); // prettier-ignore
  });

  it('flag on: an open-access approval whose source a past vote overwrote still lapses', async () => {
    await check(); // gate off: open access
    coll('waitlist').set(docId(email.value), { ...entry(), source: 'feature' }); // what votes did before #2264
    gateOn('on');
    expect((await check()).body).toMatchObject({ approved: false, status: 'pending' });
    expect(entry()).toMatchObject({ status: 'pending', lapsedApproval: { source: 'open_access' } });
  });

  it.each(['on', 'off'] as const)(
    'flag %s: a vote on an existing approved entry only adds the feature',
    async (flag) => {
      vi.stubEnv('DURABLE_ACCESS_GRANTS', flag);
      const id = docId(email.value);
      const before = { email: email.value, status: 'approved', source: 'open_access', timestamp: 'then' }; // prettier-ignore
      coll('waitlist').set(id, { ...before });
      expect((await vote(email.value)).status).toBe(200);
      expect(coll('waitlist').get(id)).toEqual({ ...before, interestedFeatures: { arrayUnion: ['memory-lane'] } }); // prettier-ignore
    }
  );

  it.each([
    ['open-access', { approved: false, status: 'pending' }],
    [undefined, { approved: true, status: 'approved' }],
  ] as const)(
    'flag on: an old approval relabelled by a vote, profile grant %s',
    async (grantedVia, want) => {
      const id = docId(email.value);
      coll('waitlist').set(id, { email: email.value, status: 'approved', source: 'feature', approvedAt: new Date('2026-10-10') }); // prettier-ignore
      if (grantedVia) coll('user_profiles').set(id, { email: email.value, subscription: { tier: 'free', status: 'active', grantedVia } }); // prettier-ignore
      gateOn('on');
      expect((await check()).body).toMatchObject(want);
      expect(entry()).toMatchObject({ status: grantedVia ? 'pending' : 'approved' });
    }
  );

  it('a vote from a new address creates its entry', async () => {
    expect((await vote('voter@example.com')).status).toBe(200);
    expect(coll('waitlist').get(docId('voter@example.com'))).toMatchObject({ email: 'voter@example.com', source: 'feature' }); // prettier-ignore
  });

  it.each([
    ['a live Stripe plan', { tier: 'partner', status: 'active', provider: 'stripe', stripeSubscriptionId: 'sub_0101' }, true], // prettier-ignore
    ['a live App Store plan', { tier: 'friend', status: 'active', provider: 'apple', currentPeriodEnd: new Date('2099-01-01') }, true], // prettier-ignore
    ['a cancelled Stripe plan', { tier: 'partner', status: 'canceled', provider: 'stripe', stripeSubscriptionId: 'sub_0101' }, false], // prettier-ignore
  ] as const)('flag on: an open-access grant plus %s on the account', async (_, plan, admitted) => {
    vi.stubEnv('DURABLE_ACCESS_GRANTS', 'on');
    await check(); // gate off: open access
    coll('bogle_users').set('uid-1', { subscription: plan }); // where Stripe and Apple write
    gateOn('on');
    expect((await check()).body).toMatchObject({ approved: admitted });
  });
});
