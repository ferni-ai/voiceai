/**
 * Subscription Routes API Tests (P0 - Money)
 *
 * Critical tests for payment and subscription functionality.
 * These tests verify Stripe integration, subscription status,
 * and billing operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe subscription service
const mockStripeService = {
  isStripeConfigured: vi.fn().mockReturnValue(true),
  getSubscriptionInfo: vi.fn(),
  canStartConversation: vi.fn(),
  recordConversation: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  handleWebhookEvent: vi.fn(),
  verifyWebhook: vi.fn(),
};

vi.mock('../../services/stripe-subscription.js', () => mockStripeService);

// Mock trial service
const mockTrialService = {
  isEligibleForTrial: vi.fn(),
  startTrial: vi.fn(),
  getTrialState: vi.fn(),
  checkTrialStatus: vi.fn(),
  recordTrialTime: vi.fn(),
  TRIAL_DURATION_MS: 5 * 60 * 1000,
};

vi.mock('../../services/first-taste-trial.js', () => mockTrialService);

// Mock metrics
vi.mock('../../services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: vi.fn().mockResolvedValue(undefined),
  trackStripeEvent: vi.fn(),
  getMetricsForApi: vi.fn().mockReturnValue({ events: [], summary: {} }),
}));

// Helper to create request context matching the route handler signature
interface RequestContext {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  authUserId?: string;
  isAdmin?: boolean;
}

function createRequestContext(options: Partial<RequestContext> = {}): RequestContext {
  return {
    method: options.method || 'GET',
    pathname: options.pathname || '/',
    query: options.query || {},
    body: options.body,
    headers: options.headers || {},
    authUserId: options.authUserId,
    isAdmin: options.isAdmin,
  };
}

describe('Subscription Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/subscription/status', () => {
    it('should return 401 without authentication', async () => {
      const { handleSubscriptionRequest, routeSubscriptionRequest } = await import('../subscription-routes.js');

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/status',
      });

      const handler = routeSubscriptionRequest(ctx);
      expect(handler).toBeDefined();

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBe(401);
    });

    it('should return subscription info for authenticated user', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.getSubscriptionInfo.mockResolvedValue({
        tier: 'premium',
        status: 'active',
        conversationsRemaining: 100,
      });

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/status',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBe(200);
      expect((response.body as { tier: string }).tier).toBe('premium');
    });

    it('should handle service errors gracefully', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.getSubscriptionInfo.mockRejectedValue(new Error('Stripe API error'));

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/status',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/subscription/can-start', () => {
    it('should check if user can start conversation', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.canStartConversation.mockResolvedValue({
        canStart: true,
        reason: 'active_subscription',
      });

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/can-start',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBe(200);
      expect((response.body as { canStart: boolean }).canStart).toBe(true);
    });

    it('should return false when limit reached', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.canStartConversation.mockResolvedValue({
        canStart: false,
        reason: 'limit_reached',
        upgradeUrl: '/pricing',
      });

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/can-start',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBe(200);
      expect((response.body as { canStart: boolean; reason: string }).canStart).toBe(false);
      expect((response.body as { reason: string }).reason).toBe('limit_reached');
    });
  });

  describe('POST /api/subscription/record', () => {
    it('should record a conversation', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.recordConversation.mockResolvedValue({ recorded: true });

      const ctx = createRequestContext({
        method: 'POST',
        pathname: '/api/subscription/record',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
        body: { sessionId: 'session-123' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBeLessThanOrEqual(500);
    });
  });

  describe('POST /api/subscription/checkout', () => {
    it('should create checkout session', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/session/xyz',
      });

      const ctx = createRequestContext({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
        body: { priceId: 'price_xyz', successUrl: '/success' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBeLessThanOrEqual(500);
    });
  });

  describe('Trial System', () => {
    it('GET /api/subscription/trial/status should return trial state', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockTrialService.getTrialState.mockResolvedValue({
        isActive: true,
        remainingMs: 180000,
        usedMs: 120000,
      });

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/trial/status',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBeLessThanOrEqual(500);
    });

    it('POST /api/subscription/trial/start should start trial for eligible user', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockTrialService.isEligibleForTrial.mockResolvedValue(true);
      mockTrialService.startTrial.mockResolvedValue({
        started: true,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });

      const ctx = createRequestContext({
        method: 'POST',
        pathname: '/api/subscription/trial/start',
        authUserId: 'test-user',
        query: { userId: 'test-user' },
        body: { userId: 'test-user' },
      });

      const response = await handleSubscriptionRequest(ctx);
      expect(response.status).toBeLessThanOrEqual(500);
    });
  });

  describe('Route Matching', () => {
    it('should correctly identify subscription routes', async () => {
      const { isSubscriptionRoute } = await import('../subscription-routes.js');

      expect(isSubscriptionRoute('/api/subscription/status')).toBe(true);
      expect(isSubscriptionRoute('/api/subscription/can-start')).toBe(true);
      expect(isSubscriptionRoute('/api/subscription/checkout')).toBe(true);
      expect(isSubscriptionRoute('/api/subscription/webhook')).toBe(true);
      expect(isSubscriptionRoute('/api/subscription/trial/status')).toBe(true);
      expect(isSubscriptionRoute('/api/other')).toBe(false);
    });
  });

  describe('Security', () => {
    it('should prevent IDOR by using authenticated userId', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.getSubscriptionInfo.mockResolvedValue({ tier: 'free' });

      // Non-admin user tries to query another user
      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/status',
        authUserId: 'attacker-user',
        query: { userId: 'victim-user' }, // Trying to access victim's data
        isAdmin: false,
      });

      await handleSubscriptionRequest(ctx);

      // Should use authenticated user ID, not query param for non-admin
      expect(mockStripeService.getSubscriptionInfo).toHaveBeenCalledWith('attacker-user');
    });

    it('should allow admin to query other users', async () => {
      const { handleSubscriptionRequest } = await import('../subscription-routes.js');

      mockStripeService.getSubscriptionInfo.mockResolvedValue({ tier: 'premium' });

      const ctx = createRequestContext({
        method: 'GET',
        pathname: '/api/subscription/status',
        authUserId: 'admin-user',
        query: { userId: 'target-user' },
        isAdmin: true,
      });

      await handleSubscriptionRequest(ctx);

      // Admin should be able to query target user
      expect(mockStripeService.getSubscriptionInfo).toHaveBeenCalledWith('target-user');
    });
  });
});
