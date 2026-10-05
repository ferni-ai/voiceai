/**
 * Subscription reads serve the verified caller, never a userId the query names.
 *
 * GET /subscription/status, /can-start, /trial and /verify-session fell back to
 * ?userId= when there was no verified caller, so an unauthenticated
 * `curl /subscription/status?userId=<victim>` returned the victim's tier and
 * usage (confirmed live 2026-10-04). These tests call the REAL route handler
 * with the context the UI server mount passes; only the billing and trial
 * services are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(() => true),
  createPortalSession: vi.fn(),
  createCheckoutSession: vi.fn(),
  recordConversation: vi.fn(),
  getSubscriptionInfo: vi.fn(async () => ({ tier: 'friend', status: 'active' })),
  canStartConversation: vi.fn(async () => ({ allowed: true })),
  verifyWebhook: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));
vi.mock('../../services/stripe-subscription.js', () => stripe);

const trial = vi.hoisted(() => ({
  isEligibleForTrial: vi.fn(async () => true),
  startTrial: vi.fn(),
  getTrialState: vi.fn(async () => ({ trialTimeUsedMs: 0 })),
  checkTrialStatus: vi.fn(async () => ({ inTrial: true })),
  recordTrialTime: vi.fn(),
  TRIAL_DURATION_MS: 420_000,
}));
vi.mock('../../services/first-taste-trial.js', () => trial);

vi.mock('../../services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: vi.fn(async () => undefined),
  trackStripeEvent: vi.fn(async () => undefined),
  getMetricsForApi: vi.fn(() => ({})),
}));

const { handleSubscriptionRequest } = await import('../subscription-routes.js');

interface Caller {
  authUserId?: string;
  isAdmin?: boolean;
}
const get = (pathname: string, query: Record<string, string>, caller: Caller) =>
  handleSubscriptionRequest({ method: 'GET', pathname, query, headers: {}, ...caller });

const userA: Caller = { authUserId: 'uid-A', isAdmin: false };
const admin: Caller = { authUserId: 'admin-1', isAdmin: true };

/** Each read, the service it drives, and any query it needs besides userId. */
const reads: {
  name: string;
  path: string;
  query: Record<string, string>;
  service: { mock: { calls: unknown[][] } };
}[] = [
  {
    name: 'GET /subscription/status',
    path: '/subscription/status',
    query: {},
    service: stripe.getSubscriptionInfo,
  },
  {
    name: 'GET /subscription/can-start',
    path: '/subscription/can-start',
    query: {},
    service: stripe.canStartConversation,
  },
  {
    name: 'GET /subscription/trial',
    path: '/subscription/trial',
    query: {},
    service: trial.checkTrialStatus,
  },
  {
    name: 'GET /subscription/verify-session',
    path: '/subscription/verify-session',
    query: { session_id: 'cs_test_123' },
    service: stripe.getSubscriptionInfo,
  },
];

describe.each(reads)('$name', ({ path, query, service }) => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses an unauthenticated request that names a user, and never reads them', async () => {
    const response = await get(path, { ...query, userId: 'uid-victim' }, {});

    expect(response.status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });

  it('serves user A when A names user B, never B', async () => {
    const response = await get(path, { ...query, userId: 'uid-B' }, userA);

    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalled();
    for (const call of service.mock.calls as unknown[][]) {
      expect(call[0]).toBe('uid-A');
    }
  });

  it('lets an admin read the user they name', async () => {
    const response = await get(path, { ...query, userId: 'uid-B' }, admin);

    expect(response.status).toBe(200);
    expect((service.mock.calls[0] as unknown[])[0]).toBe('uid-B');
  });
});
