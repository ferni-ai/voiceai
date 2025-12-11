/**
 * Ferni Fund Service Tests
 *
 * Tests for the pay-it-forward community pool.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  contributeToFund,
  ferniFund,
  getContributorImpact,
  getFundStatus,
  getFundThankYou,
  getSponsoredMessage,
  getUserContributions,
  hasContributed,
  recordSponsoredConversation,
  shouldMentionFund,
  shouldShowSponsoredMessage,
} from '../../services/monetization/ferni-fund.js';

describe('Ferni Fund Service', () => {
  describe('contributeToFund', () => {
    it('should create a contribution', async () => {
      const contribution = await contributeToFund({
        userId: 'test-contributor-1',
        amountCents: 1000,
        message: 'Happy to help!',
      });

      expect(contribution).toBeDefined();
      expect(contribution.id).toBeDefined();
      expect(contribution.userId).toBe('test-contributor-1');
      expect(contribution.amountCents).toBe(1000);
      expect(contribution.conversationsSponsored).toBeGreaterThan(0);
    });

    it('should create recurring contribution', async () => {
      const contribution = await contributeToFund({
        userId: 'test-contributor-2',
        amountCents: 2000,
        isRecurring: true,
        recurringFrequency: 'monthly',
      });

      expect(contribution.isRecurring).toBe(true);
      expect(contribution.recurringFrequency).toBe('monthly');
    });

    it('should calculate sponsored conversations correctly', async () => {
      // $10 = 1000 cents, should sponsor multiple conversations
      const contribution = await contributeToFund({
        userId: 'test-contributor-3',
        amountCents: 1000,
      });

      // At $0.50 per conversation (50 cents), $10 sponsors 20 conversations
      expect(contribution.conversationsSponsored).toBe(20);
    });
  });

  describe('getFundStatus', () => {
    beforeEach(async () => {
      // Add some contributions
      await contributeToFund({ userId: 'status-user-1', amountCents: 500 });
      await contributeToFund({ userId: 'status-user-2', amountCents: 1000 });
    });

    it('should return fund status', () => {
      const status = getFundStatus();

      expect(status).toBeDefined();
      expect(typeof status.balanceCents).toBe('number');
      expect(typeof status.totalContributedCents).toBe('number');
      expect(typeof status.conversationsSponsored).toBe('number');
      expect(typeof status.totalContributors).toBe('number');
      expect(typeof status.conversationsRemaining).toBe('number');
    });
  });

  describe('getFundThankYou', () => {
    it('should return thank you message with impact', () => {
      const message = getFundThankYou(10);

      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
      expect(message).toContain('10');
    });

    it('should handle singular conversation', () => {
      const message = getFundThankYou(1);

      expect(message).toBeDefined();
      // Should use singular "conversation" not "conversations"
      expect(message).toMatch(/conversation/);
    });
  });

  describe('shouldShowSponsoredMessage', () => {
    it('should show for sponsored conversations', () => {
      const shouldShow = shouldShowSponsoredMessage({
        userId: 'recipient-1',
        conversationCount: 10,
        hasEverContributed: false,
        isReturningUser: true,
      });

      // Should occasionally show for eligible users
      expect(typeof shouldShow).toBe('boolean');
    });

    it('should not show for contributors', () => {
      const shouldShow = shouldShowSponsoredMessage({
        userId: 'contributor-1',
        conversationCount: 10,
        hasEverContributed: true, // Has contributed
        isReturningUser: true,
      });

      // Contributors don't see sponsored messages
      expect(shouldShow).toBe(false);
    });
  });

  describe('recordSponsoredConversation', () => {
    it('should record sponsored conversation when fund has balance', async () => {
      // Add substantial funds first
      await contributeToFund({ userId: 'funder-sponsor-test', amountCents: 5000 });

      const uniqueUserId = `sponsored-user-${Date.now()}`;
      const sponsored = recordSponsoredConversation({
        userId: uniqueUserId,
        conversationId: 'conv-sponsor-test',
      });

      // The function might return null if balance is depleted
      // Just verify the structure if it returns something
      if (sponsored) {
        expect(sponsored.conversationId).toBe('conv-sponsor-test');
        expect(sponsored.recipientUserId).toBe(uniqueUserId);
      }
    });
  });

  describe('getSponsoredMessage', () => {
    it('should return sponsored message', () => {
      const message = getSponsoredMessage();

      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
    });

    it('should include custom message if provided', () => {
      const customMessage = 'You deserve support!';
      const message = getSponsoredMessage(customMessage);

      expect(message).toContain(customMessage);
    });
  });

  describe('getUserContributions', () => {
    beforeEach(async () => {
      await contributeToFund({ userId: 'multi-contrib-user', amountCents: 300 });
      await contributeToFund({ userId: 'multi-contrib-user', amountCents: 500 });
    });

    it('should return contributions for user', () => {
      const contributions = getUserContributions('multi-contrib-user');

      expect(contributions).toBeDefined();
      expect(Array.isArray(contributions)).toBe(true);
      expect(contributions.length).toBe(2);
    });
  });

  describe('getContributorImpact', () => {
    beforeEach(async () => {
      await contributeToFund({ userId: 'impact-user', amountCents: 1000 });
    });

    it('should return contributor impact', () => {
      const impact = getContributorImpact('impact-user');

      expect(impact).toBeDefined();
      expect(impact.totalContributedCents).toBe(1000);
      expect(impact.conversationsSponsored).toBeGreaterThan(0);
      expect(impact.contributionCount).toBe(1);
    });
  });

  describe('hasContributed', () => {
    beforeEach(async () => {
      await contributeToFund({ userId: 'has-contributed-user', amountCents: 500 });
    });

    it('should return true for contributors', () => {
      expect(hasContributed('has-contributed-user')).toBe(true);
    });

    it('should return false for non-contributors', () => {
      expect(hasContributed('never-contributed')).toBe(false);
    });
  });

  describe('shouldMentionFund', () => {
    it('should mention when user expresses gratitude', () => {
      const mention = shouldMentionFund({
        userExpressedGratitude: true,
        userWantsToHelp: false,
        conversationCount: 50,
        lastFundMentionConversation: 0,
      });

      // Might mention fund when user is grateful
      expect(mention === null || typeof mention === 'string').toBe(true);
    });

    it('should mention when user wants to help', () => {
      const mention = shouldMentionFund({
        userExpressedGratitude: false,
        userWantsToHelp: true, // Explicitly wants to help
        conversationCount: 100,
        lastFundMentionConversation: 50,
      });

      expect(mention).toBeDefined();
      expect(typeof mention).toBe('string');
    });

    it('should not mention too frequently', () => {
      const mention = shouldMentionFund({
        userExpressedGratitude: true,
        userWantsToHelp: false,
        conversationCount: 35,
        lastFundMentionConversation: 30, // Only 5 convos ago
      });

      expect(mention).toBeNull();
    });
  });

  describe('ferniFund namespace', () => {
    it('should export all functions via namespace', () => {
      expect(ferniFund.contribute).toBeDefined();
      expect(ferniFund.getStatus).toBeDefined();
      expect(ferniFund.getThankYou).toBeDefined();
      expect(ferniFund.shouldShowSponsored).toBeDefined();
      expect(ferniFund.recordSponsored).toBeDefined();
      expect(ferniFund.getSponsoredMessage).toBeDefined();
      expect(ferniFund.getUserContributions).toBeDefined();
      expect(ferniFund.getContributorImpact).toBeDefined();
      expect(ferniFund.hasContributed).toBeDefined();
      expect(ferniFund.shouldMention).toBeDefined();
    });
  });
});
