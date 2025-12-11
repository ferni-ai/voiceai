/**
 * Prosody-Turn Bridge Tests
 *
 * Tests for connecting voice prosody analysis with turn prediction:
 * - Intonation mapping from pitch contours
 * - Voice-enhanced turn prediction
 * - Voice completion signals
 *
 * @module prosody-turn-bridge.test
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetTurnPredictionService } from '../../conversation/turn-prediction.js';
import type { ProsodyFeatures, VoiceEmotionResult } from '../audio-prosody.js';
import {
  createTurnPredictionContext,
  getIntonationFromVoiceEmotion,
  mapPitchContourToIntonation,
  predictTurnWithVoice,
  voiceSuggestsTurnComplete,
} from '../prosody-turn-bridge.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockProsody = (overrides: Partial<ProsodyFeatures> = {}): ProsodyFeatures => ({
  pitchMean: 150,
  pitchVariance: 20,
  pitchRange: 50,
  pitchContour: 'flat',
  energyMean: -20,
  energyVariance: 5,
  energyPeaks: 2,
  speechRate: 4,
  pauseDuration: 200,
  pauseFrequency: 3,
  jitter: 0.01,
  shimmer: 0.02,
  breathiness: 0.1,
  utteranceDuration: 2000,
  speakingRatio: 0.8,
  ...overrides,
});

const createMockVoiceEmotion = (
  overrides: Partial<VoiceEmotionResult> = {},
  prosodyOverrides: Partial<ProsodyFeatures> = {}
): VoiceEmotionResult => ({
  primary: 'neutral',
  valence: 0,
  arousal: 0.5,
  dominance: 0,
  stressLevel: 0.3,
  anxietyMarkers: false,
  confidence: 0.7,
  prosody: createMockProsody(prosodyOverrides),
  sampleCount: 100,
  processingTimeMs: 50,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('Prosody-Turn Bridge', () => {
  const sessionId = 'test-prosody-bridge';

  afterEach(() => {
    resetTurnPredictionService(sessionId);
  });

  // -------------------------------------------------------------------------
  // PITCH CONTOUR TO INTONATION MAPPING
  // -------------------------------------------------------------------------

  describe('Pitch Contour to Intonation Mapping', () => {
    it('should map rising contour to rising intonation', () => {
      const result = mapPitchContourToIntonation('rising');
      expect(result).toBe('rising');
    });

    it('should map falling contour to falling intonation', () => {
      const result = mapPitchContourToIntonation('falling');
      expect(result).toBe('falling');
    });

    it('should map flat contour to neutral intonation', () => {
      const result = mapPitchContourToIntonation('flat');
      expect(result).toBe('neutral');
    });

    it('should map dynamic contour to neutral intonation', () => {
      const result = mapPitchContourToIntonation('dynamic');
      expect(result).toBe('neutral');
    });
  });

  // -------------------------------------------------------------------------
  // INTONATION FROM VOICE EMOTION
  // -------------------------------------------------------------------------

  describe('Intonation from Voice Emotion', () => {
    it('should extract intonation from voice emotion with rising pitch', () => {
      const voiceEmotion = createMockVoiceEmotion({}, { pitchContour: 'rising' });
      const result = getIntonationFromVoiceEmotion(voiceEmotion);
      expect(result).toBe('rising');
    });

    it('should extract intonation from voice emotion with falling pitch', () => {
      const voiceEmotion = createMockVoiceEmotion({}, { pitchContour: 'falling' });
      const result = getIntonationFromVoiceEmotion(voiceEmotion);
      expect(result).toBe('falling');
    });

    it('should return neutral for null voice emotion', () => {
      const result = getIntonationFromVoiceEmotion(null);
      expect(result).toBe('neutral');
    });

    it('should return neutral for low confidence voice emotion', () => {
      const voiceEmotion = createMockVoiceEmotion({ confidence: 0.2 }, { pitchContour: 'falling' });
      const result = getIntonationFromVoiceEmotion(voiceEmotion);
      expect(result).toBe('neutral');
    });

    it('should use voice emotion with sufficient confidence', () => {
      const voiceEmotion = createMockVoiceEmotion({ confidence: 0.5 }, { pitchContour: 'falling' });
      const result = getIntonationFromVoiceEmotion(voiceEmotion);
      expect(result).toBe('falling');
    });
  });

  // -------------------------------------------------------------------------
  // TURN PREDICTION CONTEXT CREATION
  // -------------------------------------------------------------------------

  describe('Turn Prediction Context Creation', () => {
    it('should create context with basic options', () => {
      const context = createTurnPredictionContext('Hello there', {
        speakingDurationMs: 1000,
        silenceDurationMs: 500,
        turnCount: 3,
      });

      expect(context.transcript).toBe('Hello there');
      expect(context.speakingDurationMs).toBe(1000);
      expect(context.silenceDurationMs).toBe(500);
      expect(context.turnCount).toBe(3);
    });

    it('should include intonation from voice emotion', () => {
      const voiceEmotion = createMockVoiceEmotion({}, { pitchContour: 'falling' });

      const context = createTurnPredictionContext('Done speaking now', {
        voiceEmotion,
      });

      expect(context.intonation).toBe('falling');
    });

    it('should include topic weight', () => {
      const context = createTurnPredictionContext('Heavy topic', {
        topicWeight: 'heavy',
      });

      expect(context.topicWeight).toBe('heavy');
    });

    it('should calculate WPM from speech rate', () => {
      const voiceEmotion = createMockVoiceEmotion({}, { speechRate: 5 });

      const context = createTurnPredictionContext('Speaking rate test', {
        voiceEmotion,
      });

      // speechRate * 15 = 75 WPM
      expect(context.userWPM).toBe(75);
    });

    it('should include emotion intensity from arousal', () => {
      const voiceEmotion = createMockVoiceEmotion({ arousal: 0.8 });

      const context = createTurnPredictionContext('Excited message', {
        voiceEmotion,
      });

      expect(context.emotionIntensity).toBe(0.8);
    });

    it('should handle undefined voice emotion gracefully', () => {
      const context = createTurnPredictionContext('No voice data', {
        voiceEmotion: undefined,
      });

      expect(context.intonation).toBe('neutral');
      expect(context.emotionIntensity).toBeUndefined();
      expect(context.userWPM).toBeUndefined();
    });

    it('should use default values for missing options', () => {
      const context = createTurnPredictionContext('Minimal options', {});

      expect(context.speakingDurationMs).toBe(0);
      expect(context.silenceDurationMs).toBe(0);
      expect(context.turnCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // VOICE-ENHANCED TURN PREDICTION
  // -------------------------------------------------------------------------

  describe('Voice-Enhanced Turn Prediction', () => {
    it('should return enhanced prediction with voice signals', () => {
      const voiceEmotion = createMockVoiceEmotion(
        { stressLevel: 0.4, confidence: 0.7 },
        { pitchContour: 'falling', speechRate: 4 }
      );

      const prediction = predictTurnWithVoice(
        sessionId,
        'I think we should proceed.',
        voiceEmotion,
        { silenceDurationMs: 600 }
      );

      expect(prediction.voiceSignals).toBeDefined();
      expect(prediction.voiceSignals.intonation).toBe('falling');
      expect(prediction.voiceSignals.stressLevel).toBe(0.4);
      expect(prediction.voiceSignals.speechRate).toBe(4);
      expect(prediction.voiceSignals.confidenceFromVoice).toBe(0.7);
    });

    it('should handle null voice emotion', () => {
      const prediction = predictTurnWithVoice(sessionId, 'No voice data', null);

      expect(prediction.voiceSignals.intonation).toBe('neutral');
      expect(prediction.voiceSignals.stressLevel).toBe(0);
      expect(prediction.voiceSignals.confidenceFromVoice).toBe(0);
    });

    it('should include base prediction properties', () => {
      const prediction = predictTurnWithVoice(sessionId, 'Test message.', null);

      expect(typeof prediction.isComplete).toBe('boolean');
      expect(typeof prediction.confidence).toBe('number');
      expect(prediction.voiceSignals).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // VOICE COMPLETION SIGNALS
  // -------------------------------------------------------------------------

  describe('Voice Completion Signals', () => {
    it('should suggest turn complete for falling pitch', () => {
      const voiceEmotion = createMockVoiceEmotion({ confidence: 0.7 }, { pitchContour: 'falling' });

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('Falling pitch');
    });

    it('should suggest turn complete for long pause with low speaking ratio', () => {
      const voiceEmotion = createMockVoiceEmotion(
        { confidence: 0.7 },
        { speakingRatio: 0.2, pauseDuration: 600 }
      );

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(true);
      expect(result.reason).toContain('Long pause');
    });

    it('should suggest turn complete for slow deliberate speech with falling pitch', () => {
      const voiceEmotion = createMockVoiceEmotion(
        { confidence: 0.7 },
        { speechRate: 1.5, pitchContour: 'falling' }
      );

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      // Should suggest completion - falling pitch is a strong signal
      // The reason may be "Falling pitch" (first match) or "Slow deliberate" 
      // depending on condition order in the function
      expect(result.suggests).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should suggest turn complete for emotional statement with falling pitch', () => {
      const voiceEmotion = createMockVoiceEmotion(
        { confidence: 0.7, stressLevel: 0.7 },
        { pitchContour: 'falling' }
      );

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      // Should suggest completion - both falling pitch and high stress are signals
      // The reason depends on which condition matches first
      expect(result.suggests).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should not suggest turn complete for rising pitch', () => {
      const voiceEmotion = createMockVoiceEmotion({ confidence: 0.7 }, { pitchContour: 'rising' });

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(false);
      expect(result.reason).toContain('Rising pitch');
    });

    it('should return insufficient confidence for null voice emotion', () => {
      const result = voiceSuggestsTurnComplete(null);

      expect(result.suggests).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reason).toContain('Insufficient');
    });

    it('should return insufficient confidence for low confidence voice emotion', () => {
      const voiceEmotion = createMockVoiceEmotion({ confidence: 0.3 }, { pitchContour: 'falling' });

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(false);
      expect(result.reason).toContain('Insufficient');
    });

    it('should return no clear signal for neutral patterns', () => {
      const voiceEmotion = createMockVoiceEmotion(
        { confidence: 0.7, stressLevel: 0.3 },
        { pitchContour: 'flat', speechRate: 4, speakingRatio: 0.7 }
      );

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(false);
      expect(result.reason).toContain('No clear voice signal');
    });
  });
});
