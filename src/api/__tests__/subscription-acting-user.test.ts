/**
 * Subscription writes act on the verified caller, never on a userId the body names.
 *
 * POST /subscription/portal, /subscription/checkout, /usage/conversation and the
 * trial endpoints took `body.userId` as given, with no auth: anyone could open
 * another user's Stripe billing portal, bill a checkout to their account, or
 * burn their trial. The UI server mount (servers/api/index.ts) passes the
 * verified caller as ctx.authUserId / ctx.isAdmin; these tests call the REAL
 * route handler with that context. Only the billing and trial services are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(() => true),
  createPortalSession: vi.fn(async () => ({ url: 'https://billing.stripe.com/p/session' })),
  createCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/session' })),
  recordConversation: vi.fn(async () => ({ conversationsUsed: 1 })),
  getSubscriptionInfo: vi.fn(),
  canStartConversation: vi.fn(),
  verifyWebhook: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));
vi.mock('../../services/stripe-subscription.js', () => stripe);

const trial = vi.hoisted(() => ({
  isEligibleForTrial: vi.fn(async () => true),
  startTrial: vi.fn(async () => ({ started: true })),
  getTrialState: vi.fn(async () => ({ trialTimeUsedMs: 0 })),
  checkTrialStatus: vi.fn(async () => ({ inTrial: true })),
  recordTrialTime: vi.fn(async () => ({ trialTimeUsedMs: 1000 })),
  TRIAL_DURATION_MS: 420_000,
}));
vi.mock('../../services/first-taste-trial.js', () => trial);

vi.mock('../../services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: vi.fn(async () => undefined),
  trackStripeEvent: vi.fn(async () => undefined),
  getMetricsForApi: vi.fn(() => ({})),
}));

const { handleSubscriptionRequest } = await import('../subscription-routes.js');

type Caller = { authUserId?: string; isAdmin?: boolean };
const post = (pathname: string, body: Record<string, unknown>, caller: Caller) =>
  handleSubscriptionRequest({ method: 'POST', pathname, query: {}, headers: {}, body, ...caller });

const userA: Caller = { authUserId: 'uid-A', isAdmin: false };
const admin: Caller = { authUserId: 'admin-1', isAdmin: true };

/** Each write, the service it drives, and the user argument that service received. */
const writes = [
  {
    name: 'POST /subscription/portal',
    path: '/subscription/portal',
    body: { returnUrl: 'https://ferni.ai/settings' },
    service: stripe.createPortalSession,
    userArg: (call: unknown[]) => call[0],
  },
  {
    name: 'POST /subscription/checkout',
    path: '/subscription/checkout',
    body: { tier: 'friend' },
    service: stripe.createCheckoutSession,
    userArg: (call: unknown[]) => (call[0] as { userId: string }).userId,
  },
  {
    name: 'POST /usage/conversation',
    path: '/usage/conversation',
    body: { durationMinutes: 9 },
    service: stripe.recordConversation,
    userArg: (call: unknown[]) => call[0],
  },
  {
    name: 'POST /subscription/trial/start',
    path: '/subscription/trial/start',
    body: {},
    service: trial.startTrial,
    userArg: (call: unknown[]) => call[0],
  },
  {
    name: 'POST /subscription/trial/record-time',
    path: '/subscription/trial/record-time',
    body: { sessionTimeMs: 1000 },
    service: trial.recordTrialTime,
    userArg: (call: unknown[]) => call[0],
  },
];

describe.each(writes)('$name', ({ path, body, service, userArg }) => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses user A acting on user B, and never touches B', async () => {
    const response = await post(path, { ...body, userId: 'uid-B' }, userA);

    expect(response.status).toBe(403);
    expect(service).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated request that names a user', async () => {
    const response = await post(path, { ...body, userId: 'uid-B' }, {});

    expect(response.status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });

  it('acts on the signed-in caller when the body names no one', async () => {
    const response = await post(path, body, userA);

    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledTimes(1);
    expect(userArg(service.mock.calls[0] as unknown[])).toBe('uid-A');
  });

  it('still accepts the caller naming themselves', async () => {
    const response = await post(path, { ...body, userId: 'uid-A' }, userA);

    expect(response.status).toBe(200);
    expect(userArg(service.mock.calls[0] as unknown[])).toBe('uid-A');
  });

  it('lets an admin act for the user they name', async () => {
    const response = await post(path, { ...body, userId: 'uid-B' }, admin);

    expect(response.status).toBe(200);
    expect(userArg(service.mock.calls[0] as unknown[])).toBe('uid-B');
  });
});
