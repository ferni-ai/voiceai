/**
 * Voice-Text Mismatch Detection Tests
 *
 * Tests for detecting incongruence between what users say
 * and how they say it (voice emotion vs text sentiment).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  detectMismatch,
  buildMismatchGuidance,
  type MismatchResult,
  type MismatchType,
} from '../intelligence/detectors/voice-mismatch.js';

import type { VoiceEmotionResult } from '../speech/audio-prosody.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock the emotion detection service
vi.mock('../services/emotion-detection.js', () => ({
  detectEmotion: vi.fn((text: string) => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('happy') || lowerText.includes('excited')) {
      return { primary: 'joy', confidence: 0.8 };
    }
    if (lowerText.includes('sad') || lowerText.includes('upset')) {
      return { primary: 'sadness', confidence: 0.8 };
    }
    if (lowerText.includes("i'm fine") || lowerText.includes("i'm okay")) {
      return { primary: 'neutral', confidence: 0.6 };
    }
    return { primary: 'neutral', confidence: 0.5 };
  }),
}));

// Mock cross-persona insights
vi.mock('../services/cross-persona-insights.js', () => ({
  recordInsight: vi.fn(),
}));

// ============================================================================
// HELPERS
// ============================================================================

function createVoiceEmotion(overrides: Partial<VoiceEmotionResult> = {}): VoiceEmotionResult {
  return {
    primary: 'neutral',
    confidence: 0.7,
    arousal: 0.5,
    valence: 0,
    stressLevel: 0.3,
    anxietyMarkers: false,
    ...overrides,
  } as VoiceEmotionResult;
}

// ============================================================================
// DETECTION TESTS
// ============================================================================

describe('detectMismatch', () => {
  describe('insufficient data cases', () => {
    it('should return no mismatch when voice emotion is null', () => {
      const result = detectMismatch("I'm fine", null);

      expect(result.hasMismatch).toBe(false);
      expect(result.type).toBe('none');
      expect(result.interpretation).toContain('Insufficient');
    });

    it('should return no mismatch when voice confidence is too low', () => {
      const voiceEmotion = createVoiceEmotion({ confidence: 0.3 });
      const result = detectMismatch("I'm fine", voiceEmotion);

      expect(result.hasMismatch).toBe(false);
      expect(result.type).toBe('none');
    });
  });

  describe('masking_negative detection', () => {
    it('should detect "I\'m fine" with anxious voice', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'anxious',
        confidence: 0.7,
        stressLevel: 0.5,
      });

      const result = detectMismatch("I'm fine, really", voiceEmotion);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('masking_negative');
      expect(result.voiceEmotion).toBe('anxious');
    });

    it('should detect "I\'m okay" with sad voice', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'sad',
        confidence: 0.8,
        stressLevel: 0.4,
      });

      const result = detectMismatch("I'm okay", voiceEmotion);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('masking_negative');
    });

    it('should detect "no big deal" with angry voice', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'angry',
        confidence: 0.7,
      });

      const result = detectMismatch("It's no big deal anyway", voiceEmotion);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('masking_negative');
    });

    it('should detect masking phrases with fearful voice', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'fearful',
        confidence: 0.75,
      });

      const result = detectMismatch('Whatever, it is what it is', voiceEmotion);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('masking_negative');
    });

    it('should set shouldSurface based on confidence and stress', () => {
      const highStress = createVoiceEmotion({
        primary: 'distressed',
        confidence: 0.8,
        stressLevel: 0.6,
      });

      const result = detectMismatch("I'm fine", highStress);

      expect(result.hasMismatch).toBe(true);
      expect(result.shouldSurface).toBe(true);
      expect(result.surfacePhrase).toBeDefined();
    });
  });

  describe('contradicting detection', () => {
    it('should detect positive text with negative voice', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'sad',
        confidence: 0.7,
      });

      const result = detectMismatch("I'm so happy about this!", voiceEmotion, {
        primary: 'joy',
        confidence: 0.8,
      });

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('contradicting');
      expect(result.textEmotion).toBe('joy');
      expect(result.voiceEmotion).toBe('sad');
    });

    it('should include interpretation explaining the contradiction', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'frustrated',
        confidence: 0.7,
      });

      const result = detectMismatch("I'm excited!", voiceEmotion, {
        primary: 'anticipation',
        confidence: 0.8,
      });

      expect(result.interpretation).toContain('anticipation');
      expect(result.interpretation).toContain('frustrated');
    });
  });

  describe('understating_positive detection', () => {
    it('should detect neutral text with excited voice', () => {
      const voiceEmotion = createVoiceEmotion({
        primary: 'excited',
        confidence: 0.7,
        arousal: 0.7,
      });

      const result = detectMismatch('It was okay I guess', voiceEmotion, {
        primary: 'neutral',
        confidence: 0.6,
      });

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('understating_positive');
    });

    it('should require high arousal for understating detection', () => {
      const lowArousal = createVoiceEmotion({
        primary: 'happy',
        confidence: 0.7,
        arousal: 0.3, // Low arousal
      });

      const result = detectMismatch('It was okay', lowArousal, {
        primary: 'neutral',
        confidence: 0.6,
      });

      expect(result.type).not.toBe('understating_positive');
    });
  });

  describe('suppressing detection', () => {
    it('should detect neutral text with high stress voice', () => {
      const highStress = createVoiceEmotion({
        primary: 'neutral',
        confidence: 0.7,
        stressLevel: 0.7,
      });

      const result = detectMismatch('Just another day at work', highStress, {
        primary: 'neutral',
        confidence: 0.5,
      });

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('suppressing');
    });

    it('should set shouldSurface for very high stress', () => {
      const veryHighStress = createVoiceEmotion({
        primary: 'neutral',
        confidence: 0.7,
        stressLevel: 0.85,
      });

      const result = detectMismatch('Nothing special going on', veryHighStress, {
        primary: 'neutral',
        confidence: 0.5,
      });

      expect(result.shouldSurface).toBe(true);
    });
  });

  describe('anxiety markers detection', () => {
    it('should detect anxiety markers with masking phrases', () => {
      const anxiousVoice = createVoiceEmotion({
        primary: 'neutral',
        confidence: 0.7,
        anxietyMarkers: true,
      });

      const result = detectMismatch("I'm fine", anxiousVoice);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('masking_negative');
      expect(result.voiceEmotion).toBe('anxious');
    });

    it('should detect anxiety markers with neutral text', () => {
      const anxiousVoice = createVoiceEmotion({
        primary: 'neutral',
        confidence: 0.65,
        anxietyMarkers: true,
      });

      const result = detectMismatch('Just thinking about things', anxiousVoice, {
        primary: 'neutral',
        confidence: 0.5,
      });

      expect(result.hasMismatch).toBe(true);
      expect(result.interpretation).toContain('anxiety');
    });
  });

  describe('no mismatch cases', () => {
    it('should return no mismatch when text and voice align', () => {
      const happyVoice = createVoiceEmotion({
        primary: 'happy',
        confidence: 0.8,
        arousal: 0.4,
      });

      const result = detectMismatch("I'm feeling great today!", happyVoice, {
        primary: 'joy',
        confidence: 0.8,
      });

      expect(result.hasMismatch).toBe(false);
      expect(result.type).toBe('none');
    });

    it('should return no mismatch for neutral alignment', () => {
      const neutralVoice = createVoiceEmotion({
        primary: 'neutral',
        confidence: 0.6,
        stressLevel: 0.2,
        anxietyMarkers: false,
      });

      const result = detectMismatch('The weather is nice today', neutralVoice, {
        primary: 'neutral',
        confidence: 0.5,
      });

      expect(result.hasMismatch).toBe(false);
    });
  });
});

// ============================================================================
// GUIDANCE BUILDER TESTS
// ============================================================================

describe('buildMismatchGuidance', () => {
  it('should return null for no mismatch', () => {
    const noMismatch: MismatchResult = {
      hasMismatch: false,
      confidence: 0,
      textEmotion: 'neutral',
      voiceEmotion: 'neutral',
      type: 'none',
      interpretation: 'No mismatch',
      suggestedApproach: '',
      shouldSurface: false,
    };

    const result = buildMismatchGuidance(noMismatch);

    expect(result).toBeNull();
  });

  it('should include interpretation in guidance', () => {
    const mismatch: MismatchResult = {
      hasMismatch: true,
      confidence: 0.8,
      textEmotion: 'neutral',
      voiceEmotion: 'anxious',
      type: 'masking_negative',
      interpretation: 'User is masking anxiety',
      suggestedApproach: 'Be gentle and supportive',
      shouldSurface: false,
    };

    const result = buildMismatchGuidance(mismatch);

    expect(result).toContain('[VOICE INSIGHT]');
    expect(result).toContain('User is masking anxiety');
  });

  it('should include approach in guidance', () => {
    const mismatch: MismatchResult = {
      hasMismatch: true,
      confidence: 0.7,
      textEmotion: 'joy',
      voiceEmotion: 'sad',
      type: 'contradicting',
      interpretation: 'Text and voice contradict',
      suggestedApproach: 'Explore gently',
      shouldSurface: false,
    };

    const result = buildMismatchGuidance(mismatch);

    expect(result).toContain('Approach:');
    expect(result).toContain('Explore gently');
  });

  it('should include surface phrase when shouldSurface is true', () => {
    const mismatch: MismatchResult = {
      hasMismatch: true,
      confidence: 0.8,
      textEmotion: 'neutral',
      voiceEmotion: 'anxious',
      type: 'masking_negative',
      interpretation: 'Masking anxiety',
      suggestedApproach: 'Be supportive',
      shouldSurface: true,
      surfacePhrase: 'I sense something might be on your mind',
    };

    const result = buildMismatchGuidance(mismatch);

    expect(result).toContain('you might say');
    expect(result).toContain('I sense something might be on your mind');
  });

  it('should not include surface phrase when shouldSurface is false', () => {
    const mismatch: MismatchResult = {
      hasMismatch: true,
      confidence: 0.6,
      textEmotion: 'neutral',
      voiceEmotion: 'sad',
      type: 'suppressing',
      interpretation: 'Suppressing emotion',
      suggestedApproach: 'Create space',
      shouldSurface: false,
      surfacePhrase: 'Some phrase',
    };

    const result = buildMismatchGuidance(mismatch);

    expect(result).not.toContain('you might say');
  });
});

// ============================================================================
// MISMATCH RESULT STRUCTURE TESTS
// ============================================================================

describe('MismatchResult structure', () => {
  it('should have all required fields for mismatch', () => {
    const voiceEmotion = createVoiceEmotion({
      primary: 'anxious',
      confidence: 0.8,
      stressLevel: 0.5,
    });

    const result = detectMismatch("I'm fine", voiceEmotion);

    expect(result).toHaveProperty('hasMismatch');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('textEmotion');
    expect(result).toHaveProperty('voiceEmotion');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('interpretation');
    expect(result).toHaveProperty('suggestedApproach');
    expect(result).toHaveProperty('shouldSurface');
  });

  it('should have confidence between 0 and 1', () => {
    const voiceEmotion = createVoiceEmotion({
      primary: 'sad',
      confidence: 0.9,
    });

    const result = detectMismatch("I'm okay", voiceEmotion);

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should have valid mismatch type', () => {
    const validTypes: MismatchType[] = [
      'masking_negative',
      'understating_positive',
      'deflecting',
      'suppressing',
      'contradicting',
      'incongruent',
      'none',
    ];

    const voiceEmotion = createVoiceEmotion({
      primary: 'anxious',
      confidence: 0.7,
    });

    const result = detectMismatch("I'm fine", voiceEmotion);

    expect(validTypes).toContain(result.type);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('detectMismatch integration', () => {
  it('should handle realistic "I\'m fine" scenario', () => {
    const voiceEmotion = createVoiceEmotion({
      primary: 'distressed',
      confidence: 0.75,
      stressLevel: 0.6,
      arousal: 0.7,
    });

    const result = detectMismatch("I'm fine, just tired. Could be worse, right?", voiceEmotion);

    expect(result.hasMismatch).toBe(true);
    expect(result.type).toBe('masking_negative');
    expect(result.shouldSurface).toBe(true);
    expect(result.suggestedApproach).toBeDefined();
    expect(result.suggestedApproach.length).toBeGreaterThan(0);
  });

  it('should handle subtle emotional suppression', () => {
    const voiceEmotion = createVoiceEmotion({
      primary: 'neutral',
      confidence: 0.65,
      stressLevel: 0.75,
      anxietyMarkers: false,
    });

    const result = detectMismatch('Things are going pretty normally', voiceEmotion, {
      primary: 'neutral',
      confidence: 0.5,
    });

    expect(result.hasMismatch).toBe(true);
    expect(result.type).toBe('suppressing');
  });

  it('should handle genuine positive alignment', () => {
    const voiceEmotion = createVoiceEmotion({
      primary: 'joy',
      confidence: 0.85,
      arousal: 0.7,
      valence: 0.8,
      stressLevel: 0.1,
    });

    const result = detectMismatch("This is the best news I've gotten all week!", voiceEmotion, {
      primary: 'joy',
      confidence: 0.9,
    });

    // Should NOT detect mismatch when emotions align
    expect(result.hasMismatch).toBe(false);
  });
});
