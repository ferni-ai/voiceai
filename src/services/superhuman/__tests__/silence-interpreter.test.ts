/**
 * Silence Interpreter Tests
 *
 * @module @ferni/services/superhuman/__tests__/silence-interpreter
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeSilence,
  buildSilenceGuidance,
  shouldAnalyzeSilence,
  getResponsePhrase,
  type VoiceMarkers,
  type SilenceType,
} from '../silence-interpreter.js';

describe('SilenceInterpreter', () => {
  // Default voice markers
  const defaultMarkers: VoiceMarkers = {
    breathPattern: 'normal',
    microSounds: [],
    energyJustBefore: 0.5,
  };

  describe('analyzeSilence()', () => {
    it('identifies processing silence for short pauses after questions', () => {
      const result = analyzeSilence(1500, {
        precedingUserMessage: 'What do you think?',
        voiceMarkersBefore: defaultMarkers,
        conversationPhase: 'middle',
      });

      expect(result.type).toBe('processing');
    });

    it('identifies emotional silence with held breath', () => {
      const result = analyzeSilence(3000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          breathPattern: 'held',
        },
        precedingEmotion: 'sad',
        conversationPhase: 'deep',
      });

      expect(result.type).toBe('emotional');
    });

    it('identifies exhausted silence with sighing and low energy', () => {
      const result = analyzeSilence(4000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          breathPattern: 'sighing',
          energyJustBefore: 0.3,
        },
        conversationPhase: 'middle',
      });

      expect(result.type).toBe('exhausted');
    });

    it('identifies uncomfortable silence with "um" sounds', () => {
      const result = analyzeSilence(2000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          microSounds: ['um'],
        },
        conversationPhase: 'middle',
      });

      expect(result.type).toBe('uncomfortable');
    });

    it('identifies contemplative silence in deep conversation', () => {
      const result = analyzeSilence(5000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          breathPattern: 'deep',
        },
        conversationPhase: 'deep',
      });

      expect(result.type).toBe('contemplative');
    });

    it('identifies invitational silence with high energy', () => {
      const result = analyzeSilence(1200, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          energyJustBefore: 0.8,
        },
        conversationPhase: 'middle',
      });

      expect(result.type).toBe('invitational');
    });

    it('returns appropriate response phrases', () => {
      const result = analyzeSilence(2500, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          breathPattern: 'held',
        },
        precedingEmotion: 'sad',
        conversationPhase: 'middle',
      });

      // Emotional silences have presence responses
      expect(result.recommendedResponse).toBe('gentle_presence');
    });

    it('includes wait time in analysis', () => {
      const result = analyzeSilence(3000, {
        voiceMarkersBefore: defaultMarkers,
        conversationPhase: 'deep',
      });

      expect(result.waitDurationMs).toBeGreaterThan(0);
    });

    it('calculates confidence score', () => {
      const result = analyzeSilence(2000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          microSounds: ['um'],
        },
        conversationPhase: 'middle',
      });

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('uses user profile when provided', () => {
      const customProfile = {
        userId: 'test',
        silenceSignatures: {
          processing: {
            typicalDuration: { min: 500, max: 2000 },
            voiceMarkersBefore: [],
            breathPatternDuring: ['normal' as const],
            confidenceThreshold: 0.6,
            bestResponse: 'hold_space' as const,
          },
          emotional: {
            typicalDuration: { min: 1000, max: 5000 },
            voiceMarkersBefore: [],
            breathPatternDuring: ['held' as const],
            confidenceThreshold: 0.7,
            bestResponse: 'gentle_presence' as const,
          },
          uncomfortable: {
            typicalDuration: { min: 1000, max: 3000 },
            voiceMarkersBefore: [],
            breathPatternDuring: ['quickening' as const],
            confidenceThreshold: 0.6,
            bestResponse: 'soft_prompt' as const,
          },
          invitational: {
            typicalDuration: { min: 500, max: 2000 },
            voiceMarkersBefore: [],
            breathPatternDuring: ['normal' as const],
            confidenceThreshold: 0.5,
            bestResponse: 'soft_prompt' as const,
          },
          exhausted: {
            typicalDuration: { min: 2000, max: 8000 },
            voiceMarkersBefore: [],
            breathPatternDuring: ['sighing' as const],
            confidenceThreshold: 0.6,
            bestResponse: 'offer_rest' as const,
          },
          contemplative: {
            typicalDuration: { min: 3000, max: 15000 },
            voiceMarkersBefore: [],
            breathPatternDuring: ['deep' as const],
            confidenceThreshold: 0.5,
            bestResponse: 'honor_moment' as const,
          },
        },
        silenceHistory: [],
        baselinePauseTolerance: 2500,
        responseEffectiveness: {
          byType: {} as Record<
            SilenceType,
            {
              totalResponses: number;
              helpfulResponses: number;
              topPhrases: Array<{ phrase: string; score: number }>;
              optimalWaitMs: number;
            }
          >,
          overallScore: 0.5,
          lastUpdated: new Date(),
        },
        topicTriggers: [],
        updatedAt: new Date(),
      };

      const result = analyzeSilence(2000, {
        voiceMarkersBefore: defaultMarkers,
        conversationPhase: 'middle',
        userProfile: customProfile,
      });

      // Should still produce valid result
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });
  });

  describe('buildSilenceGuidance()', () => {
    it('builds guidance string for processing silence', () => {
      const analysis = analyzeSilence(2000, {
        voiceMarkersBefore: defaultMarkers,
        conversationPhase: 'opening',
        precedingUserMessage: 'What should I do?',
      });

      const guidance = buildSilenceGuidance(analysis);

      expect(guidance).toContain('[SILENCE INTERPRETER]');
      expect(guidance).toContain('Confidence:');
      expect(guidance).toContain('Duration:');
    });

    it('builds guidance string for emotional silence', () => {
      const analysis = analyzeSilence(3000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          breathPattern: 'held',
        },
        precedingEmotion: 'sad',
        conversationPhase: 'deep',
      });

      const guidance = buildSilenceGuidance(analysis);

      expect(guidance).toContain('SILENCE DETECTED');
    });

    it('includes response suggestion when available', () => {
      const analysis = analyzeSilence(2000, {
        voiceMarkersBefore: {
          ...defaultMarkers,
          breathPattern: 'held',
        },
        precedingEmotion: 'sad',
        conversationPhase: 'middle',
      });

      const guidance = buildSilenceGuidance(analysis);

      // Should have some response suggestion
      expect(guidance.length).toBeGreaterThan(50);
    });
  });

  describe('shouldAnalyzeSilence()', () => {
    it('returns false for very short silences', () => {
      expect(shouldAnalyzeSilence(500)).toBe(false);
      expect(shouldAnalyzeSilence(800)).toBe(false);
    });

    it('returns true for silences >= 1 second', () => {
      expect(shouldAnalyzeSilence(1000)).toBe(true);
      expect(shouldAnalyzeSilence(1500)).toBe(true);
      expect(shouldAnalyzeSilence(3000)).toBe(true);
    });
  });

  describe('getResponsePhrase()', () => {
    it('returns empty string for processing silence', () => {
      const phrase = getResponsePhrase('processing');
      expect(phrase).toBe('');
    });

    it('returns presence phrase for emotional silence', () => {
      const phrase = getResponsePhrase('emotional');
      expect(phrase.length).toBeGreaterThan(0);
    });

    it('returns invitation phrase for invitational silence', () => {
      const phrase = getResponsePhrase('invitational');
      expect(phrase.length).toBeGreaterThan(0);
    });

    it('returns rest phrase for exhausted silence', () => {
      const phrase = getResponsePhrase('exhausted');
      expect(phrase.length).toBeGreaterThan(0);
    });

    it('returns different phrases on multiple calls (randomness)', () => {
      const phrases = new Set<string>();
      for (let i = 0; i < 20; i++) {
        phrases.add(getResponsePhrase('emotional'));
      }
      // Should have at least 2 different phrases
      expect(phrases.size).toBeGreaterThan(1);
    });
  });

  describe('silence type classification', () => {
    const testCases: Array<{
      name: string;
      duration: number;
      markers: VoiceMarkers;
      context: Partial<Parameters<typeof analyzeSilence>[1]>;
      expectedType: SilenceType;
    }> = [
      {
        name: 'sniffing suggests emotional',
        duration: 2500,
        markers: { ...defaultMarkers, microSounds: ['sniff'] },
        context: { conversationPhase: 'middle' },
        expectedType: 'emotional',
      },
      {
        name: 'throat clear suggests uncomfortable',
        duration: 2000,
        markers: { ...defaultMarkers, microSounds: ['throat_clear'] },
        context: { conversationPhase: 'middle' },
        expectedType: 'uncomfortable',
      },
      {
        name: 'long silence with deep breathing is contemplative',
        duration: 6000,
        markers: { ...defaultMarkers, breathPattern: 'deep' },
        context: { conversationPhase: 'deep' },
        expectedType: 'contemplative',
      },
    ];

    for (const testCase of testCases) {
      it(testCase.name, () => {
        const result = analyzeSilence(testCase.duration, {
          voiceMarkersBefore: testCase.markers,
          conversationPhase: testCase.context.conversationPhase || 'middle',
          ...testCase.context,
        });

        expect(result.type).toBe(testCase.expectedType);
      });
    }
  });
});
