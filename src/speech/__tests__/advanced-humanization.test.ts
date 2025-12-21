/**
 * Advanced Humanization Tests
 *
 * Tests for the research-backed humanization features:
 * - Emotion mapping
 * - Natural fillers
 * - Breath group pacing
 * - Enhanced backchanneling
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { EmotionResult } from '../../intelligence/emotion-detector.js';
import {
  addBreathGroupPauses,
  ALL_CARTESIA_EMOTIONS,
  analyzeRhythm,
  applyRhythmVariations,
  CARTESIA_EMOTIONS,
  getEmotionTransition,
  humanizeText,
  injectNaturalFillers,
  mapContextToEmotion,
  type EmotionContext,
} from '../advanced-humanization.js';
import {
  BACKCHANNEL_LIBRARY,
  EnhancedBackchannelingEngine,
  getEnhancedBackchannelingEngine,
  getQuickBackchannel,
} from '../enhanced-backchanneling.js';

// Helper to create a mock EmotionResult with all required fields
function mockEmotion(overrides: Partial<EmotionResult> = {}): EmotionResult {
  return {
    primary: 'neutral',
    intensity: 0.3,
    valence: 'neutral',
    distressLevel: 0,
    confidence: 0.5,
    markers: [],
    suggestedTone: 'friendly',
    ...overrides,
  };
}

// ============================================================================
// EMOTION MAPPING TESTS
// ============================================================================

describe('Emotion Mapping', () => {
  describe('mapContextToEmotion', () => {
    it('should return sympathetic for supportive intent with sad user', () => {
      const context: EmotionContext = {
        agentIntent: 'supportive',
        userEmotion: 'sad',
        topicWeight: 'medium',
        relationshipStage: 'friend',
      };
      expect(mapContextToEmotion(context)).toBe('sympathetic');
    });

    it('should return calm for supportive intent with anxious user', () => {
      const context: EmotionContext = {
        agentIntent: 'supportive',
        userEmotion: 'anxious',
        topicWeight: 'medium',
        relationshipStage: 'friend',
      };
      expect(mapContextToEmotion(context)).toBe('calm');
    });

    it('should return curious for thinking intent', () => {
      const context: EmotionContext = {
        agentIntent: 'thinking',
        topicWeight: 'medium',
        relationshipStage: 'acquaintance',
      };
      expect(mapContextToEmotion(context)).toBe('curious');
    });

    it('should return triumphant for celebrating with excited user', () => {
      const context: EmotionContext = {
        agentIntent: 'celebrating',
        userEmotion: 'excited',
        topicWeight: 'light',
        relationshipStage: 'friend',
      };
      expect(mapContextToEmotion(context)).toBe('triumphant');
    });

    it('should return nostalgic for remembering intent', () => {
      const context: EmotionContext = {
        agentIntent: 'remembering',
        topicWeight: 'medium',
        relationshipStage: 'trusted_advisor',
      };
      expect(mapContextToEmotion(context)).toBe('nostalgic');
    });

    it('should return hesitant for uncertain intent', () => {
      const context: EmotionContext = {
        agentIntent: 'uncertain',
        topicWeight: 'medium',
        relationshipStage: 'acquaintance',
      };
      expect(mapContextToEmotion(context)).toBe('hesitant');
    });

    it('should return apologetic for apologizing intent', () => {
      const context: EmotionContext = {
        agentIntent: 'apologizing',
        topicWeight: 'medium',
        relationshipStage: 'friend',
      };
      expect(mapContextToEmotion(context)).toBe('apologetic');
    });

    it('should prioritize heavy topics over intent', () => {
      const context: EmotionContext = {
        agentIntent: 'celebrating', // Would normally be excited
        userEmotion: 'sad',
        topicWeight: 'heavy', // But heavy topic overrides
        relationshipStage: 'friend',
      };
      expect(mapContextToEmotion(context)).toBe('sympathetic');
    });
  });

  describe('getEmotionTransition', () => {
    it('should return single step for same emotion', () => {
      const transitions = getEmotionTransition('happy', 'happy');
      expect(transitions).toHaveLength(1);
      expect(transitions[0].emotion).toBe('happy');
    });

    it('should return single step when no previous emotion', () => {
      const transitions = getEmotionTransition(null, 'curious');
      expect(transitions).toHaveLength(1);
      expect(transitions[0].emotion).toBe('curious');
    });

    it('should include pause for emotion transitions within same group', () => {
      const transitions = getEmotionTransition('affectionate', 'sympathetic');
      expect(transitions.some((t) => t.breakBefore.includes('break'))).toBe(true);
    });
  });

  describe('Cartesia emotion coverage', () => {
    it('should have 50+ emotions total', () => {
      expect(ALL_CARTESIA_EMOTIONS.length).toBeGreaterThan(45);
    });

    it('should have positive emotions', () => {
      expect(CARTESIA_EMOTIONS.positive).toContain('happy');
      expect(CARTESIA_EMOTIONS.positive).toContain('affectionate');
      expect(CARTESIA_EMOTIONS.positive).toContain('triumphant');
    });

    it('should have nuanced emotions', () => {
      expect(CARTESIA_EMOTIONS.nuanced).toContain('hesitant');
      expect(CARTESIA_EMOTIONS.nuanced).toContain('nostalgic');
      expect(CARTESIA_EMOTIONS.nuanced).toContain('apologetic');
    });
  });
});

// ============================================================================
// NATURAL FILLER TESTS
// ============================================================================

describe('Natural Fillers', () => {
  describe('injectNaturalFillers', () => {
    it('should not modify very short text', () => {
      const shortText = 'Hello there!';
      const result = injectNaturalFillers(shortText);
      expect(result).toBe(shortText);
    });

    it('should not add fillers to text with emotion tags', () => {
      const taggedText = '<emotion value="happy"/>This is a longer response with emotion tags.';
      const result = injectNaturalFillers(taggedText);
      expect(result).toBe(taggedText);
    });

    it('should return text unchanged (filler injection deprecated)', () => {
      // DEPRECATED: Static filler injection has been replaced by LLM behavioral guidance.
      // See: src/intelligence/context-builders/dynamic-speech-guidance.ts
      //
      // The LLM now generates natural speech patterns based on context,
      // rather than having fillers randomly injected.
      const longText =
        'This is a much longer response. I think we should consider the implications. The thing is, there are many factors to consider here.';
      const result = injectNaturalFillers(longText, { probability: 0.8, maxPerResponse: 2 });

      // Function now returns text unchanged
      expect(result).toBe(longText);
    });

    it('should return text unchanged regardless of config (deprecated)', () => {
      // DEPRECATED: Filler injection no longer happens
      const longText =
        'First sentence here. Second sentence here. Third sentence here. Fourth sentence here. Fifth sentence here.';
      const result = injectNaturalFillers(longText, {
        probability: 1.0,
        maxPerResponse: 1,
      });

      // Function returns text unchanged
      expect(result).toBe(longText);
    });
  });
});

// ============================================================================
// BREATH GROUP PACING TESTS
// ============================================================================

describe('Breath Group Pacing', () => {
  describe('addBreathGroupPauses', () => {
    it('should add pause after sentence endings', () => {
      const text = 'First sentence. Second sentence.';
      const result = addBreathGroupPauses(text);
      expect(result).toContain('<break time=');
    });

    it('should add pause before conjunctions', () => {
      const text = 'I wanted to go but I was tired.';
      const result = addBreathGroupPauses(text);
      expect(result).toMatch(/<break time="\d+ms"\/>\s*but/);
    });

    it('should add pause before "however"', () => {
      const text = 'It seemed easy however it was complex.';
      const result = addBreathGroupPauses(text);
      expect(result).toMatch(/<break time="\d+ms"\/>\s*however/i);
    });

    it('should not add excessive breaks', () => {
      const text = 'Short text.';
      const result = addBreathGroupPauses(text);
      // Should not have multiple consecutive breaks
      expect(result).not.toMatch(/(<break[^>]+>){3,}/);
    });

    it('should respect disabled config', () => {
      const text = 'First sentence. Second sentence.';
      const result = addBreathGroupPauses(text, {
        enabled: false,
        shortPause: 120,
        mediumPause: 220,
        longPause: 350,
      });
      expect(result).toBe(text);
    });
  });
});

// ============================================================================
// RHYTHM VARIATION TESTS
// ============================================================================

describe('Rhythm Variation', () => {
  describe('analyzeRhythm', () => {
    it('should slow down for important content', () => {
      const text = 'This is important information.';
      const variations = analyzeRhythm(text);
      expect(variations.some((v) => v.speedRatio < 1.0)).toBe(true);
    });

    it('should slow down for emotional content', () => {
      const text = 'I feel like this matters a lot.';
      const variations = analyzeRhythm(text);
      expect(variations.some((v) => v.speedRatio < 1.0)).toBe(true);
    });

    it('should speed up for examples', () => {
      const text = 'For example, you could try this approach.';
      const variations = analyzeRhythm(text);
      expect(variations.some((v) => v.speedRatio > 1.0)).toBe(true);
    });

    it('should slow down for conclusions', () => {
      const text = 'So in conclusion, this is what we learned.';
      const variations = analyzeRhythm(text);
      expect(variations.some((v) => v.speedRatio < 1.0)).toBe(true);
    });
  });

  describe('applyRhythmVariations', () => {
    it('should add speed tags for varied rhythms', () => {
      const variations = [
        { speedRatio: 0.9, content: 'Slow part.' },
        { speedRatio: 1.0, content: 'Normal part.' },
        { speedRatio: 1.1, content: 'Fast part.' },
      ];
      const result = applyRhythmVariations(variations);
      expect(result).toContain('<speed ratio="0.90"/>');
      expect(result).toContain('<speed ratio="1.10"/>');
      expect(result).toContain('Normal part'); // No tag for 1.0
    });
  });
});

// ============================================================================
// MAIN PIPELINE TESTS
// ============================================================================

describe('humanizeText pipeline', () => {
  it('should add emotion when context provided', () => {
    const text = 'Hello, how are you today?';
    const result = humanizeText(text, {
      emotionContext: {
        agentIntent: 'supportive',
        topicWeight: 'light',
        relationshipStage: 'friend',
      },
    });
    expect(result).toContain('<emotion value=');
  });

  it('should add breath pauses by default', () => {
    const text = 'First thought. Second thought. Third thought.';
    const result = humanizeText(text);
    expect(result).toContain('<break time=');
  });

  it('should respect disabled options', () => {
    const text = 'Hello there. How are you?';
    const result = humanizeText(text, {
      fillers: false,
      breathGroups: false,
      rhythmVariation: false,
      emotionMapping: false,
    });
    // Should have minimal modifications
    expect(result).not.toContain('Hmm');
    expect(result).not.toContain('Um');
  });
});

// ============================================================================
// ENHANCED BACKCHANNELING TESTS
// ============================================================================

describe('Enhanced Backchanneling', () => {
  let engine: EnhancedBackchannelingEngine;

  beforeEach(() => {
    engine = new EnhancedBackchannelingEngine();
  });

  describe('EnhancedBackchannelingEngine', () => {
    it("should not backchannel if user hasn't spoken long enough", () => {
      const decision = engine.decide({
        userSpeechDuration: 1000, // Only 1 second
        currentPauseDuration: 1000,
        userEmotion: mockEmotion(),
        topicWeight: 'medium',
        backchannelCountThisTurn: 0,
      });
      expect(decision.shouldEmit).toBe(false);
    });

    it('should not backchannel if pause is too short', () => {
      const decision = engine.decide({
        userSpeechDuration: 5000, // 5 seconds
        currentPauseDuration: 200, // Only 200ms pause
        userEmotion: mockEmotion(),
        topicWeight: 'medium',
        backchannelCountThisTurn: 0,
      });
      expect(decision.shouldEmit).toBe(false);
    });

    it('should backchannel after sufficient speech and pause', () => {
      const decision = engine.decide({
        userSpeechDuration: 5000, // 5 seconds
        currentPauseDuration: 1000, // 1 second pause
        userEmotion: mockEmotion(),
        topicWeight: 'medium',
        backchannelCountThisTurn: 0,
      });
      expect(decision.shouldEmit).toBe(true);
      expect(decision.phrase).toBeTruthy();
      expect(decision.ssml).toBeTruthy();
    });

    it('should not exceed max backchannels per turn', () => {
      const decision = engine.decide({
        userSpeechDuration: 5000,
        currentPauseDuration: 1000,
        userEmotion: mockEmotion(),
        topicWeight: 'medium',
        backchannelCountThisTurn: 5, // Already at max
      });
      expect(decision.shouldEmit).toBe(false);
    });

    it('should use empathy type for high distress', () => {
      const decision = engine.decide({
        userSpeechDuration: 5000,
        currentPauseDuration: 1500,
        userEmotion: mockEmotion({
          primary: 'sadness',
          intensity: 0.7,
          distressLevel: 0.7,
          valence: 'negative',
        }),
        topicWeight: 'heavy',
        backchannelCountThisTurn: 0,
      });
      expect(decision.shouldEmit).toBe(true);
      expect(decision.type).toBe('empathy');
    });

    it('should reset turn count on newTurn', () => {
      // Fill up backchannels
      for (let i = 0; i < 3; i++) {
        engine.decide({
          userSpeechDuration: 10000,
          currentPauseDuration: 2000,
          userEmotion: mockEmotion(),
          topicWeight: 'light',
          backchannelCountThisTurn: i,
        });
      }

      engine.newTurn();

      // Should be able to backchannel again
      const decision = engine.decide({
        userSpeechDuration: 5000,
        currentPauseDuration: 1000,
        userEmotion: mockEmotion(),
        topicWeight: 'medium',
        backchannelCountThisTurn: 0,
      });
      expect(decision.shouldEmit).toBe(true);
    });
  });

  describe('getQuickBackchannel', () => {
    it('should return SSML with volume control', () => {
      const result = getQuickBackchannel(0.2);
      expect(result).toContain('<volume ratio=');
    });

    it('should return empathy for high distress', () => {
      const result = getQuickBackchannel(0.7);
      // Should be one of the empathy phrases
      const empathyPhrases = BACKCHANNEL_LIBRARY.empathy;
      const hasEmpathy = empathyPhrases.some((p) => result.includes(p));
      expect(hasEmpathy).toBe(true);
    });
  });

  describe('session management', () => {
    it('should return same engine for same session', () => {
      const engine1 = getEnhancedBackchannelingEngine('test-session-1');
      const engine2 = getEnhancedBackchannelingEngine('test-session-1');
      expect(engine1).toBe(engine2);
    });

    it('should return different engines for different sessions', () => {
      const engine1 = getEnhancedBackchannelingEngine('test-session-a');
      const engine2 = getEnhancedBackchannelingEngine('test-session-b');
      expect(engine1).not.toBe(engine2);
    });
  });
});
