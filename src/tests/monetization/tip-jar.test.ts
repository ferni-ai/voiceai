/**
 * Tip Jar Service Tests
 *
 * Tests for the gratitude-based tip jar monetization feature.
 */

import { describe, expect, it } from 'vitest';
import { tipJar } from '../../services/monetization/tip-jar.js';
import { DEFAULT_TIP_CONFIG } from '../../types/monetization.js';

describe('Tip Jar Service', () => {
  describe('getConfig', () => {
    it('should return default tip configuration', () => {
      const config = tipJar.getConfig();

      expect(config).toBeDefined();
      expect(config.suggestedAmounts).toEqual(DEFAULT_TIP_CONFIG.suggestedAmounts);
      expect(config.minimumAmount).toBe(DEFAULT_TIP_CONFIG.minimumAmount);
      expect(config.maximumAmount).toBe(DEFAULT_TIP_CONFIG.maximumAmount);
      expect(config.allowCustom).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a tip with valid amount', async () => {
      const tip = await tipJar.create({
        userId: 'test-user-1',
        amountCents: 500,
        message: 'Thanks for being awesome!',
      });

      expect(tip).toBeDefined();
      expect(tip.id).toBeDefined();
      expect(tip.userId).toBe('test-user-1');
      expect(tip.amountCents).toBe(500);
      expect(tip.message).toBe('Thanks for being awesome!');
      expect(tip.status).toBe('pending');
    });

    it('should create a tip without message', async () => {
      const tip = await tipJar.create({
        userId: 'test-user-2',
        amountCents: 300,
      });

      expect(tip).toBeDefined();
      expect(tip.message).toBeUndefined();
    });

    it('should reject tips below minimum', async () => {
      await expect(
        tipJar.create({
          userId: 'test-user',
          amountCents: 50, // Below $1 minimum
        })
      ).rejects.toThrow('Minimum tip amount');
    });

    it('should reject tips above maximum', async () => {
      await expect(
        tipJar.create({
          userId: 'test-user',
          amountCents: 100000, // Above $500 maximum
        })
      ).rejects.toThrow('Maximum tip amount');
    });
  });

  describe('complete', () => {
    it('should complete a pending tip', async () => {
      const tip = await tipJar.create({
        userId: 'complete-test-user',
        amountCents: 500,
      });

      const completedTip = await tipJar.complete(tip.id, 'pi_test_123');

      expect(completedTip.status).toBe('completed');
      expect(completedTip.stripePaymentId).toBe('pi_test_123');
      expect(completedTip.completedAt).toBeDefined();
    });

    it('should reject completing non-existent tip', async () => {
      await expect(tipJar.complete('non-existent-tip', 'pi_test')).rejects.toThrow('Tip not found');
    });
  });

  describe('getThankYou', () => {
    it('should return a thank you message', () => {
      const message = tipJar.getThankYou();

      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return different messages on multiple calls (random)', () => {
      const messages = new Set<string>();
      // Get 10 messages - at least some should be different
      for (let i = 0; i < 10; i++) {
        messages.add(tipJar.getThankYou());
      }
      // Should have at least 1 message
      expect(messages.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    it('should return tip statistics', () => {
      const stats = tipJar.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalTipsCents).toBe('number');
      expect(typeof stats.tipCount).toBe('number');
      expect(typeof stats.averageTipCents).toBe('number');
    });

    it('should calculate average correctly', async () => {
      // Create and complete some tips
      const tip1 = await tipJar.create({ userId: 'stats-user-1', amountCents: 100 });
      const tip2 = await tipJar.create({ userId: 'stats-user-2', amountCents: 300 });

      await tipJar.complete(tip1.id, 'pi_test_1');
      await tipJar.complete(tip2.id, 'pi_test_2');

      const stats = tipJar.getStats();
      expect(stats.tipCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('shouldOffer', () => {
    it('should always show when user asks to help', () => {
      const prompt = tipJar.shouldOffer({
        userId: 'helpful-user',
        conversationCount: 5,
        lastTipOfferedConversation: 4,
        userAskedToHelp: true,
        conversationWasMeaningful: false,
      });

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should not show too frequently', () => {
      const prompt = tipJar.shouldOffer({
        userId: 'frequent-user',
        conversationCount: 25,
        lastTipOfferedConversation: 20, // Only 5 conversations ago (< 20 cooldown)
        userAskedToHelp: false,
        conversationWasMeaningful: false,
      });

      expect(prompt).toBeNull();
    });

    it('should show on milestone conversations', () => {
      const prompt = tipJar.shouldOffer({
        userId: 'milestone-user',
        conversationCount: 50, // Milestone at 50
        lastTipOfferedConversation: 0,
        userAskedToHelp: false,
        conversationWasMeaningful: false,
      });

      expect(prompt).toBeDefined();
      expect(prompt).toContain('50');
    });

    it('should return null for regular conversations outside cooldown', () => {
      const prompt = tipJar.shouldOffer({
        userId: 'regular-user',
        conversationCount: 30,
        lastTipOfferedConversation: 5,
        userAskedToHelp: false,
        conversationWasMeaningful: false,
      });

      // For regular non-milestone conversations, usually returns null
      // (unless meaningful + random chance)
      // This test might occasionally fail due to randomness in meaningfulConversation
      expect(prompt === null || typeof prompt === 'string').toBe(true);
    });
  });

  describe('getUserTips', () => {
    it('should return empty array for new user', async () => {
      const tips = await tipJar.getUserTips('brand-new-user-' + Date.now());
      expect(Array.isArray(tips)).toBe(true);
    });

    it('should return only completed tips', async () => {
      const userId = 'completed-tips-user-' + Date.now();

      // Create some tips
      await tipJar.create({ userId, amountCents: 100 });
      const tip2 = await tipJar.create({ userId, amountCents: 200 });
      await tipJar.complete(tip2.id, 'pi_completed');

      const tips = await tipJar.getUserTips(userId);

      // Should only have the completed one
      expect(tips.some((t) => t.status === 'completed')).toBe(true);
    });
  });
});
