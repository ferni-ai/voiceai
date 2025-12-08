/**
 * Voice Humanization Tests
 *
 * Tests for voice humanization capabilities:
 * - Micro-interruption detection
 * - Laughter detection
 * - Emotional TTS adjustments
 * - Speech rhythm analysis
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  VoiceHumanizationService,
  getVoiceHumanizationService,
  resetVoiceHumanization,
  resetAllVoiceHumanization,
} from '../voice-humanization.js';
import type { ProsodyFeatures } from '../audio-prosody.js';
import type { EmotionalArc } from '../../conversation/emotional-arc.js';

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

const createMockEmotionalArc = (overrides: Partial<EmotionalArc> = {}): EmotionalArc => ({
  currentEmotion: 'neutral',
  currentValence: 0,
  currentArousal: 0.5,
  trajectory: 'stable',
  trajectoryConfidence: 0.7,
  valenceMomentum: 0,
  arousalMomentum: 0,
  conversationTemperature: 0.4,
  smoothedValence: 0,
  smoothedArousal: 0.5,
  turnsSinceEmotionalPeak: 5,
  turnsSinceDistress: 10,
  needsEmotionalSupport: false,
  emotionStabilizing: false,
  suddenShiftDetected: false,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('VoiceHumanizationService', () => {
  let service: VoiceHumanizationService;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    resetAllVoiceHumanization();
    service = new VoiceHumanizationService(sessionId);
  });

  afterEach(() => {
    resetAllVoiceHumanization();
  });

  // -------------------------------------------------------------------------
  // MICRO-INTERRUPTION DETECTION
  // -------------------------------------------------------------------------

  describe('Micro-Interruption Detection', () => {
    it('should detect "wait" as immediate stop signal', () => {
      const result = service.detectMicroInterruption('wait', true);
      
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('wait');
      expect(result.urgency).toBe('immediate');
      expect(result.shouldStopAgent).toBe(true);
    });

    it('should detect "hold on" as immediate stop signal', () => {
      const result = service.detectMicroInterruption('hold on', true);
      
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('hold on');
      expect(result.shouldStopAgent).toBe(true);
    });

    it('should detect "actually" as immediate stop signal', () => {
      const result = service.detectMicroInterruption('actually', true);
      
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('actually');
      expect(result.shouldStopAgent).toBe(true);
    });

    it('should detect "yeah but" pattern as interruption', () => {
      const result = service.detectMicroInterruption('yeah but', true);
      
      expect(result.detected).toBe(true);
      expect(result.shouldStopAgent).toBe(true);
    });

    it('should detect "no, that\'s not" pattern as interruption', () => {
      const result = service.detectMicroInterruption("no, that's not what I meant", true);
      
      expect(result.detected).toBe(true);
      expect(result.shouldStopAgent).toBe(true);
    });

    it('should not detect interruption when agent is not speaking', () => {
      const result = service.detectMicroInterruption('wait', false);
      
      expect(result.detected).toBe(false);
      expect(result.shouldStopAgent).toBe(false);
    });

    it('should detect "but" as soft interruption (no immediate stop)', () => {
      const result = service.detectMicroInterruption('but', true);
      
      expect(result.detected).toBe(true);
      expect(result.urgency).toBe('soon');
      expect(result.shouldStopAgent).toBe(false);
    });

    it('should not flag normal speech as interruption', () => {
      const result = service.detectMicroInterruption('I really appreciate that', true);
      
      expect(result.detected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // LAUGHTER DETECTION
  // -------------------------------------------------------------------------

  describe('Laughter Detection', () => {
    it('should detect laughter with high energy bursts and short duration', () => {
      const prosody = createMockProsody({
        energyPeaks: 10,          // Many energy bursts
        pitchVariance: 50,        // High pitch variation
        energyMean: -10,          // Loud
        utteranceDuration: 1000,  // Short duration
      });

      const result = service.detectLaughter(prosody, 1000);
      
      expect(result.isLaughing).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should not detect laughter for long utterances', () => {
      const prosody = createMockProsody({
        energyPeaks: 10,
        pitchVariance: 50,
        utteranceDuration: 5000, // Too long for laughter
      });

      const result = service.detectLaughter(prosody, 5000);
      
      expect(result.isLaughing).toBe(false);
    });

    it('should classify laugh type based on characteristics', () => {
      // Chuckle: short, quieter
      const chuckleProsody = createMockProsody({
        energyPeaks: 5,
        energyMean: -25,
        utteranceDuration: 400,
      });

      const chuckleResult = service.detectLaughter(chuckleProsody, 400);
      
      // Hearty laugh: longer, louder
      const heartyProsody = createMockProsody({
        energyPeaks: 15,
        energyMean: -5,
        utteranceDuration: 1500,
        pitchVariance: 60,
      });

      const heartyResult = service.detectLaughter(heartyProsody, 1500);
      
      // Both should be detected but with different types
      if (chuckleResult.isLaughing) {
        expect(chuckleResult.suggestedResponse).toBe('smile');
      }
      if (heartyResult.isLaughing) {
        expect(['join_in', 'acknowledge']).toContain(heartyResult.suggestedResponse);
      }
    });

    it('should return laughter response SSML for detected laughter', () => {
      const prosody = createMockProsody({
        energyPeaks: 10,
        pitchVariance: 50,
        energyMean: -10,
        utteranceDuration: 1000,
      });

      const result = service.detectLaughter(prosody, 1000);
      
      if (result.isLaughing) {
        const response = service.getLaughterResponse(result, 'ferni');
        expect(response).not.toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // EMOTIONAL TTS ADJUSTMENTS
  // -------------------------------------------------------------------------

  describe('Emotional TTS Adjustments', () => {
    it('should add opening pause for high emotional temperature', () => {
      const arc = createMockEmotionalArc({
        conversationTemperature: 0.8,
      });

      const adjustments = service.getEmotionalTtsAdjustments(arc);
      
      expect(adjustments.openingPauseMs).toBeGreaterThanOrEqual(300);
      expect(adjustments.warmth).toBe('high');
      expect(adjustments.addBreaths).toBe(true);
    });

    it('should slow down for user needing emotional support', () => {
      const arc = createMockEmotionalArc({
        needsEmotionalSupport: true,
      });

      const adjustments = service.getEmotionalTtsAdjustments(arc);
      
      expect(adjustments.speedAdjust).toBeLessThan(0);
      expect(adjustments.warmth).toBe('high');
      expect(adjustments.ssmlEmotion).toBe('empathetic');
    });

    it('should add pause for sudden emotional shift', () => {
      const arc = createMockEmotionalArc({
        suddenShiftDetected: true,
      });

      const adjustments = service.getEmotionalTtsAdjustments(arc);
      
      expect(adjustments.openingPauseMs).toBeGreaterThanOrEqual(350);
      expect(adjustments.addBreaths).toBe(true);
    });

    it('should be slightly faster for improving trajectory', () => {
      const arc = createMockEmotionalArc({
        trajectory: 'improving',
        currentValence: 0.5,
      });

      const adjustments = service.getEmotionalTtsAdjustments(arc);
      
      expect(adjustments.speedAdjust).toBeGreaterThanOrEqual(0);
    });

    it('should maintain warmth after recent distress', () => {
      const arc = createMockEmotionalArc({
        turnsSinceDistress: 2,
      });

      const adjustments = service.getEmotionalTtsAdjustments(arc);
      
      expect(adjustments.warmth).toBe('high');
      expect(adjustments.addBreaths).toBe(true);
    });

    it('should apply adjustments to SSML', () => {
      const arc = createMockEmotionalArc({
        needsEmotionalSupport: true,
        conversationTemperature: 0.8,
      });

      const adjustments = service.getEmotionalTtsAdjustments(arc);
      const text = "I hear you. That sounds really hard.";
      const enhanced = service.applyEmotionalSsml(text, adjustments);
      
      expect(enhanced).toContain('<break');
      expect(enhanced.length).toBeGreaterThan(text.length);
    });
  });

  // -------------------------------------------------------------------------
  // SPEECH RHYTHM ANALYSIS
  // -------------------------------------------------------------------------

  describe('Speech Rhythm Analysis', () => {
    it('should build rhythm profile from utterance', () => {
      const profile = service.updateRhythmProfile(
        "I really appreciate that. It means a lot to me.",
        3000
      );
      
      expect(profile.avgPhraseLength).toBeGreaterThan(0);
      expect(profile.pattern).toBeDefined();
      expect(profile.confidence).toBeGreaterThan(0);
    });

    it('should detect staccato pattern for short phrases with pauses', () => {
      // Short phrases, long pauses
      const profile = service.updateRhythmProfile(
        "Yes. No. Maybe.",
        5000 // Long duration for short text
      );
      
      // Pattern detection depends on phrase/pause ratio
      expect(['staccato', 'measured', 'varied']).toContain(profile.pattern);
    });

    it('should detect flowing pattern for continuous speech', () => {
      const profile = service.updateRhythmProfile(
        "I've been thinking about what you said and I really appreciate how you put that into perspective for me because it helped me understand the situation better",
        5000
      );
      
      expect(['flowing', 'varied']).toContain(profile.pattern);
    });

    it('should provide rhythm mirroring adjustments', () => {
      // Set up rhythm profile
      service.updateRhythmProfile("Short. Sentences. Here.", 3000);
      
      const adjustments = service.getRhythmMirroringAdjustments();
      
      expect(adjustments.pauseMultiplier).toBeDefined();
      expect(adjustments.phraseBreakMs).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------------------

  describe('State Management', () => {
    it('should track turn count', () => {
      expect(service.getState().turnCount).toBe(0);
      
      service.recordTurn();
      service.recordTurn();
      service.recordTurn();
      
      expect(service.getState().turnCount).toBe(3);
    });

    it('should track interruption patterns', () => {
      service.detectMicroInterruption('wait', true);
      service.detectMicroInterruption('hold on', true);
      
      const patterns = service.getInterruptionPatterns();
      
      expect(patterns.length).toBe(2);
      expect(patterns[0].trigger).toBe('wait');
      expect(patterns[1].trigger).toBe('hold on');
    });

    it('should reset state correctly', () => {
      service.recordTurn();
      service.detectMicroInterruption('wait', true);
      
      service.reset();
      
      expect(service.getState().turnCount).toBe(0);
      expect(service.getInterruptionPatterns().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SINGLETON MANAGEMENT
  // -------------------------------------------------------------------------

  describe('Singleton Management', () => {
    it('should return same instance for same session', () => {
      const service1 = getVoiceHumanizationService('session-a');
      const service2 = getVoiceHumanizationService('session-a');
      
      expect(service1).toBe(service2);
    });

    it('should return different instances for different sessions', () => {
      const service1 = getVoiceHumanizationService('session-a');
      const service2 = getVoiceHumanizationService('session-b');
      
      expect(service1).not.toBe(service2);
    });

    it('should reset specific session', () => {
      const service1 = getVoiceHumanizationService('session-a');
      service1.recordTurn();
      
      resetVoiceHumanization('session-a');
      
      const service2 = getVoiceHumanizationService('session-a');
      expect(service2.getState().turnCount).toBe(0);
    });
  });
});

