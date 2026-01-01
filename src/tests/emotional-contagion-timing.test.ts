/**
 * Tests for Emotional Contagion Timing System
 *
 * Verifies the absorb→process→reflect pattern that makes
 * emotional responses feel human rather than algorithmic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  emotionalContagionTimingBuilder,
  detectEmotionState,
  calculateContagionTiming,
  clearContagionSession,
} from '../intelligence/context-builders/emotional/emotional-contagion-timing.js';
import type { ContextBuilderInput } from '../intelligence/context-builders/index.js';

// Test helper to create mock input
function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    persona: { id: 'ferni', name: 'Ferni' },
    userText: '',
    analysis: undefined,
    voiceEmotion: undefined,
    userData: { turnCount: 1 },
    services: { userId: 'test-user', sessionId: 'test-session' },
    ...overrides,
  } as ContextBuilderInput;
}

describe('Emotional Contagion Timing System', () => {
  beforeEach(() => {
    clearContagionSession('test-session');
  });

  describe('detectEmotionState', () => {
    it('should detect high intensity sadness', () => {
      const input = createMockInput({
        userText: "I'm really struggling with this",
        analysis: {
          emotion: {
            primary: 'sadness',
            intensity: 0.85, // >0.8 = intense
            needsSupport: true,
          },
        },
      });

      const state = detectEmotionState(input);

      expect(state).not.toBeNull();
      expect(state?.emotion).toBe('sadness');
      expect(state?.intensity).toBe('intense');
      expect(state?.isVulnerable).toBe(true);
    });

    it('should detect celebration emotions', () => {
      const input = createMockInput({
        userText: 'I got the job!!!',
        analysis: {
          emotion: {
            primary: 'excitement',
            intensity: 0.9,
          },
        },
      });

      const state = detectEmotionState(input);

      expect(state).not.toBeNull();
      expect(state?.emotion).toBe('excitement');
      expect(state?.isCelebration).toBe(true);
    });

    it('should detect distress emotions', () => {
      const input = createMockInput({
        userText: "I'm panicking about this deadline",
        analysis: {
          emotion: {
            primary: 'anxiety',
            intensity: 0.85,
            needsSupport: true,
          },
        },
      });

      const state = detectEmotionState(input);

      expect(state).not.toBeNull();
      expect(state?.isDistress).toBe(true);
    });

    it('should detect vulnerability markers in text', () => {
      const input = createMockInput({
        userText: "I've never told anyone this before",
        analysis: {
          emotion: {
            primary: 'nervous',
            intensity: 0.6,
          },
        },
      });

      const state = detectEmotionState(input);

      expect(state).not.toBeNull();
      expect(state?.isVulnerable).toBe(true);
    });

    it('should return null when no emotion detected', () => {
      const input = createMockInput({
        userText: 'What time is it?',
        analysis: undefined,
      });

      const state = detectEmotionState(input);
      expect(state).toBeNull();
    });
  });

  describe('calculateContagionTiming', () => {
    it('should use sadness phrases for sad emotions', () => {
      const timing = calculateContagionTiming({
        emotion: 'sadness',
        intensity: 'high',
        isVulnerable: true,
        isCelebration: false,
        isDistress: false,
      });

      // Should get a sadness-specific processing phrase
      expect(timing.processingPhrase).toBeDefined();
      expect(timing.processingPhrase.length).toBeGreaterThan(0);
      expect(timing.holdSpace).toBe(true); // Vulnerable = hold space
    });

    it('should have lower mirror intensity for anxiety (grounding effect)', () => {
      const timing = calculateContagionTiming({
        emotion: 'anxiety',
        intensity: 'high',
        isVulnerable: false,
        isCelebration: false,
        isDistress: true,
      });

      // Should be calmer than user for grounding
      expect(timing.mirrorIntensity).toBeLessThanOrEqual(0.5);
    });

    it('should have high mirror intensity for celebration', () => {
      const timing = calculateContagionTiming({
        emotion: 'excitement',
        intensity: 'high',
        isVulnerable: false,
        isCelebration: true,
        isDistress: false,
      });

      // Should match their joy!
      expect(timing.mirrorIntensity).toBeGreaterThanOrEqual(0.9);
      expect(timing.holdSpace).toBe(false);
    });

    it('should never have 100% mirror intensity', () => {
      const emotions = ['joy', 'sadness', 'frustration', 'neutral'];
      const intensities = ['low', 'moderate', 'high', 'intense'] as const;

      for (const emotion of emotions) {
        for (const intensity of intensities) {
          const timing = calculateContagionTiming({
            emotion,
            intensity,
            isVulnerable: false,
            isCelebration: false,
            isDistress: false,
          });

          // Should never be exactly 100% (that feels robotic)
          expect(timing.mirrorIntensity).toBeLessThan(1.0);
        }
      }
    });

    it('should include reflection guidance', () => {
      const timing = calculateContagionTiming({
        emotion: 'frustration',
        intensity: 'moderate',
        isVulnerable: false,
        isCelebration: false,
        isDistress: false,
      });

      expect(timing.reflectionGuidance).toBeDefined();
      expect(timing.reflectionGuidance.length).toBeGreaterThan(0);
    });
  });

  describe('emotionalContagionTimingBuilder', () => {
    it('should return injection for significant emotions', async () => {
      const input = createMockInput({
        userText: "I'm really frustrated with my boss",
        analysis: {
          emotion: {
            primary: 'frustration',
            intensity: 0.7,
          },
        },
        userData: { turnCount: 5 }, // Not first turn
      });

      const injections = await emotionalContagionTimingBuilder.build(input);

      expect(injections.length).toBeGreaterThan(0);
      expect(injections[0].content).toContain('EMOTIONAL CONTAGION');
      expect(injections[0].content).toContain('Processing Phase');
    });

    it('should return empty array for low intensity non-vulnerable emotions', async () => {
      const input = createMockInput({
        userText: 'The weather is nice',
        analysis: {
          emotion: {
            primary: 'content',
            intensity: 0.2,
          },
        },
      });

      const injections = await emotionalContagionTimingBuilder.build(input);
      expect(injections.length).toBe(0);
    });

    it('should return empty array when no emotion detected', async () => {
      const input = createMockInput({
        userText: 'Hello',
        analysis: undefined,
      });

      const injections = await emotionalContagionTimingBuilder.build(input);
      expect(injections.length).toBe(0);
    });

    it('should use high priority injection for vulnerable moments', async () => {
      const input = createMockInput({
        userText: "I've never told anyone this before but I'm scared",
        analysis: {
          emotion: {
            primary: 'fear',
            intensity: 0.8,
            needsSupport: true,
          },
        },
        userData: { turnCount: 5 },
      });

      const injections = await emotionalContagionTimingBuilder.build(input);

      expect(injections.length).toBeGreaterThan(0);
      // Vulnerable moments should get high priority
      expect(injections[0].priority).toBe('high');
    });

    it('should space out injections (not every turn)', async () => {
      // First turn with emotion
      const input1 = createMockInput({
        userText: "I'm frustrated",
        analysis: {
          emotion: {
            primary: 'frustration',
            intensity: 0.6,
          },
        },
        userData: { turnCount: 1 },
        services: { userId: 'test-user', sessionId: 'spacing-test' },
      });

      // Clear any previous state
      clearContagionSession('spacing-test');

      const injections1 = await emotionalContagionTimingBuilder.build(input1);
      expect(injections1.length).toBeGreaterThan(0);

      // Very next turn with similar emotion
      const input2 = createMockInput({
        userText: "Still frustrated",
        analysis: {
          emotion: {
            primary: 'frustration',
            intensity: 0.6,
          },
        },
        userData: { turnCount: 2 }, // Next turn
        services: { userId: 'test-user', sessionId: 'spacing-test' },
      });

      const injections2 = await emotionalContagionTimingBuilder.build(input2);
      // Should be empty because we just had contagion guidance
      expect(injections2.length).toBe(0);
    });

    it('should still inject for intense emotions even if recent', async () => {
      clearContagionSession('intense-test');

      // First turn
      const input1 = createMockInput({
        userText: "I'm a bit annoyed",
        analysis: {
          emotion: {
            primary: 'annoyed',
            intensity: 0.5,
          },
        },
        userData: { turnCount: 1 },
        services: { userId: 'test-user', sessionId: 'intense-test' },
      });

      await emotionalContagionTimingBuilder.build(input1);

      // Very next turn with INTENSE emotion - should still inject
      const input2 = createMockInput({
        userText: "I'M SO FRUSTRATED I COULD SCREAM!",
        analysis: {
          emotion: {
            primary: 'frustration',
            intensity: 0.95,
          },
        },
        userData: { turnCount: 2 },
        services: { userId: 'test-user', sessionId: 'intense-test' },
      });

      const injections2 = await emotionalContagionTimingBuilder.build(input2);
      // Should inject because it's intense
      expect(injections2.length).toBeGreaterThan(0);
    });
  });
});
