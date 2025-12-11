/**
 * Tests for Context Manager Speech Insights Integration
 *
 * Tests the speech insights integration in the ContextManager,
 * including emotional contagion, human listening analysis, and
 * dynamic speed control.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextManager,
  getContextManager,
  removeContextManager,
  type SpeechInsightsContext,
} from '../context/context-manager.js';
import { createSessionId } from '../types/branded.js';
import type { EmotionalMomentum, ProsodyContinuityHints } from '../speech/emotional-contagion.js';
import type { HumanListeningResult } from '../speech/human-listening-pipeline/types.js';
import type { SpeedControlResult } from '../speech/adaptive-ssml/dynamic-speed-control.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createMockEmotionalMomentum(overrides?: Partial<EmotionalMomentum>): EmotionalMomentum {
  return {
    valence: 0.6,
    arousal: 0.5,
    warmth: 'medium',
    trend: 'stable',
    ...overrides,
  } as EmotionalMomentum;
}

function createMockProsodyContinuityHints(
  overrides?: Partial<ProsodyContinuityHints>
): ProsodyContinuityHints {
  return {
    targetPitch: 'medium',
    targetSpeed: 1.0,
    emphasisLevel: 'moderate',
    breathingPattern: 'calm',
    ...overrides,
  } as ProsodyContinuityHints;
}

function createMockHumanListeningResult(
  overrides?: Partial<HumanListeningResult>
): HumanListeningResult {
  return {
    possibleDistress: false,
    shouldSlowDown: false,
    audio: {
      tremor: { detected: false },
    },
    text: {
      cognitiveLoad: { level: 'low', confidence: 0.8 },
      hedging: { hedgingDensity: 5, elevated: false, shouldProbe: false },
      selfSoothing: { detected: false, confidence: 0 },
    },
    ...overrides,
  } as unknown as HumanListeningResult;
}

function createMockSpeedControl(overrides?: Partial<SpeedControlResult>): SpeedControlResult {
  return {
    speed: 1.0,
    reason: 'normal pace',
    ...overrides,
  } as SpeedControlResult;
}

// ============================================================================
// TESTS
// ============================================================================

describe('ContextManager Speech Insights', () => {
  let manager: ContextManager;
  const testSessionId = createSessionId('test-session-123');

  beforeEach(() => {
    // Clean up any existing manager
    removeContextManager(testSessionId);
    manager = getContextManager(testSessionId);
  });

  describe('buildSpeechInsightsContext', () => {
    it('should build context with all speech data', () => {
      const momentum = createMockEmotionalMomentum();
      const hints = createMockProsodyContinuityHints();
      const listening = createMockHumanListeningResult();
      const speed = createMockSpeedControl();

      const context = manager.buildSpeechInsightsContext({
        emotionalMomentum: momentum,
        prosodyContinuityHints: hints,
        humanListeningResult: listening,
        speedControl: speed,
      });

      expect(context.emotionalMomentum).toBe(momentum);
      expect(context.prosodyContinuityHints).toBe(hints);
      expect(context.humanListeningResult).toBe(listening);
      expect(context.speedControl).toBe(speed);
    });

    it('should detect voice distress signals', () => {
      const listening = createMockHumanListeningResult({
        possibleDistress: true,
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.voiceDistressSignals).toBe(true);
      expect(context.speechGuidance).toContain('distress signals');
    });

    it('should detect tremor-based distress', () => {
      const listening = createMockHumanListeningResult({
        possibleDistress: false,
        audio: { tremor: { detected: true } },
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.voiceDistressSignals).toBe(true);
    });

    it('should estimate cognitive load from text analysis', () => {
      const listening = createMockHumanListeningResult({
        text: {
          cognitiveLoad: { level: 'high', confidence: 0.9 },
          hedging: { hedgingDensity: 10, elevated: false, shouldProbe: false },
          selfSoothing: { detected: false, confidence: 0 },
        },
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.estimatedCognitiveLoad).toBeGreaterThan(0.5);
      expect(context.speechGuidance).toContain('processing heavily');
    });

    it('should handle overloaded cognitive state', () => {
      const listening = createMockHumanListeningResult({
        text: {
          cognitiveLoad: { level: 'overloaded', confidence: 0.95 },
          hedging: { hedgingDensity: 0, elevated: false, shouldProbe: false },
          selfSoothing: { detected: false, confidence: 0 },
        },
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.estimatedCognitiveLoad).toBe(1.0);
      expect(context.speechGuidance).toContain('simpler language');
    });

    it('should provide default cognitive load when no data', () => {
      const context = manager.buildSpeechInsightsContext({});

      expect(context.estimatedCognitiveLoad).toBe(0.3);
      expect(context.voiceDistressSignals).toBe(false);
    });
  });

  describe('buildSpeechGuidance', () => {
    it('should include high warmth guidance', () => {
      const momentum = createMockEmotionalMomentum({ warmth: 'high' });

      const context = manager.buildSpeechInsightsContext({
        emotionalMomentum: momentum,
      });

      expect(context.speechGuidance).toContain('warm, supportive tone');
    });

    it('should include building energy guidance', () => {
      const momentum = createMockEmotionalMomentum({ trend: 'building' });

      const context = manager.buildSpeechInsightsContext({
        emotionalMomentum: momentum,
      });

      expect(context.speechGuidance).toContain('Energy is building');
    });

    it('should include dissipating energy guidance', () => {
      const momentum = createMockEmotionalMomentum({ trend: 'dissipating' });

      const context = manager.buildSpeechInsightsContext({
        emotionalMomentum: momentum,
      });

      expect(context.speechGuidance).toContain('Energy is settling');
    });

    it('should detect self-soothing behavior', () => {
      const listening = createMockHumanListeningResult({
        text: {
          cognitiveLoad: { level: 'low', confidence: 0.8 },
          hedging: { hedgingDensity: 0, elevated: false, shouldProbe: false },
          selfSoothing: { detected: true, confidence: 0.8 },
        },
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.speechGuidance).toContain('self-soothing');
      expect(context.speechGuidance).toContain('validation');
    });

    it('should detect elevated hedging', () => {
      const listening = createMockHumanListeningResult({
        text: {
          cognitiveLoad: { level: 'low', confidence: 0.8 },
          hedging: { hedgingDensity: 25, elevated: true, shouldProbe: true },
          selfSoothing: { detected: false, confidence: 0 },
        },
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.speechGuidance).toContain('hedging');
      expect(context.speechGuidance).toContain('explore');
    });

    it('should indicate slow-down needed', () => {
      const listening = createMockHumanListeningResult({
        shouldSlowDown: true,
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      expect(context.speechGuidance).toContain('Slow down');
    });

    it('should include speed control reason', () => {
      const speed = createMockSpeedControl({
        speed: 0.8,
        reason: 'user processing complex information',
      });

      const context = manager.buildSpeechInsightsContext({
        speedControl: speed,
      });

      expect(context.speechGuidance).toContain('user processing');
    });

    it('should not include normal pace reason', () => {
      const speed = createMockSpeedControl({
        speed: 1.0,
        reason: 'normal pace',
      });

      const context = manager.buildSpeechInsightsContext({
        speedControl: speed,
      });

      expect(context.speechGuidance).not.toContain('normal pace');
    });

    it('should return empty guidance when no signals', () => {
      const context = manager.buildSpeechInsightsContext({});

      expect(context.speechGuidance).toBe('');
    });
  });

  describe('formatSpeechInsightsForPrompt', () => {
    it('should return formatted guidance', () => {
      const listening = createMockHumanListeningResult({
        possibleDistress: true,
      });

      const context = manager.buildSpeechInsightsContext({
        humanListeningResult: listening,
      });

      const formatted = manager.formatSpeechInsightsForPrompt(context);

      expect(formatted).toContain('[VOICE INSIGHTS]');
      expect(formatted).toContain('distress');
    });

    it('should return empty string when no guidance', () => {
      const context: SpeechInsightsContext = {
        voiceDistressSignals: false,
        estimatedCognitiveLoad: 0.3,
        speechGuidance: '',
      };

      const formatted = manager.formatSpeechInsightsForPrompt(context);

      expect(formatted).toBe('');
    });
  });

  describe('Integration with PromptContext', () => {
    it('should allow combining speech insights with prompt context', () => {
      // Build speech insights
      const speechInsights = manager.buildSpeechInsightsContext({
        emotionalMomentum: createMockEmotionalMomentum({ warmth: 'high' }),
      });

      // Build prompt context
      const promptContext = manager.buildPromptContext();

      // The speech insights can be used alongside prompt context
      expect(promptContext.sessionId).toBeDefined();
      expect(speechInsights.speechGuidance).toContain('warm');

      // Format for LLM
      const formattedSpeech = manager.formatSpeechInsightsForPrompt(speechInsights);
      const combinedContext = `${promptContext.formattedForPrompt}\n\n${formattedSpeech}`;

      expect(combinedContext).toContain('[VOICE INSIGHTS]');
    });
  });

  describe('Session Management', () => {
    it('should maintain speech insights per session', () => {
      const session1 = createSessionId('session-1');
      const session2 = createSessionId('session-2');

      const manager1 = getContextManager(session1);
      const manager2 = getContextManager(session2);

      // Each manager should be independent
      expect(manager1.getSessionId()).toBe(session1);
      expect(manager2.getSessionId()).toBe(session2);

      // Clean up
      removeContextManager(session1);
      removeContextManager(session2);
    });
  });
});
