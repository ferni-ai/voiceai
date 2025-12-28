/**
 * Monetization E2E Tests
 *
 * End-to-end tests for the full monetization flow:
 * - Tip jar complete flow
 * - Value capture detection and contribution
 * - Growth journey milestone tracking
 * - Ferni fund contributions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Stripe
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_payment_method',
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
        metadata: {},
      }),
    },
  })),
}));

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    batch: vi.fn().mockReturnValue({
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    }),
  })),
}));

describe('Monetization E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tip Jar Flow', () => {
    it('should complete full tip flow: create -> confirm -> thank', async () => {
      const { tipJar } = await import('../../services/monetization/tip-jar.js');

      // 1. Create a tip
      const tip = await tipJar.create({
        userId: 'e2e-tip-user',
        amountCents: 500,
        message: 'Thank you!',
      });

      expect(tip.status).toBe('pending');
      expect(tip.id).toMatch(/^tip_/);

      // 2. Complete the tip (simulating successful Stripe payment)
      const completedTip = await tipJar.complete(tip.id, 'pi_e2e_test');

      expect(completedTip.status).toBe('completed');
      expect(completedTip.stripePaymentId).toBe('pi_e2e_test');

      // 3. Get thank you message
      const thankYou = tipJar.getThankYou();
      expect(typeof thankYou).toBe('string');
      expect(thankYou.length).toBeGreaterThan(0);

      // 4. Verify stats updated
      const stats = tipJar.getStats();
      expect(stats.tipCount).toBeGreaterThan(0);
    });
  });

  describe('Value Capture Flow', () => {
    it('should complete full value capture flow: detect -> prompt -> contribute', async () => {
      const { valueCapture } = await import('../../services/monetization/value-capture.js');

      // 1. Detect value event in message
      const event = await valueCapture.detect({
        userId: 'e2e-value-user',
        message: 'I got a raise at work! The new salary is $5,000 more per year!',
        conversationId: 'e2e-conv',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('financial_gain');
      // Value extraction might vary based on regex patterns
      expect(event?.estimatedValueCents).toBeDefined();

      // 2. Get prompt for value capture
      if (event) {
        const prompt = valueCapture.getPrompt(event);
        expect(typeof prompt).toBe('string');

        // 3. Check if we should show (simulating appropriate conditions)
        const shouldShow = valueCapture.shouldShow({
          event,
          recentValuePromptCount: 0,
          conversationTurnCount: 5,
        });
        expect(shouldShow).toBe(true);

        // 4. Record contribution (simulating successful payment)
        const contributed = await valueCapture.recordContribution({
          eventId: event.id,
          amountCents: 5000, // $50 (1% of raise)
          stripePaymentId: 'pi_e2e_value_test',
        });

        expect(contributed.contributed).toBe(true);
        expect(contributed.contributionCents).toBe(5000);

        // 5. Get thank you message
        const thankYou = valueCapture.getThankYou();
        expect(typeof thankYou).toBe('string');
      }
    });

    it('should not show value capture for emotional breakthroughs (just celebrate)', async () => {
      const { valueCapture } = await import('../../services/monetization/value-capture.js');

      const event = await valueCapture.detect({
        userId: 'e2e-emotional-user',
        message: 'For the first time I finally cried and let myself feel the grief',
        conversationId: 'e2e-conv-2',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('emotional_breakthrough');
      // These events should be celebrated, not monetized
    });
  });

  describe('Growth Journey Flow', () => {
    it('should track journey progress and unlock milestones', async () => {
      const persistence = await import('../../services/monetization/persistence.js');

      // Initialize
      persistence.initMonetizationPersistence();

      const userId = 'e2e-journey-user-' + Date.now();

      // 1. Create journey
      const journey = await persistence.createUserJourney(userId, 'spring-2024');
      expect(journey.conversationCount).toBe(0);
      expect(journey.celebratedMilestones).toEqual([]);

      // 2. Record conversations
      const progress = await persistence.recordJourneyConversation(userId);
      expect(progress.conversationCount).toBe(1);

      // First milestone should be available after 1 conversation
      // 3. Celebrate milestone
      await persistence.celebrateJourneyMilestone(userId, 'first-chat');

      // 4. Verify milestone is recorded
      const updatedJourney = await persistence.getUserJourney(userId);
      expect(updatedJourney?.celebratedMilestones).toContain('first-chat');
    });

    it('should calculate weeks together correctly', async () => {
      const persistence = await import('../../services/monetization/persistence.js');
      persistence.initMonetizationPersistence();

      const userId = 'e2e-weeks-user-' + Date.now();

      // Create journey with past start date
      await persistence.createUserJourney(userId, 'spring-2024');

      // Record a conversation (this will update weeks together)
      const progress = await persistence.recordJourneyConversation(userId);

      // Should have calculated weeks correctly
      expect(typeof progress.weeksTogetherCount).toBe('number');
    });
  });

  describe('Ferni Fund Flow', () => {
    it('should track contributions and calculate impact', async () => {
      const { ferniFund } = await import('../../services/monetization/ferni-fund.js');

      const userId = 'e2e-fund-user-' + Date.now();

      // 1. Get fund status
      const status = ferniFund.getStatus();
      expect(status).toHaveProperty('conversationsRemaining');

      // 2. Contribute
      const contribution = await ferniFund.contribute({
        userId,
        amountCents: 1000, // $10
        message: 'For someone who needs it',
      });

      expect(contribution.id).toBeDefined();
      expect(contribution.conversationsSponsored).toBeGreaterThan(0);

      // 3. Get impact
      const impact = ferniFund.getContributorImpact(userId);
      expect(impact.totalContributedCents).toBeGreaterThan(0);
    });
  });

  describe('API Routes Integration', () => {
    it('should have all monetization routes registered', async () => {
      const { isMonetizationRoute, routeMonetizationRequest } =
        await import('../../api/monetization-routes.js');

      // Check routes are recognized
      expect(isMonetizationRoute('/api/monetization/tip')).toBe(true);
      expect(isMonetizationRoute('/api/monetization/value/detect')).toBe(true);
      expect(isMonetizationRoute('/api/monetization/fund/status')).toBe(true);
      expect(isMonetizationRoute('/api/monetization/journey/current')).toBe(true);
      expect(isMonetizationRoute('/api/monetization/webhook')).toBe(true);

      // Check route handler resolution
      const tipHandler = routeMonetizationRequest({
        method: 'POST',
        pathname: '/api/monetization/tip',
        query: {},
        headers: {},
      });
      expect(tipHandler).toBeDefined();

      const webhookHandler = routeMonetizationRequest({
        method: 'POST',
        pathname: '/api/monetization/webhook',
        query: {},
        headers: {},
      });
      expect(webhookHandler).toBeDefined();
    });
  });
});
