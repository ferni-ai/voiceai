/**
 * Subscription Routes Tests
 *
 * Tests for subscription API endpoints:
 * - GET /api/subscription/status
 * - GET /api/subscription/can-start
 * - GET /api/subscription/config
 * - POST /api/subscription/checkout
 * - POST /api/subscription/portal
 * - POST /api/usage/conversation
 * - POST /api/subscription/webhook
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleSubscriptionRequest,
  isSubscriptionRoute,
  routeSubscriptionRequest,
} from '../api/subscription-routes.js';

// Mock the stripe-subscription service
vi.mock('../services/stripe-subscription.js', () => ({
  isStripeConfigured: vi.fn(() => true),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  getSubscriptionInfo: vi.fn(),
  canStartConversation: vi.fn(),
  recordConversation: vi.fn(),
  verifyWebhook: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));

// Import mocked functions for test manipulation
import {
  canStartConversation,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionInfo,
  handleWebhookEvent,
  isStripeConfigured,
  recordConversation,
  verifyWebhook,
} from '../services/stripe-subscription.js';

const mockedIsStripeConfigured = vi.mocked(isStripeConfigured);
const mockedGetSubscriptionInfo = vi.mocked(getSubscriptionInfo);
const mockedCanStartConversation = vi.mocked(canStartConversation);
const mockedCreateCheckoutSession = vi.mocked(createCheckoutSession);
const mockedCreatePortalSession = vi.mocked(createPortalSession);
const mockedRecordConversation = vi.mocked(recordConversation);
const mockedVerifyWebhook = vi.mocked(verifyWebhook);
const mockedHandleWebhookEvent = vi.mocked(handleWebhookEvent);

describe('Subscription Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsStripeConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // ROUTING HELPERS
  // ============================================================================

  describe('isSubscriptionRoute', () => {
    it('should return true for subscription routes', () => {
      expect(isSubscriptionRoute('/api/subscription/status')).toBe(true);
      expect(isSubscriptionRoute('/api/subscription/checkout')).toBe(true);
      expect(isSubscriptionRoute('/api/subscription/config')).toBe(true);
    });

    it('should return false for non-subscription routes', () => {
      expect(isSubscriptionRoute('/api/user/profile')).toBe(false);
      expect(isSubscriptionRoute('/api/conversations')).toBe(false);
      expect(isSubscriptionRoute('/subscription')).toBe(false);
    });
  });

  describe('routeSubscriptionRequest', () => {
    it('should return handler for valid GET routes', () => {
      expect(
        routeSubscriptionRequest({
          method: 'GET',
          pathname: '/api/subscription/status',
          query: {},
          headers: {},
        })
      ).not.toBeNull();
    });

    it('should return handler for valid POST routes', () => {
      expect(
        routeSubscriptionRequest({
          method: 'POST',
          pathname: '/api/subscription/checkout',
          query: {},
          headers: {},
        })
      ).not.toBeNull();
    });

    it('should return null for invalid routes', () => {
      expect(
        routeSubscriptionRequest({
          method: 'GET',
          pathname: '/api/subscription/invalid',
          query: {},
          headers: {},
        })
      ).toBeNull();
    });

    it('should return null for wrong method', () => {
      expect(
        routeSubscriptionRequest({
          method: 'DELETE',
          pathname: '/api/subscription/status',
          query: {},
          headers: {},
        })
      ).toBeNull();
    });
  });

  // ============================================================================
  // GET /api/subscription/status
  // ============================================================================

  describe('GET /api/subscription/status', () => {
    it('should return 400 if userId is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/status',
        query: {},
        headers: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId is required' });
    });

    it('should return subscription info for valid userId from query', async () => {
      const mockInfo = {
        tier: 'friend',
        isActive: true,
        conversationsRemaining: null,
      };
      mockedGetSubscriptionInfo.mockResolvedValue(mockInfo);

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/status',
        query: { userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockInfo);
      expect(mockedGetSubscriptionInfo).toHaveBeenCalledWith('user-123');
    });

    it('should return subscription info for userId from header', async () => {
      const mockInfo = { tier: 'free', isActive: true };
      mockedGetSubscriptionInfo.mockResolvedValue(mockInfo);

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/status',
        query: {},
        headers: { 'x-user-id': 'user-456' },
      });

      expect(response.status).toBe(200);
      expect(mockedGetSubscriptionInfo).toHaveBeenCalledWith('user-456');
    });

    it('should return 500 on service error', async () => {
      mockedGetSubscriptionInfo.mockRejectedValue(new Error('Database error'));

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/status',
        query: { userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get subscription status' });
    });
  });

  // ============================================================================
  // GET /api/subscription/can-start
  // ============================================================================

  describe('GET /api/subscription/can-start', () => {
    it('should return 400 if userId is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/can-start',
        query: {},
        headers: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId is required' });
    });

    it('should return can-start result for valid user', async () => {
      const mockResult = { canStart: true, reason: null };
      mockedCanStartConversation.mockResolvedValue(mockResult);

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/can-start',
        query: { userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
    });

    it('should return 500 on service error', async () => {
      mockedCanStartConversation.mockRejectedValue(new Error('Service error'));

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/can-start',
        query: { userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to check eligibility' });
    });
  });

  // ============================================================================
  // GET /api/subscription/config
  // ============================================================================

  describe('GET /api/subscription/config', () => {
    it('should return tier configuration', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/config',
        query: {},
        headers: {},
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled', true);
      expect(response.body).toHaveProperty('tiers');
      expect((response.body as { tiers: unknown[] }).tiers).toHaveLength(3);
    });

    it('should indicate when Stripe is not configured', async () => {
      mockedIsStripeConfigured.mockReturnValue(false);

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/config',
        query: {},
        headers: {},
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled', false);
    });

    it('should include all tier details', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/config',
        query: {},
        headers: {},
      });

      const body = response.body as { tiers: Array<{ id: string }> };
      const tierIds = body.tiers.map((t) => t.id);
      expect(tierIds).toContain('free');
      expect(tierIds).toContain('friend');
      expect(tierIds).toContain('partner');
    });
  });

  // ============================================================================
  // POST /api/subscription/checkout
  // ============================================================================

  describe('POST /api/subscription/checkout', () => {
    it('should return 503 when Stripe is not configured', async () => {
      mockedIsStripeConfigured.mockReturnValue(false);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: { userId: 'user-123', tier: 'friend' },
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Stripe is not configured' });
    });

    it('should return 400 if userId is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: { tier: 'friend' },
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId and tier are required' });
    });

    it('should return 400 if tier is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: { userId: 'user-123' },
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId and tier are required' });
    });

    it('should return 400 for invalid tier', async () => {
      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: { userId: 'user-123', tier: 'invalid' },
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'tier must be "friend" or "partner"' });
    });

    it('should create checkout session for valid request', async () => {
      const mockSession = { url: 'https://checkout.stripe.com/session-123' };
      mockedCreateCheckoutSession.mockResolvedValue(mockSession);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: {
          userId: 'user-123',
          tier: 'friend',
          email: 'test@example.com',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSession);
      expect(mockedCreateCheckoutSession).toHaveBeenCalledWith({
        userId: 'user-123',
        tier: 'friend',
        successUrl: 'https://ferni.ai/subscription/success',
        cancelUrl: 'https://ferni.ai/subscription/cancel',
        email: 'test@example.com',
        name: undefined,
      });
    });

    it('should use custom success/cancel URLs if provided', async () => {
      mockedCreateCheckoutSession.mockResolvedValue({ url: 'https://stripe.com' });

      await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: {
          userId: 'user-123',
          tier: 'partner',
          successUrl: 'https://custom.com/success',
          cancelUrl: 'https://custom.com/cancel',
        },
      });

      expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: 'https://custom.com/success',
          cancelUrl: 'https://custom.com/cancel',
        })
      );
    });

    it('should handle success URLs with existing query params', async () => {
      mockedCreateCheckoutSession.mockResolvedValue({ url: 'https://stripe.com' });

      await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: {
          userId: 'user-123',
          tier: 'friend',
          successUrl: 'https://app.ferni.ai?upgrade=success&tier=friend',
          cancelUrl: 'https://app.ferni.ai?upgrade=cancel',
        },
      });

      // Verify the URL with query params is passed correctly
      expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: 'https://app.ferni.ai?upgrade=success&tier=friend',
          cancelUrl: 'https://app.ferni.ai?upgrade=cancel',
        })
      );
    });

    it('should return 500 on Stripe error', async () => {
      mockedCreateCheckoutSession.mockRejectedValue(new Error('Stripe API error'));

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/checkout',
        query: {},
        headers: {},
        body: { userId: 'user-123', tier: 'friend' },
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create checkout session' });
    });
  });

  // ============================================================================
  // POST /api/subscription/portal
  // ============================================================================

  describe('POST /api/subscription/portal', () => {
    it('should return 503 when Stripe is not configured', async () => {
      mockedIsStripeConfigured.mockReturnValue(false);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/portal',
        query: {},
        headers: {},
        body: { userId: 'user-123' },
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Stripe is not configured' });
    });

    it('should return 400 if userId is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/portal',
        query: {},
        headers: {},
        body: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId is required' });
    });

    it('should create portal session for valid request', async () => {
      const mockSession = { url: 'https://billing.stripe.com/portal-123' };
      mockedCreatePortalSession.mockResolvedValue(mockSession);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/portal',
        query: {},
        headers: {},
        body: { userId: 'user-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSession);
      expect(mockedCreatePortalSession).toHaveBeenCalledWith(
        'user-123',
        'https://ferni.ai/settings'
      );
    });

    it('should use custom return URL if provided', async () => {
      mockedCreatePortalSession.mockResolvedValue({ url: 'https://stripe.com' });

      await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/portal',
        query: {},
        headers: {},
        body: {
          userId: 'user-123',
          returnUrl: 'https://custom.com/return',
        },
      });

      expect(mockedCreatePortalSession).toHaveBeenCalledWith(
        'user-123',
        'https://custom.com/return'
      );
    });

    it('should return 500 on Stripe error', async () => {
      mockedCreatePortalSession.mockRejectedValue(new Error('Stripe error'));

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/portal',
        query: {},
        headers: {},
        body: { userId: 'user-123' },
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create portal session' });
    });
  });

  // ============================================================================
  // POST /api/usage/conversation
  // ============================================================================

  describe('POST /api/usage/conversation', () => {
    it('should return 400 if userId is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/usage/conversation',
        query: {},
        headers: {},
        body: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId is required' });
    });

    it('should record conversation with duration', async () => {
      const mockStatus = { conversationsUsed: 3, limit: 5 };
      mockedRecordConversation.mockResolvedValue(mockStatus);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/usage/conversation',
        query: {},
        headers: {},
        body: { userId: 'user-123', durationMinutes: 15 },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStatus);
      expect(mockedRecordConversation).toHaveBeenCalledWith('user-123', 15);
    });

    it('should default duration to 0 if not provided', async () => {
      mockedRecordConversation.mockResolvedValue({});

      await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/usage/conversation',
        query: {},
        headers: {},
        body: { userId: 'user-123' },
      });

      expect(mockedRecordConversation).toHaveBeenCalledWith('user-123', 0);
    });

    it('should return 500 on service error', async () => {
      mockedRecordConversation.mockRejectedValue(new Error('DB error'));

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/usage/conversation',
        query: {},
        headers: {},
        body: { userId: 'user-123' },
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to record conversation' });
    });
  });

  // ============================================================================
  // POST /api/subscription/webhook
  // ============================================================================

  describe('POST /api/subscription/webhook', () => {
    it('should return 503 when Stripe is not configured', async () => {
      mockedIsStripeConfigured.mockReturnValue(false);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/webhook',
        query: {},
        headers: { 'stripe-signature': 'sig_test' },
        body: '{}',
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Stripe is not configured' });
    });

    it('should return 400 if stripe-signature header is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/webhook',
        query: {},
        headers: {},
        body: '{}',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing stripe-signature header' });
    });

    it('should process valid webhook event', async () => {
      const mockEvent = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            metadata: { ferni_user_id: 'user-123', tier: 'plus' },
          },
        },
      };
      mockedVerifyWebhook.mockResolvedValue(mockEvent);
      mockedHandleWebhookEvent.mockResolvedValue(undefined);

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/webhook',
        query: {},
        headers: { 'stripe-signature': 'sig_valid' },
        body: JSON.stringify({ type: 'customer.subscription.created' }),
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(mockedVerifyWebhook).toHaveBeenCalled();
      expect(mockedHandleWebhookEvent).toHaveBeenCalledWith(mockEvent);
    });

    it('should return 400 on verification failure', async () => {
      mockedVerifyWebhook.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/webhook',
        query: {},
        headers: { 'stripe-signature': 'sig_invalid' },
        body: '{}',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Webhook verification failed' });
    });

    it('should return 400 on event handling failure', async () => {
      mockedVerifyWebhook.mockResolvedValue({
        type: 'test',
        data: { object: { id: 'sub_test', metadata: {} } },
      });
      mockedHandleWebhookEvent.mockRejectedValue(new Error('Handler error'));

      const response = await handleSubscriptionRequest({
        method: 'POST',
        pathname: '/api/subscription/webhook',
        query: {},
        headers: { 'stripe-signature': 'sig_test' },
        body: '{}',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Webhook verification failed' });
    });
  });

  // ============================================================================
  // GET /api/subscription/verify-session
  // ============================================================================

  describe('GET /api/subscription/verify-session', () => {
    it('should return 400 if session_id is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/verify-session',
        query: { userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'session_id is required' });
    });

    it('should return 400 if userId is missing', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/verify-session',
        query: { session_id: 'cs_test_123' },
        headers: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'userId is required' });
    });

    it('should return verified=true if user is on paid tier', async () => {
      mockedGetSubscriptionInfo.mockResolvedValue({
        tier: 'friend',
        status: 'active',
        usage: { conversationsRemaining: null, canStartConversation: true },
      } as Awaited<ReturnType<typeof getSubscriptionInfo>>);

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/verify-session',
        query: { session_id: 'cs_test_123', userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = response.body as { verified: boolean; tier: string };
      expect(body.verified).toBe(true);
      expect(body.tier).toBe('friend');
    });

    it('should return verified=false if user is still on free tier', async () => {
      mockedGetSubscriptionInfo.mockResolvedValue({
        tier: 'free',
        status: 'active',
        usage: { conversationsRemaining: 5, canStartConversation: true },
      } as Awaited<ReturnType<typeof getSubscriptionInfo>>);

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/verify-session',
        query: { session_id: 'cs_test_123', userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = response.body as { verified: boolean; tier: string };
      expect(body.verified).toBe(false);
      expect(body.tier).toBe('free');
    });

    it('should return 500 on service error', async () => {
      mockedGetSubscriptionInfo.mockRejectedValue(new Error('Database error'));

      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/verify-session',
        query: { session_id: 'cs_test_123', userId: 'user-123' },
        headers: {},
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to verify session' });
    });
  });

  // ============================================================================
  // 404 HANDLING
  // ============================================================================

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await handleSubscriptionRequest({
        method: 'GET',
        pathname: '/api/subscription/unknown',
        query: {},
        headers: {},
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });

    it('should return 404 for wrong method on valid route', async () => {
      const response = await handleSubscriptionRequest({
        method: 'DELETE',
        pathname: '/api/subscription/status',
        query: {},
        headers: {},
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });
  });
});
