/**
 * POST /api/subscription/upgrade (admin tier change) needs the admin key on
 * every server except a developer's machine.
 *
 * The check was skipped whenever NODE_ENV !== 'production'. Staging previews
 * run with NODE_ENV=staging, so there 'dev-mode' (or, with ADMIN_KEY unset, no
 * key at all) upgraded any user's tier. Real route handler; only the profile
 * store is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getProfile: vi.fn(async () => null),
  saveProfile: vi.fn(async () => undefined),
}));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => store }));
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
  getMetricsForApi: vi.fn(() => ({})),
}));

const { handleSubscriptionRequest } = await import('../subscription-routes.js');

const upgrade = (admin_key?: string) =>
  handleSubscriptionRequest({
    method: 'POST',
    pathname: '/api/subscription/upgrade',
    query: {},
    headers: {},
    body: { userId: 'victim', tier: 'partner', ...(admin_key ? { admin_key } : {}) },
  });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('admin upgrade on a staging server', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('ADMIN_KEY', 'the-real-admin-key');
  });

  it.each([
    ['no key', undefined],
    ['a wrong key', 'guess'],
    ["the development key 'dev-mode'", 'dev-mode'],
  ])('refuses %s with 401 and changes no tier', async (_label, key) => {
    const response = await upgrade(key);
    expect(response.status).toBe(401);
    expect(store.saveProfile).not.toHaveBeenCalled();
  });

  it('applies the upgrade with the configured admin key', async () => {
    const response = await upgrade('the-real-admin-key');
    expect(response.status).toBe(200);
    expect(store.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'victim',
        subscription: expect.objectContaining({ tier: 'partner' }),
      })
    );
  });

  it('refuses everything when ADMIN_KEY is not configured', async () => {
    vi.stubEnv('ADMIN_KEY', '');
    const response = await upgrade();
    expect(response.status).toBe(500);
    expect(store.saveProfile).not.toHaveBeenCalled();
  });
});

describe('admin upgrade on a developer machine', () => {
  it("accepts 'dev-mode' when NODE_ENV=development", async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_KEY', '');
    const response = await upgrade('dev-mode');
    expect(response.status).toBe(200);
    expect(store.saveProfile).toHaveBeenCalledTimes(1);
  });
});
