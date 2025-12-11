/**
 * Value Capture Service Tests
 *
 * Tests for detecting and capturing value events (outcome-based contributions).
 */

import { describe, expect, it } from 'vitest';
import { valueCapture } from '../../services/monetization/value-capture.js';

describe('Value Capture Service', () => {
  describe('detect', () => {
    it('should detect financial gain events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'I got a raise at work! $5,000 more per year!',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('financial_gain');
    });

    it('should detect financial save events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'I saved $500 by canceling subscriptions I never use',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('financial_save');
    });

    it('should detect habit milestone events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: "I'm on a 30 day streak of meditating!",
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('habit_milestone');
    });

    it('should detect career win events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'I got the job! They hired me!',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('career_win');
    });

    it('should detect emotional breakthrough events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'For the first time, I finally cried and let myself feel it all',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('emotional_breakthrough');
    });

    it('should detect clarity moment events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'Everything finally clicked - I know what I need to do now',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('clarity_moment');
    });

    it('should detect health improvement events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'I lost 15 pounds since we started talking about fitness!',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.type).toBe('health_improvement');
    });

    it('should return null for non-value messages', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'The weather is nice today',
        conversationId: 'conv-1',
      });

      expect(event).toBeNull();
    });

    it('should extract monetary value from message', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'I negotiated a $10,000 raise!',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.estimatedValueCents).toBe(1000000); // $10,000 in cents
    });

    it('should suggest 1% contribution for financial events', async () => {
      const event = await valueCapture.detect({
        userId: 'test-user',
        message: 'Got a bonus of $2,000!',
        conversationId: 'conv-1',
      });

      expect(event).toBeDefined();
      expect(event?.suggestedContributionCents).toBe(2000); // 1% of $2,000
    });
  });

  describe('getPrompt', () => {
    it('should return a prompt string', async () => {
      const event = await valueCapture.detect({
        userId: 'prompt-user',
        message: 'I got the job!',
        conversationId: 'conv-1',
      });

      if (event) {
        const prompt = valueCapture.getPrompt(event);
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      }
    });
  });

  describe('recordContribution', () => {
    it('should record a contribution for an event', async () => {
      const event = await valueCapture.detect({
        userId: 'contrib-user',
        message: 'I saved $300 this month!',
        conversationId: 'conv-1',
      });

      if (event) {
        const updatedEvent = await valueCapture.recordContribution({
          eventId: event.id,
          amountCents: 500,
        });

        expect(updatedEvent.contributed).toBe(true);
        expect(updatedEvent.contributionCents).toBe(500);
        expect(updatedEvent.contributedAt).toBeDefined();
      }
    });
  });

  describe('getThankYou', () => {
    it('should return a thank you message', () => {
      const message = valueCapture.getThankYou();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const stats = valueCapture.getStats();
      expect(stats).toHaveProperty('totalValueCapturedCents');
      expect(stats).toHaveProperty('contributionCount');
      expect(stats).toHaveProperty('averageContributionCents');
      expect(stats).toHaveProperty('eventsByType');
    });
  });

  describe('shouldShow', () => {
    it('should not show too frequently', async () => {
      const event = await valueCapture.detect({
        userId: 'show-user',
        message: 'Got a $1,000 bonus!',
        conversationId: 'conv-1',
      });

      if (event) {
        // Should not show if already shown recently
        const shouldShow = valueCapture.shouldShow({
          event,
          recentValuePromptCount: 1, // Already shown once this conversation
          conversationTurnCount: 5,
        });

        expect(shouldShow).toBe(false);
      }
    });

    it('should show for significant value events', async () => {
      const event = await valueCapture.detect({
        userId: 'big-value-user',
        message: 'I negotiated a $20,000 raise!',
        conversationId: 'conv-1',
      });

      if (event) {
        const shouldShow = valueCapture.shouldShow({
          event,
          recentValuePromptCount: 0,
          conversationTurnCount: 5,
        });

        // For large financial events, should always show
        expect(shouldShow).toBe(true);
      }
    });

    it('should not show early in conversation', async () => {
      const event = await valueCapture.detect({
        userId: 'early-user',
        message: 'Got a promotion!',
        conversationId: 'conv-1',
      });

      if (event) {
        const shouldShow = valueCapture.shouldShow({
          event,
          recentValuePromptCount: 0,
          conversationTurnCount: 1, // Too early
        });

        expect(shouldShow).toBe(false);
      }
    });
  });
});
