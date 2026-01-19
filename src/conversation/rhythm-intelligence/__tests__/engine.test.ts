/**
 * Rhythm Intelligence Tests
 *
 * @module @ferni/conversation/rhythm-intelligence/__tests__/engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRhythmIntelligence,
  clearUserData,
  type IRhythmIntelligence,
  type RhythmContext,
  WORD_RANGES,
} from '../index.js';

describe('RhythmIntelligence', () => {
  let rhythm: IRhythmIntelligence;
  const userId = 'test-user-123';

  beforeEach(async () => {
    rhythm = createRhythmIntelligence();
    await clearUserData(userId);
  });

  // Helper to create context
  const createContext = (
    overrides: Partial<RhythmContext> = {}
  ): RhythmContext => ({
    userId,
    turnNumber: 5,
    userTurnWordCount: 30,
    ...overrides,
  });

  // ============================================================================
  // GUIDANCE TESTS
  // ============================================================================

  describe('getGuidance()', () => {
    it('returns default guidance for new user', async () => {
      const guidance = await rhythm.getGuidance(createContext());

      expect(guidance.wordRange).toBeDefined();
      expect(guidance.wordRange.min).toBeGreaterThan(0);
      expect(guidance.wordRange.max).toBeGreaterThan(guidance.wordRange.min);
      expect(guidance.confidence).toBeLessThanOrEqual(1);
    });

    it('adjusts for short user turn', async () => {
      const guidance = await rhythm.getGuidance(
        createContext({
          userTurnWordCount: 5,
        })
      );

      // Should give brief response
      expect(guidance.wordRange.max).toBeLessThanOrEqual(WORD_RANGES.moderate.max);
    });

    it('adjusts for long user turn', async () => {
      const guidance = await rhythm.getGuidance(
        createContext({
          userTurnWordCount: 100,
        })
      );

      // Should give longer response
      expect(guidance.wordRange.max).toBeGreaterThanOrEqual(50);
    });

    it('adjusts pause for emotional state', async () => {
      const guidanceNeutral = await rhythm.getGuidance(createContext());

      const guidanceSad = await rhythm.getGuidance(
        createContext({
          emotionalState: 'sad',
        })
      );

      // Sad should have longer pause
      expect(guidanceSad.pauseBeforeMs).toBeGreaterThan(guidanceNeutral.pauseBeforeMs);
    });

    it('adjusts for late night time', async () => {
      const guidance = await rhythm.getGuidance(
        createContext({
          timeOfDay: 'lateNight',
        })
      );

      expect(guidance.energy).toBe('low');
    });

    it('includes reason in guidance', async () => {
      const guidance = await rhythm.getGuidance(createContext());

      expect(guidance.reason).toBeDefined();
      expect(guidance.reason.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // TURN ANALYSIS TESTS
  // ============================================================================

  describe('analyzeTurn()', () => {
    it('counts words correctly', () => {
      const analysis = rhythm.analyzeTurn('Hello world this is a test');

      expect(analysis.wordCount).toBe(6);
    });

    it('counts sentences correctly', () => {
      const analysis = rhythm.analyzeTurn(
        'This is one sentence. This is another. And a third!'
      );

      expect(analysis.sentenceCount).toBe(3);
    });

    it('calculates average words per sentence', () => {
      const analysis = rhythm.analyzeTurn('Hello world. How are you?');

      expect(analysis.avgWordsPerSentence).toBe(2.5); // 5 words / 2 sentences
    });

    it('detects high energy', () => {
      const analysis = rhythm.analyzeTurn('This is amazing! I love it!!!');

      expect(analysis.energy).toBe('high');
    });

    it('detects low energy', () => {
      const analysis = rhythm.analyzeTurn("I'm tired... whatever, I guess.");

      expect(analysis.energy).toBe('low');
    });

    it('detects moderate energy', () => {
      const analysis = rhythm.analyzeTurn(
        'I had a meeting today and then came home.'
      );

      expect(analysis.energy).toBe('moderate');
    });

    it('includes topic when provided', () => {
      const analysis = rhythm.analyzeTurn('Talked about work stuff', {
        topic: 'career',
      });

      expect(analysis.topic).toBe('career');
    });
  });

  // ============================================================================
  // LEARNING TESTS
  // ============================================================================

  describe('learning and recording', () => {
    it('records turn without error', async () => {
      const analysis = rhythm.analyzeTurn('Test message here');

      await expect(
        rhythm.recordTurn(userId, analysis, true)
      ).resolves.not.toThrow();
    });

    it('builds profile after many turns', async () => {
      // Record many turns to build profile
      for (let i = 0; i < 15; i++) {
        const analysis = rhythm.analyzeTurn(
          'This is a moderately long message with several words'
        );
        await rhythm.recordTurn(userId, analysis, true);
      }

      const profile = await rhythm.getProfile(userId);

      expect(profile).not.toBeNull();
      expect(profile?.turnsAnalyzed).toBeGreaterThanOrEqual(15);
    });

    it('adapts guidance based on learned profile', async () => {
      // Record many brief turns
      for (let i = 0; i < 15; i++) {
        const analysis = rhythm.analyzeTurn('Short message');
        await rhythm.recordTurn(userId, analysis, true);
      }

      const guidance = await rhythm.getGuidance(createContext());

      // Should have higher confidence with learned data
      expect(guidance.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ============================================================================
  // CONTEXT INJECTION TESTS
  // ============================================================================

  describe('buildContextInjection()', () => {
    it('builds context string', async () => {
      const guidance = await rhythm.getGuidance(createContext());
      const injection = rhythm.buildContextInjection(guidance);

      expect(injection).toContain('[RHYTHM GUIDANCE]');
      expect(injection).toContain('words');
    });

    it('includes energy guidance', async () => {
      const guidance = await rhythm.getGuidance(
        createContext({
          timeOfDay: 'lateNight',
        })
      );
      const injection = rhythm.buildContextInjection(guidance);

      expect(injection.toLowerCase()).toContain('energy');
    });

    it('includes confidence', async () => {
      const guidance = await rhythm.getGuidance(createContext());
      const injection = rhythm.buildContextInjection(guidance);

      expect(injection).toContain('Confidence');
    });
  });

  // ============================================================================
  // PROFILE TESTS
  // ============================================================================

  describe('getProfile()', () => {
    it('returns null for new user', async () => {
      const profile = await rhythm.getProfile('non-existent-user');

      expect(profile).toBeNull();
    });

    it('returns profile after recording turns', async () => {
      // Record turns
      for (let i = 0; i < 12; i++) {
        const analysis = rhythm.analyzeTurn('Test message content here');
        await rhythm.recordTurn(userId, analysis, true);
      }

      const profile = await rhythm.getProfile(userId);

      expect(profile).not.toBeNull();
      expect(profile?.userId).toBe(userId);
    });
  });

  // ============================================================================
  // RESET TESTS
  // ============================================================================

  describe('reset()', () => {
    it('resets without error', () => {
      expect(() => rhythm.reset()).not.toThrow();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    it('handles empty message', () => {
      const analysis = rhythm.analyzeTurn('');

      expect(analysis.wordCount).toBe(0);
    });

    it('handles very long message', async () => {
      const longMessage = Array(500).fill('word').join(' ');
      const analysis = rhythm.analyzeTurn(longMessage);

      expect(analysis.wordCount).toBe(500);
    });

    it('handles missing optional context', async () => {
      const guidance = await rhythm.getGuidance({
        userId,
        turnNumber: 1,
        userTurnWordCount: 20,
      });

      expect(guidance).toBeDefined();
      expect(guidance.wordRange).toBeDefined();
    });
  });
});
