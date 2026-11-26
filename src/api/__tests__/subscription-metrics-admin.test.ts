/**
 * GET /api/subscription/metrics (MRR, subscriber count, churn, recent payment events)
 * answers only an admin. It answered anyone, signed in or not, on dev and prod. Real
 * route handler; only the metrics source and the stores are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const metrics = vi.hoisted(() => ({
  getMetricsForApi: vi.fn(async () => ({
    activeSubscribers: 3,
    mrr: 42,
    churnRate: 0,
    conversionRate: 0,
    recentEvents: [],
  })),
}));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => ({}) }));
vi.mock('../../services/stripe-subscription.js', () => ({
  isStripeConfigured: () => false,
  createPortalSession: vi.fn(),
  createCheckoutSession: vi.fn(),
  recordConversation: vi.fn(),
  getSubscriptionInfo: vi.fn(),
  canStartConversation: vi.fn(),
  verifyWebhook: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));
vi.mock('../../services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: vi.fn(async () => undefined),
  trackStripeEvent: vi.fn(async () => undefined),
  getMetricsForApi: metrics.getMetricsForApi,
}));

const { handleSubscriptionRequest } = await import('../subscription-routes.js');

const getMetrics = async (pathname: string, caller: { authUserId?: string; isAdmin?: boolean }) =>
  handleSubscriptionRequest({ method: 'GET', pathname, query: {}, headers: {}, ...caller });

beforeEach(() => vi.clearAllMocks());

describe('subscription metrics are admin-only', () => {
  it.each(['/api/subscription/metrics', '/subscription/metrics'])(
    '%s refuses a signed-out caller with 401',
    async (path) => {
      const res = await getMetrics(path, {});
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
      expect(metrics.getMetricsForApi).not.toHaveBeenCalled();
    }
  );

  it('refuses a signed-in caller who is not an admin with 403', async () => {
    const res = await getMetrics('/api/subscription/metrics', {
      authUserId: 'user-1',
      isAdmin: false,
    });
    expect(res.status).toBe(403);
    expect(metrics.getMetricsForApi).not.toHaveBeenCalled();
  });

  it('answers an admin with the metrics', async () => {
    const res = await getMetrics('/api/subscription/metrics', {
      authUserId: 'admin-1',
      isAdmin: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activeSubscribers: 3, mrr: 42 });
  });
});
