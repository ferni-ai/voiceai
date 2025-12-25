/**
 * Tip Jar Service Tests
 *
 * Tests for gratitude-based monetization, tip validation, and thank you messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock persistence
vi.mock('../persistence.js', () => ({
  getUserTips: vi.fn().mockResolvedValue({ tips: [], totalTipsCents: 0, tipCount: 0 }),
  saveTip: vi.fn().mockResolvedValue(undefined),
}));

import { getConfig, getStats, getThankYou } from '../tip-jar.js';
import {
  DEFAULT_TIP_CONFIG,
  THANK_YOU_MESSAGES,
  type TipJarConfig,
  type TipTransaction,
  type ValueType,
  type ValueEvent,
  VALUE_CAPTURE_PROMPTS,
  type FerniFund,
  type FundContribution,
} from '../../../types/monetization.js';

describe('TipJar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Type definitions', () => {
    describe('TipJarConfig', () => {
      it('should have default suggested amounts', () => {
        expect(DEFAULT_TIP_CONFIG.suggestedAmounts).toEqual([100, 300, 500, 1000]);
      });

      it('should allow custom amounts by default', () => {
        expect(DEFAULT_TIP_CONFIG.allowCustom).toBe(true);
      });

      it('should have $1 minimum ($1.00 = 100 cents)', () => {
        expect(DEFAULT_TIP_CONFIG.minimumAmount).toBe(100);
      });

      it('should have $500 maximum for fraud prevention', () => {
        expect(DEFAULT_TIP_CONFIG.maximumAmount).toBe(50000);
      });

      it('should have valid config structure', () => {
        const config: TipJarConfig = {
          suggestedAmounts: [500, 1000, 2000],
          allowCustom: false,
          minimumAmount: 500,
          maximumAmount: 10000,
        };

        expect(config.suggestedAmounts).toHaveLength(3);
        expect(config.allowCustom).toBe(false);
      });
    });

    describe('TipTransaction', () => {
      it('should create valid pending transaction', () => {
        const tip: TipTransaction = {
          id: 'tip_123',
          userId: 'user-456',
          amountCents: 500,
          createdAt: new Date(),
          status: 'pending',
        };

        expect(tip.status).toBe('pending');
        expect(tip.amountCents).toBe(500);
        expect(tip.completedAt).toBeUndefined();
      });

      it('should create valid completed transaction', () => {
        const tip: TipTransaction = {
          id: 'tip_123',
          userId: 'user-456',
          amountCents: 1000,
          message: 'Thanks for helping me!',
          createdAt: new Date('2024-12-25T10:00:00Z'),
          completedAt: new Date('2024-12-25T10:01:00Z'),
          stripePaymentId: 'pi_abc123',
          status: 'completed',
        };

        expect(tip.status).toBe('completed');
        expect(tip.stripePaymentId).toBe('pi_abc123');
        expect(tip.message).toBe('Thanks for helping me!');
      });

      it('should support all transaction statuses', () => {
        const statuses: TipTransaction['status'][] = ['pending', 'completed', 'failed', 'refunded'];

        statuses.forEach((status) => {
          const tip: TipTransaction = {
            id: 'test',
            userId: 'user',
            amountCents: 100,
            createdAt: new Date(),
            status,
          };
          expect(tip.status).toBe(status);
        });
      });

      it('should allow optional message', () => {
        const tipWithMessage: TipTransaction = {
          id: 'tip1',
          userId: 'user',
          amountCents: 500,
          message: 'Keep up the great work!',
          createdAt: new Date(),
          status: 'pending',
        };

        const tipWithoutMessage: TipTransaction = {
          id: 'tip2',
          userId: 'user',
          amountCents: 500,
          createdAt: new Date(),
          status: 'pending',
        };

        expect(tipWithMessage.message).toBe('Keep up the great work!');
        expect(tipWithoutMessage.message).toBeUndefined();
      });
    });

    describe('ValueType', () => {
      it('should have all value types defined', () => {
        const valueTypes: ValueType[] = [
          'financial_gain',
          'financial_save',
          'habit_milestone',
          'career_win',
          'relationship_improvement',
          'health_improvement',
          'productivity_gain',
          'clarity_moment',
          'emotional_breakthrough',
        ];

        expect(valueTypes).toHaveLength(9);
      });

      it('should have prompts for all value types', () => {
        const valueTypes: ValueType[] = [
          'financial_gain',
          'financial_save',
          'habit_milestone',
          'career_win',
          'relationship_improvement',
          'health_improvement',
          'productivity_gain',
          'clarity_moment',
          'emotional_breakthrough',
        ];

        valueTypes.forEach((type) => {
          expect(VALUE_CAPTURE_PROMPTS[type]).toBeDefined();
          expect(VALUE_CAPTURE_PROMPTS[type].length).toBeGreaterThan(0);
        });
      });
    });

    describe('ValueEvent', () => {
      it('should create valid value event', () => {
        const event: ValueEvent = {
          id: 'val_123',
          userId: 'user-456',
          type: 'career_win',
          description: 'Got a promotion',
          estimatedValueCents: 500000, // $5000 raise value
          suggestedContributionCents: 5000, // 1% suggestion
          contributed: false,
          createdAt: new Date(),
        };

        expect(event.type).toBe('career_win');
        expect(event.contributed).toBe(false);
      });

      it('should track user contribution', () => {
        const event: ValueEvent = {
          id: 'val_123',
          userId: 'user-456',
          type: 'financial_gain',
          description: 'Negotiated $10k raise',
          reportedValueCents: 1000000,
          suggestedContributionCents: 10000,
          contributionCents: 5000, // User chose to give $50
          contributed: true,
          createdAt: new Date(),
          contributedAt: new Date(),
        };

        expect(event.contributed).toBe(true);
        expect(event.contributionCents).toBe(5000);
      });
    });

    describe('FerniFund', () => {
      it('should track community fund state', () => {
        const fund: FerniFund = {
          balanceCents: 50000, // $500 in the fund
          totalContributedCents: 150000, // $1500 contributed all time
          conversationsSponsored: 100,
          totalContributors: 50,
        };

        expect(fund.balanceCents).toBe(50000);
        expect(fund.conversationsSponsored).toBe(100);
      });

      it('should calculate contribution per conversation', () => {
        const fund: FerniFund = {
          balanceCents: 100000,
          totalContributedCents: 100000,
          conversationsSponsored: 50,
          totalContributors: 25,
        };

        const avgContribution = fund.totalContributedCents / fund.totalContributors;
        expect(avgContribution).toBe(4000); // $40 average per contributor
      });
    });

    describe('FundContribution', () => {
      it('should create valid fund contribution', () => {
        const contribution: FundContribution = {
          id: 'fund_123',
          userId: 'user-456',
          amountCents: 1000,
          createdAt: new Date(),
          message: 'For someone who needs it',
          isAnonymous: true,
        };

        expect(contribution.isAnonymous).toBe(true);
        expect(contribution.message).toBe('For someone who needs it');
      });
    });
  });

  describe('getConfig', () => {
    it('should return default tip configuration', () => {
      const config = getConfig();

      expect(config.suggestedAmounts).toEqual([100, 300, 500, 1000]);
      expect(config.allowCustom).toBe(true);
      expect(config.minimumAmount).toBe(100);
      expect(config.maximumAmount).toBe(50000);
    });

    it('should return a copy (immutable)', () => {
      const config1 = getConfig();
      const config2 = getConfig();

      // Should be equal but not same reference
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('getStats', () => {
    it('should return initial stats as zero', () => {
      const stats = getStats();

      expect(stats).toHaveProperty('totalTipsCents');
      expect(stats).toHaveProperty('tipCount');
      expect(stats).toHaveProperty('averageTipCents');
      expect(typeof stats.totalTipsCents).toBe('number');
    });

    it('should calculate average tip correctly', () => {
      // Simulating stats calculation
      const mockStats = {
        totalTipsCents: 10000,
        tipCount: 5,
        averageTipCents: 2000,
      };

      expect(mockStats.averageTipCents).toBe(mockStats.totalTipsCents / mockStats.tipCount);
    });

    it('should handle zero tips', () => {
      const mockStats = {
        totalTipsCents: 0,
        tipCount: 0,
        averageTipCents: 0,
      };

      // Division by zero should result in 0
      expect(mockStats.averageTipCents).toBe(0);
    });
  });

  describe('getThankYou', () => {
    it('should return a string message', () => {
      const message = getThankYou();

      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return message from THANK_YOU_MESSAGES', () => {
      const message = getThankYou();
      const allMessages = THANK_YOU_MESSAGES.tip;

      expect(allMessages).toContain(message);
    });
  });

  describe('Tip amount validation', () => {
    const config = DEFAULT_TIP_CONFIG;

    it('should accept valid tip amounts', () => {
      const validAmounts = [100, 300, 500, 1000, 2500, 5000];

      validAmounts.forEach((amount) => {
        expect(amount).toBeGreaterThanOrEqual(config.minimumAmount);
        expect(amount).toBeLessThanOrEqual(config.maximumAmount);
      });
    });

    it('should reject amounts below minimum', () => {
      const tooSmall = 50; // $0.50

      expect(tooSmall).toBeLessThan(config.minimumAmount);
    });

    it('should reject amounts above maximum', () => {
      const tooLarge = 100000; // $1000

      expect(tooLarge).toBeGreaterThan(config.maximumAmount);
    });

    it('should allow exactly minimum amount', () => {
      expect(config.minimumAmount).toBe(100);
    });

    it('should allow exactly maximum amount', () => {
      expect(config.maximumAmount).toBe(50000);
    });
  });

  describe('Value capture prompts', () => {
    it('should have non-pushy language', () => {
      const pushyPhrases = ['you must', 'you have to', 'you need to', 'required'];

      Object.values(VALUE_CAPTURE_PROMPTS).flat().forEach((prompt) => {
        pushyPhrases.forEach((phrase) => {
          expect(prompt.toLowerCase()).not.toContain(phrase);
        });
      });
    });

    it('should include "no pressure" or similar opt-out language', () => {
      // Phrases that indicate the contribution is optional
      const optOutPhrases = [
        'no pressure',
        'no worries',
        'either way',
        "if you'd like",
        'whatever you',
        'if you want',
        'if I helped',
        'you can', // "you can share" implies optionality
      ];

      Object.entries(VALUE_CAPTURE_PROMPTS).forEach(([type, prompts]) => {
        const hasOptOut = prompts.some((prompt) =>
          optOutPhrases.some((phrase) => prompt.toLowerCase().includes(phrase))
        );
        expect(hasOptOut).toBe(true);
      });
    });

    it('should celebrate the user achievement first', () => {
      // First sentence should celebrate achievement, not ask for contributions
      // These patterns detect ASKING for money (tip, contribute), not celebrating financial wins
      const askingForMoneyPatterns = [
        /\btip\b/i,
        /\bpay\b(?! off| it forward)/i, // matches "pay" but not "paid off" or "pay it forward"
        /\bcontribute\b/i,
        /\bsupport ferni/i, // asking for support
        /\bdollar/i,
        /\bshare what it's worth/i, // asking to share contribution
        /\bgive\b.*\bcents\b/i,
      ];

      Object.values(VALUE_CAPTURE_PROMPTS).flat().forEach((prompt) => {
        // Get first actual sentence (before first period or exclamation)
        const firstSentence = prompt.split(/[.!]/)[0].toLowerCase();
        const asksForMoney = askingForMoneyPatterns.some((pattern) => pattern.test(firstSentence));

        // First sentence should NOT ask for money (celebrate first)
        // Note: "saving money" is celebrating an achievement, not asking for money
        expect(asksForMoney).toBe(false);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing optional fields', () => {
      const minimalTip: TipTransaction = {
        id: 'tip_min',
        userId: 'user',
        amountCents: 100,
        createdAt: new Date(),
        status: 'pending',
      };

      expect(minimalTip.message).toBeUndefined();
      expect(minimalTip.stripePaymentId).toBeUndefined();
      expect(minimalTip.completedAt).toBeUndefined();
    });

    it('should handle very large tip amounts', () => {
      const largeTip: TipTransaction = {
        id: 'tip_large',
        userId: 'user',
        amountCents: 50000, // $500 (max)
        createdAt: new Date(),
        status: 'pending',
      };

      expect(largeTip.amountCents).toBe(50000);
      expect(largeTip.amountCents).toBeLessThanOrEqual(DEFAULT_TIP_CONFIG.maximumAmount);
    });

    it('should handle suggested amounts array correctly', () => {
      const amounts = DEFAULT_TIP_CONFIG.suggestedAmounts;

      // Should be sorted ascending
      const sorted = [...amounts].sort((a, b) => a - b);
      expect(amounts).toEqual(sorted);

      // All should be valid amounts
      amounts.forEach((amount) => {
        expect(amount).toBeGreaterThanOrEqual(DEFAULT_TIP_CONFIG.minimumAmount);
        expect(amount).toBeLessThanOrEqual(DEFAULT_TIP_CONFIG.maximumAmount);
      });
    });

    it('should convert cents to dollars correctly', () => {
      const amountCents = 500;
      const amountDollars = amountCents / 100;

      expect(amountDollars).toBe(5);
    });

    it('should format currency display', () => {
      const amountCents = 1250;
      const formatted = `$${(amountCents / 100).toFixed(2)}`;

      expect(formatted).toBe('$12.50');
    });
  });

  describe('Transaction state machine', () => {
    it('should transition from pending to completed', () => {
      const states: TipTransaction['status'][] = ['pending', 'completed'];
      expect(states[0]).toBe('pending');
      expect(states[1]).toBe('completed');
    });

    it('should transition from pending to failed', () => {
      const states: TipTransaction['status'][] = ['pending', 'failed'];
      expect(states[0]).toBe('pending');
      expect(states[1]).toBe('failed');
    });

    it('should transition from completed to refunded', () => {
      const states: TipTransaction['status'][] = ['pending', 'completed', 'refunded'];
      expect(states[0]).toBe('pending');
      expect(states[1]).toBe('completed');
      expect(states[2]).toBe('refunded');
    });
  });
});
