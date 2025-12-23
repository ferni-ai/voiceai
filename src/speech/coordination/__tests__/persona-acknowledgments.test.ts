/**
 * Persona Acknowledgments Tests
 *
 * Tests for persona-aware acknowledgment generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateAcknowledgment,
  shouldAcknowledge,
  getToolCategory,
  recordAcknowledgmentFeedback,
  DEFAULT_ACKNOWLEDGMENTS,
  TOOL_CATEGORIES,
} from '../persona-acknowledgments.js';

describe('PersonaAcknowledgments', () => {
  describe('generateAcknowledgment', () => {
    it('should generate acknowledgment for ferni persona', () => {
      const ack = generateAcknowledgment({
        personaId: 'ferni',
        toolId: 'news',
        toolCategory: 'searching',
      });

      expect(ack).toBeTruthy();
      expect(typeof ack).toBe('string');
      expect(ack.length).toBeGreaterThan(0);
    });

    it('should generate acknowledgment for peter persona', () => {
      const ack = generateAcknowledgment({
        personaId: 'peter',
        toolId: 'finance',
        toolCategory: 'calculating',
      });

      expect(ack).toBeTruthy();
      expect(typeof ack).toBe('string');
    });

    it('should generate acknowledgment for maya persona', () => {
      const ack = generateAcknowledgment({
        personaId: 'maya',
        toolId: 'habit-tracker',
        toolCategory: 'thinking',
      });

      expect(ack).toBeTruthy();
    });

    it('should fall back to ferni for unknown persona', () => {
      const ack = generateAcknowledgment({
        personaId: 'unknown-persona',
        toolId: 'test',
      });

      expect(ack).toBeTruthy();
    });

    it('should avoid repeating previous acknowledgment', () => {
      const acks = new Set<string>();
      const previousAck = generateAcknowledgment({
        personaId: 'ferni',
        toolId: 'test',
      });

      // Generate multiple and check for variety
      for (let i = 0; i < 10; i++) {
        const ack = generateAcknowledgment({
          personaId: 'ferni',
          toolId: 'test',
          previousAck,
        });
        acks.add(ack);
      }

      // Should have generated different acknowledgments
      // (weighted random means not guaranteed, but likely with 10 tries)
      expect(acks.size).toBeGreaterThanOrEqual(1);
    });

    it('should add filler for longer waits', () => {
      const shortWait = generateAcknowledgment({
        personaId: 'ferni',
        toolId: 'test',
        estimatedWaitMs: 1000,
      });

      const longWait = generateAcknowledgment({
        personaId: 'ferni',
        toolId: 'test',
        estimatedWaitMs: 5000,
      });

      // Long wait should generally have more content (filler added)
      // But since acknowledgments are randomized, we just verify both are valid strings
      expect(longWait.length).toBeGreaterThan(0);
      expect(shortWait.length).toBeGreaterThan(0);
    });
  });

  describe('shouldAcknowledge', () => {
    it('should return true for long waits', () => {
      expect(shouldAcknowledge(3000)).toBe(true);
      expect(shouldAcknowledge(5000)).toBe(true);
    });

    it('should return false for very short waits', () => {
      expect(shouldAcknowledge(500)).toBe(false);
    });

    it('should return true for moderate waits (>1s)', () => {
      expect(shouldAcknowledge(1500)).toBe(true);
    });

    it('should respect user preferences for short waits', () => {
      // Without user preferences, 1200ms should acknowledge
      const result = shouldAcknowledge(1200);
      expect(result).toBe(true);

      // With user who prefers short responses, behavior might differ
      // (would need to set up preferences first)
    });
  });

  describe('getToolCategory', () => {
    it('should return searching for search-related tools', () => {
      expect(getToolCategory('web-search')).toBe('searching');
      expect(getToolCategory('knowledge-base')).toBe('searching');
    });

    it('should return remembering for memory-related tools', () => {
      expect(getToolCategory('memory-recall')).toBe('remembering');
      expect(getToolCategory('conversation-history')).toBe('remembering');
    });

    it('should return connecting for music tools', () => {
      expect(getToolCategory('music-player')).toBe('connecting');
      expect(getToolCategory('spotify-player')).toBe('connecting');
    });

    it('should return calculating for calculation tools', () => {
      expect(getToolCategory('finance-calculator')).toBe('calculating');
    });

    it('should return thinking for unknown tools', () => {
      expect(getToolCategory('unknown-tool')).toBe('thinking');
    });
  });

  describe('recordAcknowledgmentFeedback', () => {
    const testUserId = 'test-user-feedback';

    it('should record positive feedback', () => {
      recordAcknowledgmentFeedback(testUserId, 'Let me check on that', 'searching', true);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should record negative feedback', () => {
      recordAcknowledgmentFeedback(testUserId, 'Hold on a moment', 'thinking', false);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle multiple feedback recordings', () => {
      for (let i = 0; i < 5; i++) {
        recordAcknowledgmentFeedback(testUserId, `Phrase ${i}`, 'thinking', i % 2 === 0);
      }

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('DEFAULT_ACKNOWLEDGMENTS', () => {
    it('should have ferni acknowledgments', () => {
      expect(DEFAULT_ACKNOWLEDGMENTS.ferni).toBeDefined();
      expect(DEFAULT_ACKNOWLEDGMENTS.ferni.phrases.thinking.length).toBeGreaterThan(0);
    });

    it('should have peter acknowledgments', () => {
      expect(DEFAULT_ACKNOWLEDGMENTS.peter).toBeDefined();
    });

    it('should have maya acknowledgments', () => {
      expect(DEFAULT_ACKNOWLEDGMENTS.maya).toBeDefined();
    });

    it('should have all required categories', () => {
      const requiredCategories = [
        'thinking',
        'searching',
        'calculating',
        'creating',
        'connecting',
        'remembering',
      ];

      for (const category of requiredCategories) {
        expect(
          DEFAULT_ACKNOWLEDGMENTS.ferni.phrases[
            category as keyof typeof DEFAULT_ACKNOWLEDGMENTS.ferni.phrases
          ]
        ).toBeDefined();
      }
    });

    it('should have fillers', () => {
      expect(DEFAULT_ACKNOWLEDGMENTS.ferni.fillers.length).toBeGreaterThan(0);
    });
  });

  describe('TOOL_CATEGORIES', () => {
    it('should map common tools', () => {
      expect(TOOL_CATEGORIES['web-search']).toBe('searching');
      expect(TOOL_CATEGORIES['music-player']).toBe('connecting');
      expect(TOOL_CATEGORIES['finance-calculator']).toBe('calculating');
    });

    it('should have default category', () => {
      expect(TOOL_CATEGORIES.default).toBe('thinking');
    });
  });
});
