/**
 * Monetization writes act for the verified caller, never for a uid in the body.
 *
 * The router only runs optional auth and the request-identity door rewrites the
 * query and headers, not the body, so a body `userId` (or `invitedBy`,
 * `adminUserId`) let anyone create payment intents, journey records and org
 * invites as someone else. A body that names another user is refused with 403
 * rather than silently re-attributed, so a confused client fails loudly.
 * Organization reads need a member (or platform admin), and an org the caller
 * can't see answers exactly like one that doesn't exist. Tip completion and
 * partner recommend/feedback name no one but still need a verified caller:
 * feedback moves global partner quality scores, so it counts once per person.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  createPaymentIntent: vi.fn(async (_p: { userId: string }) => ({
    clientSecret: 'cs_test',
    paymentIntentId: 'pi_test',
  })),
  tipCreate: vi.fn(async (p: { userId: string }) => ({ id: 'tip_1', ...p })),
  detect: vi.fn(async (_p: { userId: string }) => null),
  recordReferral: vi.fn((p: { userId: string }) => ({ id: 'ref_1', ...p })),
  recordConversation: vi.fn(async (userId: string) => ({
    userId,
    conversationCount: 1,
    weeksTogetherCount: 0,
    goalsAchievedCount: 0,
    celebratedMilestones: [],
  })),
  celebrate: vi.fn(async (_userId: string, _milestoneId: string) => undefined),
  createInvite: vi.fn(async (p: { invitedBy: string }) => ({ id: 'inv_1', ...p })),
  createOrganization: vi.fn(async (p: { adminUserId: string }) => ({ id: 'org_new', ...p })),
  verifyPayment: vi.fn(async (_id: string) => ({
    succeeded: true,
    amountCents: 500,
    type: 'tip',
    userId: 'uid-alice',
  })),
  updateQuality: vi.fn((_partnerId: string, _feedback: string) => {}),
  recommend: vi.fn((_p: { message: string }) => null),
}));

vi.mock('../../services/stripe-payments.js', () => ({
  createPaymentIntent: m.createPaymentIntent,
  getUserMonetizationData: vi.fn(),
  isStripeConfigured: () => true,
  verifyPayment: m.verifyPayment,
}));
vi.mock('../../services/monetization/persistence.js', () => ({
  initMonetizationPersistence: () => {},
  celebrateJourneyMilestone: m.celebrate,
  createUserJourney: vi.fn(),
  getUserJourney: vi.fn(),
  recordJourneyConversation: m.recordConversation,
  recordJourneyGoal: m.recordConversation,
}));
vi.mock('../../services/monetization/journey.js', () => ({
  checkNewMilestones: () => [],
  getCurrentSeason: () => ({ id: 's1', endDate: '2099-01-01' }),
  JOURNEY_MILESTONES: [{ id: 'm1', title: 'First steps' }],
}));
vi.mock('../../services/monetization/tip-jar.js', () => ({
  tipJar: {
    create: m.tipCreate,
    getConfig: () => ({}),
    getStats: () => ({}),
    getThankYou: () => 'thank you',
  },
}));
vi.mock('../../services/monetization/value-capture.js', () => ({
  valueCapture: { detect: m.detect, getPrompt: () => '' },
}));
vi.mock('../../services/monetization/contextual-partnerships.js', () => ({
  contextualPartnerships: {
    recordReferral: m.recordReferral,
    recordClick: () => {},
    getActivePartners: () => PARTNERS,
    updateQuality: m.updateQuality,
    getBestRecommendation: m.recommend,
  },
}));
vi.mock('../../services/monetization/ferni-fund.js', () => ({
  ferniFund: { COST_PER_CONVERSATION: 50 },
}));

/** The active partner catalogue: a few named partners plus more than one person may rate */
const PARTNERS = [
  'p-recommend-1',
  'p-twice',
  'p-x',
  ...Array.from({ length: 120 }, (_, i) => `p-${i}`),
].map((id) => ({ id }));

const ORG = { id: 'org_1', memberUserIds: ['uid-alice'], adminUserIds: ['uid-alice'] };
vi.mock('../../services/monetization/b2b-licensing.js', () => ({
  b2bLicensing: {
    getOrganization: (orgId: string) => (orgId === ORG.id ? ORG : null),
    isOrgAdmin: (uid: string, orgId: string) => orgId === ORG.id && ORG.adminUserIds.includes(uid),
    getOrgUsageStats: () => ({ conversations: 3 }),
    getROIEstimate: () => ({ roi: 2 }),
    getOnboardingChecklist: () => [],
    createInvite: m.createInvite,
    createOrganization: m.createOrganization,
    calculateMonthlyCost: () => 0,
  },
}));

const { handleMonetizationRequest } = await import('../monetization-routes.js');
const { MAX_PARTNERS_RATED_PER_USER } = await import('../monetization-access.js');

function request(
  method: 'GET' | 'POST',
  pathname: string,
  opts: { body?: unknown; query?: Record<string, string>; as?: string; admin?: boolean } = {}
) {
  return handleMonetizationRequest({
    method,
    pathname,
    query: opts.query ?? {},
    body: opts.body,
    headers: {},
    authUserId: opts.as,
    isAdmin: opts.admin ?? false,
  });
}

/** [path, body without the subject, subject field, the uid the service was asked to act for] */
const WRITES: Array<[string, Record<string, unknown>, string, () => string | undefined]> = [
  [
    '/api/monetization/tip',
    { amountCents: 500 },
    'userId',
    () => m.createPaymentIntent.mock.calls[0]?.[0].userId,
  ],
  [
    '/api/monetization/value/detect',
    { message: 'it worked' },
    'userId',
    () => m.detect.mock.calls[0]?.[0].userId,
  ],
  [
    '/api/monetization/value/contribute',
    { eventId: 'ev_1', amountCents: 500 },
    'userId',
    () => m.createPaymentIntent.mock.calls[0]?.[0].userId,
  ],
  [
    '/api/monetization/fund/contribute',
    { amountCents: 500 },
    'userId',
    () => m.createPaymentIntent.mock.calls[0]?.[0].userId,
  ],
  [
    '/api/monetization/partners/click',
    { partnerId: 'p1' },
    'userId',
    () => m.recordReferral.mock.calls[0]?.[0].userId,
  ],
  [
    '/api/monetization/journey/companion',
    { seasonId: 's1' },
    'userId',
    () => m.createPaymentIntent.mock.calls[0]?.[0].userId,
  ],
  [
    '/api/monetization/journey/record',
    { activityType: 'conversation' },
    'userId',
    () => m.recordConversation.mock.calls[0]?.[0],
  ],
  [
    '/api/monetization/journey/celebrate',
    { milestoneId: 'm1' },
    'userId',
    () => m.celebrate.mock.calls[0]?.[0],
  ],
  [
    '/api/monetization/b2b/invite',
    { orgId: 'org_1', email: 'x@y.z', role: 'member' },
    'invitedBy',
    () => m.createInvite.mock.calls[0]?.[0].invitedBy,
  ],
  [
    '/api/monetization/b2b/organization',
    { name: 'Acme', plan: 'starter', seatCount: 5 },
    'adminUserId',
    () => m.createOrganization.mock.calls[0]?.[0].adminUserId,
  ],
];

describe.each(WRITES)('POST %s', (path, body, field, actedFor) => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a request with no token, whoever the body names', async () => {
    const res = await request('POST', path, { body: { ...body, [field]: 'uid-bob' } });
    expect(res.status).toBe(401);
    expect(actedFor()).toBeUndefined();
  });

  it("refuses alice's token when the body names bob", async () => {
    const res = await request('POST', path, {
      body: { ...body, [field]: 'uid-bob' },
      as: 'uid-alice',
    });
    expect(res.status).toBe(403);
    expect(actedFor()).toBeUndefined();
  });

  it('acts for the verified caller when the body names them', async () => {
    const res = await request('POST', path, {
      body: { ...body, [field]: 'uid-alice' },
      as: 'uid-alice',
    });
    expect(res.status).toBe(200);
    expect(actedFor()).toBe('uid-alice');
  });

  it('acts for the verified caller when the body names no one', async () => {
    const res = await request('POST', path, { body, as: 'uid-alice' });
    expect(res.status).toBe(200);
    expect(actedFor()).toBe('uid-alice');
  });
});

describe('a platform admin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cannot pay as another user either', async () => {
    const res = await request('POST', '/api/monetization/tip', {
      body: { amountCents: 500, userId: 'uid-bob' },
      as: 'uid-admin',
      admin: true,
    });
    expect(res.status).toBe(403);
    expect(m.createPaymentIntent).not.toHaveBeenCalled();
  });
});

describe('POST /api/monetization/tip with Stripe mocked', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the payment intent for the token uid and returns its client secret', async () => {
    const res = await request('POST', '/api/monetization/tip', {
      body: { amountCents: 700, message: 'thanks' },
      as: 'uid-alice',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ clientSecret: 'cs_test', paymentIntentId: 'pi_test' });
    expect(m.createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(m.createPaymentIntent.mock.calls[0]?.[0]).toMatchObject({
      userId: 'uid-alice',
      amountCents: 700,
      type: 'tip',
    });
  });
});

describe('GET /api/monetization/b2b/organization', () => {
  const read = (orgId: string, as?: string, admin = false) =>
    request('GET', '/api/monetization/b2b/organization', { query: { orgId }, as, admin });

  it('refuses a request with no token', async () => {
    const res = await read('org_1');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('uid-alice');
  });

  it('answers a non-member exactly as it answers an org that does not exist', async () => {
    const forbidden = await read('org_1', 'uid-bob');
    const unknown = await read('org_nope', 'uid-bob');
    expect(forbidden.status).toBe(404);
    expect(forbidden).toEqual(unknown);
    expect(JSON.stringify(forbidden.body)).not.toContain('uid-alice');
  });

  it('serves a member', async () => {
    const res = await read('org_1', 'uid-alice');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ organization: { id: 'org_1' }, isAdmin: true });
  });

  it('serves a platform admin', async () => {
    const res = await read('org_1', 'uid-admin', true);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ organization: { id: 'org_1' }, isAdmin: false });
  });
});

/** [path, body, the service call the route makes for a verified caller] */
const CALLER_REQUIRED: Array<[string, Record<string, unknown>, () => unknown[]]> = [
  ['/api/monetization/tip/complete', { paymentIntentId: 'pi_1' }, () => m.verifyPayment.mock.calls],
  [
    '/api/monetization/partners/recommend',
    { message: 'so stressed' },
    () => m.recommend.mock.calls,
  ],
  [
    '/api/monetization/partners/feedback',
    { partnerId: 'p-recommend-1', feedback: 'not_helpful' },
    () => m.updateQuality.mock.calls,
  ],
];

describe.each(CALLER_REQUIRED)('POST %s', (path, body, calls) => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a request with no token, whoever the body or a header claims', async () => {
    const res = await handleMonetizationRequest({
      method: 'POST',
      pathname: path,
      query: {},
      body: { ...body, userId: 'uid-alice' },
      headers: { 'x-user-id': 'uid-alice' },
    });
    expect(res.status).toBe(401);
    expect(calls()).toHaveLength(0);
  });

  it('serves a verified caller', async () => {
    const res = await request('POST', path, { body, as: 'uid-alice' });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);
  });
});

describe('POST /api/monetization/tip/complete for a payment that is not yours', () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers bob as if alice's payment did not exist", async () => {
    const res = await request('POST', '/api/monetization/tip/complete', {
      body: { paymentIntentId: 'pi_1' },
      as: 'uid-bob',
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('thank you');
  });
});

describe('POST /api/monetization/partners/feedback, voted twice', () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts one person's vote on a partner once, and each person's vote", async () => {
    const vote = (as: string) =>
      request('POST', '/api/monetization/partners/feedback', {
        body: { partnerId: 'p-twice', feedback: 'not_helpful' },
        as,
      });
    const repeats = await Promise.all(Array.from({ length: 5 }, () => vote('uid-carol')));
    expect(repeats.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(m.updateQuality).toHaveBeenCalledTimes(1);
    expect((await vote('uid-dave')).status).toBe(200);
    expect(m.updateQuality).toHaveBeenCalledTimes(2);
    expect(m.updateQuality).toHaveBeenLastCalledWith('p-twice', 'not_helpful');
  });
});

describe('POST /api/monetization/partners/feedback, hostile input', () => {
  beforeEach(() => vi.clearAllMocks());

  const vote = (as: string, partnerId: unknown, feedback: unknown = 'not_helpful') =>
    request('POST', '/api/monetization/partners/feedback', { body: { partnerId, feedback }, as });
  const votesOn = (partnerId: string) =>
    m.updateQuality.mock.calls.filter(([id]) => id === partnerId).length;

  it('records nothing for a partner that does not exist', async () => {
    const res = await vote('uid-erin', 'p-made-up');
    expect(res.status).toBe(404);
    expect(m.updateQuality).not.toHaveBeenCalled();
  });

  it.each([['very_bad'], [''], [5], [null], [['helpful']]])(
    'refuses feedback %j with 400',
    async (feedback) => {
      const res = await vote('uid-erin', 'p-x', feedback);
      expect(res.status).toBe(400);
      expect(m.updateQuality).not.toHaveBeenCalled();
    }
  );

  it("a flood of votes on other partners can't reset a person's vote on partner X", async () => {
    expect((await vote('uid-frank', 'p-x')).status).toBe(200);
    expect(votesOn('p-x')).toBe(1);

    // more made-up partners than the old FIFO held, then every real partner
    const fake = Array.from({ length: 50_001 }, (_, i) => vote('uid-frank', `p-fake-${i}`));
    const real = PARTNERS.filter((p) => p.id !== 'p-x').map((p) => vote('uid-frank', p.id));
    await Promise.all([...fake, ...real]);

    expect((await vote('uid-frank', 'p-x')).status).toBe(200);
    expect(votesOn('p-x')).toBe(1);
  });

  it('refuses a new partner past the per-person cap instead of forgetting an old vote', async () => {
    const ids = PARTNERS.map((p) => p.id);
    const first = await Promise.all(
      ids.slice(0, MAX_PARTNERS_RATED_PER_USER).map((id) => vote('uid-gina', id))
    );
    expect(first.every((r) => r.status === 200)).toBe(true);
    expect(m.updateQuality).toHaveBeenCalledTimes(MAX_PARTNERS_RATED_PER_USER);

    const over = await vote('uid-gina', ids[MAX_PARTNERS_RATED_PER_USER]);
    expect(over.status).toBe(429);
    expect(m.updateQuality).toHaveBeenCalledTimes(MAX_PARTNERS_RATED_PER_USER);
    // and the earliest vote still holds
    await vote('uid-gina', ids[0]);
    expect(m.updateQuality).toHaveBeenCalledTimes(MAX_PARTNERS_RATED_PER_USER);
  });
});
