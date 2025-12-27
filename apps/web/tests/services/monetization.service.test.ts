/**
 * Monetization Service Tests
 *
 * Tests for the value-aligned monetization features:
 * - Tip Jar
 * - Value Capture
 * - Ferni Fund
 * - Partner Recommendations
 * - Stripe Integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock document for Stripe loading
const mockScript = {
  src: '',
  onload: null as (() => void) | null,
  onerror: null as ((err: Error) => void) | null,
};
vi.spyOn(document, 'createElement').mockReturnValue(mockScript as unknown as HTMLElement);
vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
  // Simulate script load
  setTimeout(() => {
    if (mockScript.onload) mockScript.onload();
  }, 0);
  return mockScript as unknown as HTMLElement;
});

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_12345',
    },
  },
});

// Mock Stripe global
const mockStripe = {
  confirmPayment: vi.fn().mockResolvedValue({ error: null }),
};
vi.stubGlobal('Stripe', vi.fn(() => mockStripe));

// Setup fetch mock
beforeEach(() => {
  vi.clearAllMocks();

  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    const path = url.replace('/api/monetization', '');

    // Tip config
    if (path.startsWith('/tip/config')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            config: {
              suggestedAmounts: [300, 500, 1000],
              minimumAmount: 100,
              maximumAmount: 50000,
              allowCustom: true,
            },
            stripeEnabled: true,
          }),
      });
    }

    // Create tip
    if (path === '/tip' && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            tipId: 'tip_123',
            clientSecret: 'cs_test_secret',
            paymentIntentId: 'pi_123',
          }),
      });
    }

    // Complete tip
    if (path === '/tip/complete') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            thankYouMessage: 'Thank you for your support!',
          }),
      });
    }

    // Value detection
    if (path === '/value/detect') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            detected: true,
            event: {
              id: 'event_123',
              type: 'win',
              estimatedValueCents: 5000,
              suggestedContributionCents: 500,
            },
            prompt: 'Would you like to share your win?',
          }),
      });
    }

    // Value contribution
    if (path === '/value/contribute') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            clientSecret: 'cs_value_secret',
            paymentIntentId: 'pi_value_123',
          }),
      });
    }

    // Fund status
    if (path === '/fund/status') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            balanceCents: 50000,
            totalContributedCents: 150000,
            conversationsSponsored: 500,
            totalContributors: 25,
            conversationsRemaining: 100,
          }),
      });
    }

    // Fund contribution
    if (path === '/fund/contribute') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            clientSecret: 'cs_fund_secret',
            paymentIntentId: 'pi_fund_123',
            impact: {
              conversationsSponsored: 10,
              message: 'You just sponsored 10 conversations!',
            },
          }),
      });
    }

    // Fund impact
    if (path.startsWith('/fund/impact')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            totalContributedCents: 5000,
            conversationsSponsored: 10,
            contributionCount: 2,
          }),
      });
    }

    // User data
    if (path.startsWith('/user')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            totalTipsCents: 1500,
            tipCount: 3,
            totalValueContributionsCents: 500,
            valueEventCount: 1,
            totalFundContributionsCents: 1000,
            fundContributionCount: 1,
            totalContributionsCents: 3000,
          }),
      });
    }

    // Partner recommendation
    if (path === '/partners/recommend') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hasRecommendation: true,
            partner: {
              id: 'partner_123',
              name: 'Betterment',
              description: 'Automated investing',
              category: 'finance',
            },
            introduction: 'Based on what you shared, you might find this helpful.',
            disclosure: 'This is an affiliate recommendation.',
          }),
      });
    }

    // Partner click
    if (path === '/partners/click') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            referralId: 'ref_123',
            affiliateUrl: 'https://betterment.com?ref=ferni',
          }),
      });
    }

    // Partner feedback
    if (path === '/partners/feedback') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }

    // Default error
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
    });
  });
});

// Import after mocking
import {
  getTipConfig,
  createTip,
  completeTip,
  detectValue,
  contributeValue,
  getFundStatus,
  contributeFund,
  getContributorImpact,
  getUserMonetization,
  getPartnerRecommendation,
  recordPartnerClick,
  recordPartnerFeedback,
  loadStripe,
  processPayment,
  getTipPrompt,
  formatAmount,
} from '../../src/services/monetization.service.js';

describe('MonetizationService', () => {
  describe('Tip Jar', () => {
    describe('getTipConfig', () => {
      it('should fetch tip configuration', async () => {
        const result = await getTipConfig('user_123');

        expect(result.config.suggestedAmounts).toEqual([300, 500, 1000]);
        expect(result.config.minimumAmount).toBe(100);
        expect(result.stripeEnabled).toBe(true);
      });

      it('should work without userId', async () => {
        const result = await getTipConfig();

        expect(result.config).toBeDefined();
      });
    });

    describe('createTip', () => {
      it('should create a tip payment', async () => {
        const result = await createTip({
          userId: 'user_123',
          amountCents: 500,
          message: 'Thanks!',
        });

        expect(result.tipId).toBe('tip_123');
        expect(result.clientSecret).toBe('cs_test_secret');
        expect(result.paymentIntentId).toBe('pi_123');
      });

      it('should send correct request body', async () => {
        await createTip({
          userId: 'user_123',
          amountCents: 1000,
          message: 'Great conversation!',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/monetization/tip',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              userId: 'user_123',
              amountCents: 1000,
              message: 'Great conversation!',
            }),
          })
        );
      });
    });

    describe('completeTip', () => {
      it('should complete a tip payment', async () => {
        const result = await completeTip('pi_123');

        expect(result.success).toBe(true);
        expect(result.thankYouMessage).toBe('Thank you for your support!');
      });
    });
  });

  describe('Value Capture', () => {
    describe('detectValue', () => {
      it('should detect value events in messages', async () => {
        const result = await detectValue({
          userId: 'user_123',
          message: 'I just got the job!',
          conversationId: 'conv_123',
        });

        expect(result.detected).toBe(true);
        expect(result.event?.type).toBe('win');
        expect(result.prompt).toBeDefined();
      });
    });

    describe('contributeValue', () => {
      it('should create value contribution payment', async () => {
        const result = await contributeValue({
          userId: 'user_123',
          eventId: 'event_123',
          amountCents: 500,
        });

        expect(result.clientSecret).toBe('cs_value_secret');
        expect(result.paymentIntentId).toBe('pi_value_123');
      });
    });
  });

  describe('Ferni Fund', () => {
    describe('getFundStatus', () => {
      it('should get fund status', async () => {
        const status = await getFundStatus();

        expect(status.balanceCents).toBe(50000);
        expect(status.totalContributors).toBe(25);
        expect(status.conversationsSponsored).toBe(500);
      });
    });

    describe('contributeFund', () => {
      it('should contribute to fund', async () => {
        const result = await contributeFund({
          userId: 'user_123',
          amountCents: 1000,
          message: 'Happy to help!',
        });

        expect(result.clientSecret).toBe('cs_fund_secret');
        expect(result.impact.conversationsSponsored).toBe(10);
      });

      it('should handle recurring contributions', async () => {
        await contributeFund({
          userId: 'user_123',
          amountCents: 1000,
          isRecurring: true,
          recurringFrequency: 'monthly',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/monetization/fund/contribute',
          expect.objectContaining({
            body: expect.stringContaining('"isRecurring":true'),
          })
        );
      });
    });

    describe('getContributorImpact', () => {
      it('should get contributor impact', async () => {
        const impact = await getContributorImpact('user_123');

        expect(impact.totalContributedCents).toBe(5000);
        expect(impact.conversationsSponsored).toBe(10);
        expect(impact.contributionCount).toBe(2);
      });
    });
  });

  describe('User Data', () => {
    describe('getUserMonetization', () => {
      it('should get user monetization summary', async () => {
        const data = await getUserMonetization('user_123');

        expect(data.totalTipsCents).toBe(1500);
        expect(data.tipCount).toBe(3);
        expect(data.totalContributionsCents).toBe(3000);
      });
    });
  });

  describe('Partner Recommendations', () => {
    describe('getPartnerRecommendation', () => {
      it('should get contextual partner recommendation', async () => {
        const result = await getPartnerRecommendation({
          message: 'I need help investing',
          conversationContext: 'finance',
        });

        expect(result.hasRecommendation).toBe(true);
        expect(result.partner?.name).toBe('Betterment');
        expect(result.disclosure).toBeDefined();
      });
    });

    describe('recordPartnerClick', () => {
      it('should record partner click', async () => {
        const result = await recordPartnerClick({
          userId: 'user_123',
          partnerId: 'partner_123',
          conversationId: 'conv_123',
        });

        expect(result.referralId).toBe('ref_123');
        expect(result.affiliateUrl).toBe('https://betterment.com?ref=ferni');
      });
    });

    describe('recordPartnerFeedback', () => {
      it('should record partner feedback', async () => {
        await recordPartnerFeedback('partner_123', 'helpful');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/monetization/partners/feedback',
          expect.objectContaining({
            body: JSON.stringify({
              partnerId: 'partner_123',
              feedback: 'helpful',
            }),
          })
        );
      });
    });
  });

  describe('Stripe Integration', () => {
    describe('loadStripe', () => {
      it('should load Stripe.js', async () => {
        const stripe = await loadStripe();

        expect(document.createElement).toHaveBeenCalledWith('script');
      });

      it('should return cached Stripe instance', async () => {
        await loadStripe();
        await loadStripe();

        // Only one script should be created
        expect(document.createElement).toHaveBeenCalledTimes(1);
      });
    });

    describe('processPayment', () => {
      it('should process payment with Stripe', async () => {
        await loadStripe(); // Ensure Stripe is loaded

        const result = await processPayment({
          clientSecret: 'cs_test_secret',
          paymentElement: {},
        });

        expect(result.success).toBe(true);
      });

      it('should handle payment errors', async () => {
        await loadStripe();
        mockStripe.confirmPayment.mockResolvedValueOnce({
          error: { message: 'Card declined' },
        });

        const result = await processPayment({
          clientSecret: 'cs_test_secret',
          paymentElement: {},
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Card declined');
      });
    });
  });

  describe('Prompts & Messaging', () => {
    describe('getTipPrompt', () => {
      it('should return null if too few conversations since last tip', () => {
        const prompt = getTipPrompt({
          conversationCount: 25,
          lastTipOfferedConversation: 10,
          conversationWasMeaningful: true,
        });

        expect(prompt).toBeNull();
      });

      it('should return milestone prompt at 50 conversation intervals', () => {
        const prompt = getTipPrompt({
          conversationCount: 50,
          lastTipOfferedConversation: 0,
          conversationWasMeaningful: false,
        });

        expect(prompt).toContain('50 conversations');
      });

      it('should return milestone prompt at 100 conversations', () => {
        const prompt = getTipPrompt({
          conversationCount: 100,
          lastTipOfferedConversation: 50,
          conversationWasMeaningful: false,
        });

        expect(prompt).toContain('100 conversations');
      });
    });

    describe('formatAmount', () => {
      it('should format cents as currency', () => {
        expect(formatAmount(500)).toBe('$5.00');
        expect(formatAmount(1000)).toBe('$10.00');
        expect(formatAmount(999)).toBe('$9.99');
      });

      it('should handle zero', () => {
        expect(formatAmount(0)).toBe('$0.00');
      });

      it('should handle large amounts', () => {
        expect(formatAmount(100000)).toBe('$1,000.00');
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      await expect(getTipConfig()).rejects.toThrow('Internal server error');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getFundStatus()).rejects.toThrow('Network error');
    });
  });
});
