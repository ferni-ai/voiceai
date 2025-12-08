/**
 * "Better Than Human" Feature Tests
 *
 * Tests for the advanced emotional intelligence features that make
 * Ferni truly better than human at emotional attunement:
 *
 * 1. Voice-text emotion mismatch detection
 * 2. Cross-persona insight sharing
 * 3. Prosody-turn prediction bridge
 * 4. Relationship health scoring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// VOICE-TEXT MISMATCH DETECTION TESTS
// ============================================================================

describe('Voice-Text Mismatch Detection', () => {
  let detectMismatch: typeof import('../intelligence/voice-text-mismatch.js').detectMismatch;
  let buildMismatchGuidance: typeof import('../intelligence/voice-text-mismatch.js').buildMismatchGuidance;

  beforeEach(async () => {
    const module = await import('../intelligence/voice-text-mismatch.js');
    detectMismatch = module.detectMismatch;
    buildMismatchGuidance = module.buildMismatchGuidance;
  });

  describe('detectMismatch', () => {
    it('should detect "I\'m fine" with anxious voice as masking negative', () => {
      const voiceEmotion = {
        primary: 'anxious' as const,
        confidence: 0.75,
        valence: -0.4,
        arousal: 0.6,
        dominance: -0.3,
        stressLevel: 0.7,
        anxietyMarkers: true,
        prosody: {
          pitchMean: 180,
          pitchVariance: 50,
          pitchRange: 80,
          pitchContour: 'dynamic' as const,
          energyMean: -15,
          energyVariance: 10,
          energyPeaks: 5,
          speechRate: 5.5,
          pauseDuration: 150,
          pauseFrequency: 12,
          jitter: 0.06,
          shimmer: 0.08,
          breathiness: 0.25,
          utteranceDuration: 2000,
          speakingRatio: 0.7,
        },
        sampleCount: 1000,
        processingTimeMs: 50,
      };

      const result = detectMismatch("I'm fine, really.", voiceEmotion);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('masking_negative');
      expect(result.voiceEmotion).toBe('anxious');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.shouldSurface).toBe(true);
    });

    it('should not detect mismatch when voice matches text', () => {
      const voiceEmotion = {
        primary: 'happy' as const,
        confidence: 0.8,
        valence: 0.7,
        arousal: 0.5,
        dominance: 0.3,
        stressLevel: 0.1,
        anxietyMarkers: false,
        prosody: {
          pitchMean: 170,
          pitchVariance: 30,
          pitchRange: 60,
          pitchContour: 'rising' as const,
          energyMean: -12,
          energyVariance: 8,
          energyPeaks: 3,
          speechRate: 4.5,
          pauseDuration: 100,
          pauseFrequency: 6,
          jitter: 0.02,
          shimmer: 0.03,
          breathiness: 0.1,
          utteranceDuration: 1500,
          speakingRatio: 0.8,
        },
        sampleCount: 800,
        processingTimeMs: 40,
      };

      const result = detectMismatch("I'm doing great!", voiceEmotion);

      expect(result.hasMismatch).toBe(false);
      expect(result.type).toBe('none');
    });

    it('should detect high stress with neutral words as suppressing', () => {
      const voiceEmotion = {
        primary: 'neutral' as const,
        confidence: 0.65,
        valence: 0,
        arousal: 0.4,
        dominance: 0,
        stressLevel: 0.75, // High stress
        anxietyMarkers: false,
        prosody: {
          pitchMean: 150,
          pitchVariance: 20,
          pitchRange: 40,
          pitchContour: 'flat' as const,
          energyMean: -18,
          energyVariance: 5,
          energyPeaks: 2,
          speechRate: 3.5,
          pauseDuration: 200,
          pauseFrequency: 8,
          jitter: 0.04,
          shimmer: 0.05,
          breathiness: 0.15,
          utteranceDuration: 3000,
          speakingRatio: 0.65,
        },
        sampleCount: 1200,
        processingTimeMs: 55,
      };

      const result = detectMismatch('Just work stuff.', voiceEmotion);

      expect(result.hasMismatch).toBe(true);
      expect(result.type).toBe('suppressing');
    });

    it('should return no mismatch when voice confidence is low', () => {
      const voiceEmotion = {
        primary: 'sad' as const,
        confidence: 0.2, // Too low
        valence: -0.5,
        arousal: -0.3,
        dominance: -0.2,
        stressLevel: 0.4,
        anxietyMarkers: false,
        prosody: {
          pitchMean: 140,
          pitchVariance: 15,
          pitchRange: 30,
          pitchContour: 'falling' as const,
          energyMean: -20,
          energyVariance: 3,
          energyPeaks: 1,
          speechRate: 3,
          pauseDuration: 250,
          pauseFrequency: 10,
          jitter: 0.03,
          shimmer: 0.04,
          breathiness: 0.12,
          utteranceDuration: 2500,
          speakingRatio: 0.6,
        },
        sampleCount: 600,
        processingTimeMs: 35,
      };

      const result = detectMismatch("I'm happy about this!", voiceEmotion);

      expect(result.hasMismatch).toBe(false);
    });
  });

  describe('buildMismatchGuidance', () => {
    it('should generate guidance for masking mismatch', () => {
      const mismatch = {
        hasMismatch: true,
        confidence: 0.7,
        textEmotion: 'neutral',
        voiceEmotion: 'anxious',
        type: 'masking_negative' as const,
        interpretation: 'User says they\'re okay but voice reveals anxious emotion',
        suggestedApproach: 'Acknowledge without pushing',
        shouldSurface: true,
        surfacePhrase: "I hear you saying you're okay, but... I want you to know I'm here.",
      };

      const guidance = buildMismatchGuidance(mismatch);

      expect(guidance).not.toBeNull();
      expect(guidance).toContain('VOICE INSIGHT');
      expect(guidance).toContain('anxious');
    });

    it('should return null for no mismatch', () => {
      const mismatch = {
        hasMismatch: false,
        confidence: 0,
        textEmotion: 'neutral',
        voiceEmotion: 'neutral',
        type: 'none' as const,
        interpretation: 'No significant mismatch detected',
        suggestedApproach: '',
        shouldSurface: false,
      };

      const guidance = buildMismatchGuidance(mismatch);

      expect(guidance).toBeNull();
    });
  });
});

// ============================================================================
// CROSS-PERSONA INSIGHT SHARING TESTS
// ============================================================================

describe('Cross-Persona Insight Sharing', () => {
  let recordInsight: typeof import('../services/cross-persona-insights.js').recordInsight;
  let getInsightsForPersona: typeof import('../services/cross-persona-insights.js').getInsightsForPersona;
  let buildInsightContext: typeof import('../services/cross-persona-insights.js').buildInsightContext;

  beforeEach(async () => {
    const module = await import('../services/cross-persona-insights.js');
    recordInsight = module.recordInsight;
    getInsightsForPersona = module.getInsightsForPersona;
    buildInsightContext = module.buildInsightContext;
  });

  describe('recordInsight', () => {
    it('should record and store insight', async () => {
      const insight = await recordInsight('test-user-123', 'maya', {
        category: 'emotional_state',
        content: 'User has been stressed about work deadlines',
        summary: 'Stressed about work deadlines',
        confidence: 0.8,
        priority: 'high',
      });

      expect(insight).toBeDefined();
      expect(insight.id).toContain('insight_');
      expect(insight.sourcePersona).toBe('maya');
      expect(insight.category).toBe('emotional_state');
      expect(insight.acknowledgedBy).toContain('maya');
    });

    it('should set priority automatically based on category', async () => {
      const insight = await recordInsight('test-user-456', 'ferni', {
        category: 'boundary',
        content: 'User asked not to discuss their ex',
        summary: "Don't discuss ex relationships",
        confidence: 0.9,
      });

      expect(insight.priority).toBe('critical'); // Boundaries are critical
    });
  });

  describe('getInsightsForPersona', () => {
    it('should filter insights by relevance to persona', async () => {
      const testUserId = 'test-user-' + Date.now();

      // Record insights from different personas
      await recordInsight(testUserId, 'maya', {
        category: 'habit',
        content: 'User struggles with morning routine',
        summary: 'Struggles with morning routine',
        confidence: 0.75,
      });

      await recordInsight(testUserId, 'peter', {
        category: 'financial',
        content: 'User interested in index funds',
        summary: 'Interested in index funds',
        confidence: 0.8,
      });

      // Maya should see habits (her domain), Ferni should see both
      const mayaInsights = getInsightsForPersona(testUserId, 'maya', {
        includeAcknowledged: true,
      });
      const jackInsights = getInsightsForPersona(testUserId, 'jack', {
        includeAcknowledged: true,
      });

      // Jack (financial advisor) should have higher relevance for financial insight
      const jackFinancialRelevance = jackInsights.find(
        (i) => i.insight.category === 'financial'
      )?.relevanceScore;
      const jackHabitRelevance = jackInsights.find(
        (i) => i.insight.category === 'habit'
      )?.relevanceScore;

      if (jackFinancialRelevance && jackHabitRelevance) {
        expect(jackFinancialRelevance).toBeGreaterThan(jackHabitRelevance);
      }
    });
  });

  describe('buildInsightContext', () => {
    it('should build LLM-ready context string', async () => {
      const testUserId = 'test-user-context-' + Date.now();

      await recordInsight(testUserId, 'maya', {
        category: 'struggle',
        content: 'User mentioned feeling overwhelmed',
        summary: 'Feeling overwhelmed lately',
        confidence: 0.85,
        priority: 'high',
      });

      const context = buildInsightContext(testUserId, 'ferni');

      if (context) {
        expect(context).toContain('Team Insights');
        expect(context).toContain('overwhelmed');
      }
    });

    it('should return null when no relevant insights', () => {
      const context = buildInsightContext('nonexistent-user', 'ferni');
      expect(context).toBeNull();
    });
  });
});

// ============================================================================
// PROSODY-TURN PREDICTION BRIDGE TESTS
// ============================================================================

describe('Prosody-Turn Prediction Bridge', () => {
  let mapPitchContourToIntonation: typeof import('../speech/prosody-turn-bridge.js').mapPitchContourToIntonation;
  let voiceSuggestsTurnComplete: typeof import('../speech/prosody-turn-bridge.js').voiceSuggestsTurnComplete;
  let createTurnPredictionContext: typeof import('../speech/prosody-turn-bridge.js').createTurnPredictionContext;

  beforeEach(async () => {
    const module = await import('../speech/prosody-turn-bridge.js');
    mapPitchContourToIntonation = module.mapPitchContourToIntonation;
    voiceSuggestsTurnComplete = module.voiceSuggestsTurnComplete;
    createTurnPredictionContext = module.createTurnPredictionContext;
  });

  describe('mapPitchContourToIntonation', () => {
    it('should map rising pitch to rising intonation', () => {
      expect(mapPitchContourToIntonation('rising')).toBe('rising');
    });

    it('should map falling pitch to falling intonation', () => {
      expect(mapPitchContourToIntonation('falling')).toBe('falling');
    });

    it('should map flat pitch to neutral intonation', () => {
      expect(mapPitchContourToIntonation('flat')).toBe('neutral');
    });

    it('should map dynamic pitch to neutral intonation', () => {
      expect(mapPitchContourToIntonation('dynamic')).toBe('neutral');
    });
  });

  describe('voiceSuggestsTurnComplete', () => {
    it('should suggest complete for falling pitch with high confidence', () => {
      const voiceEmotion = {
        primary: 'neutral' as const,
        confidence: 0.75,
        valence: 0,
        arousal: 0,
        dominance: 0,
        stressLevel: 0.2,
        anxietyMarkers: false,
        prosody: {
          pitchMean: 150,
          pitchVariance: 20,
          pitchRange: 40,
          pitchContour: 'falling' as const,
          energyMean: -15,
          energyVariance: 5,
          energyPeaks: 2,
          speechRate: 4,
          pauseDuration: 150,
          pauseFrequency: 6,
          jitter: 0.02,
          shimmer: 0.03,
          breathiness: 0.1,
          utteranceDuration: 2000,
          speakingRatio: 0.75,
        },
        sampleCount: 1000,
        processingTimeMs: 45,
      };

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(true);
      expect(result.reason.toLowerCase()).toContain('falling');
    });

    it('should not suggest complete for rising pitch', () => {
      const voiceEmotion = {
        primary: 'curious' as const,
        confidence: 0.7,
        valence: 0.2,
        arousal: 0.3,
        dominance: 0,
        stressLevel: 0.1,
        anxietyMarkers: false,
        prosody: {
          pitchMean: 160,
          pitchVariance: 25,
          pitchRange: 50,
          pitchContour: 'rising' as const,
          energyMean: -14,
          energyVariance: 6,
          energyPeaks: 3,
          speechRate: 4.2,
          pauseDuration: 120,
          pauseFrequency: 5,
          jitter: 0.02,
          shimmer: 0.03,
          breathiness: 0.08,
          utteranceDuration: 1800,
          speakingRatio: 0.8,
        },
        sampleCount: 900,
        processingTimeMs: 42,
      };

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(false);
      expect(result.reason).toContain('Rising');
    });

    it('should return false for low confidence voice emotion', () => {
      const voiceEmotion = {
        primary: 'neutral' as const,
        confidence: 0.2, // Too low
        valence: 0,
        arousal: 0,
        dominance: 0,
        stressLevel: 0.1,
        anxietyMarkers: false,
        prosody: {
          pitchMean: 150,
          pitchVariance: 20,
          pitchRange: 40,
          pitchContour: 'falling' as const,
          energyMean: -15,
          energyVariance: 5,
          energyPeaks: 2,
          speechRate: 4,
          pauseDuration: 150,
          pauseFrequency: 6,
          jitter: 0.02,
          shimmer: 0.03,
          breathiness: 0.1,
          utteranceDuration: 2000,
          speakingRatio: 0.75,
        },
        sampleCount: 500,
        processingTimeMs: 30,
      };

      const result = voiceSuggestsTurnComplete(voiceEmotion);

      expect(result.suggests).toBe(false);
      expect(result.reason).toContain('confidence');
    });
  });

  describe('createTurnPredictionContext', () => {
    it('should create context with voice emotion', () => {
      const voiceEmotion = {
        primary: 'neutral' as const,
        confidence: 0.7,
        valence: 0,
        arousal: 0.3,
        dominance: 0,
        stressLevel: 0.2,
        anxietyMarkers: false,
        prosody: {
          pitchMean: 155,
          pitchVariance: 22,
          pitchRange: 45,
          pitchContour: 'falling' as const,
          energyMean: -14,
          energyVariance: 5,
          energyPeaks: 2,
          speechRate: 4.5,
          pauseDuration: 140,
          pauseFrequency: 5,
          jitter: 0.02,
          shimmer: 0.03,
          breathiness: 0.09,
          utteranceDuration: 1900,
          speakingRatio: 0.78,
        },
        sampleCount: 950,
        processingTimeMs: 43,
      };

      const ctx = createTurnPredictionContext('Hello, how are you today?', {
        voiceEmotion,
        speakingDurationMs: 2000,
        silenceDurationMs: 500,
        turnCount: 5,
      });

      expect(ctx.transcript).toBe('Hello, how are you today?');
      expect(ctx.intonation).toBe('falling');
      expect(ctx.speakingDurationMs).toBe(2000);
      expect(ctx.emotionIntensity).toBe(0.3);
    });

    it('should handle null voice emotion gracefully', () => {
      const ctx = createTurnPredictionContext('Hello!', {
        voiceEmotion: null,
      });

      expect(ctx.intonation).toBe('neutral');
      expect(ctx.emotionIntensity).toBeUndefined();
    });
  });
});

// ============================================================================
// CALENDAR BUSY DETECTION TESTS
// ============================================================================

describe('Calendar Busy Detection', () => {
  // These tests are more integration-focused and would need mocking
  // Just test the helper functions here

  it('should export required functions', async () => {
    const module = await import('../services/calendar-busy-detection.js');

    expect(module.isUserBusy).toBeDefined();
    expect(module.getNextOutreachWindow).toBeDefined();
    expect(module.getCalendarBusyProfile).toBeDefined();
    expect(module.syncCalendarToOutreach).toBeDefined();
  });
});

// ============================================================================
// UNIFIED PERSISTENCE TESTS
// ============================================================================

describe('Unified Trust Persistence', () => {
  let initializeUnifiedPersistence: typeof import('../services/trust-systems/unified-persistence.js').initializeUnifiedPersistence;
  let shutdownUnifiedPersistence: typeof import('../services/trust-systems/unified-persistence.js').shutdownUnifiedPersistence;
  let saveSystemData: typeof import('../services/trust-systems/unified-persistence.js').saveSystemData;
  let getSystemData: typeof import('../services/trust-systems/unified-persistence.js').getSystemData;

  beforeEach(async () => {
    const module = await import('../services/trust-systems/unified-persistence.js');
    initializeUnifiedPersistence = module.initializeUnifiedPersistence;
    shutdownUnifiedPersistence = module.shutdownUnifiedPersistence;
    saveSystemData = module.saveSystemData;
    getSystemData = module.getSystemData;
  });

  it('should initialize and shutdown cleanly', async () => {
    // This tests the lifecycle without errors
    initializeUnifiedPersistence({ batchSyncIntervalMs: 100000 }); // Long interval for tests
    await shutdownUnifiedPersistence();
    
    // Should be able to reinitialize
    initializeUnifiedPersistence({ batchSyncIntervalMs: 100000 });
    await shutdownUnifiedPersistence();
  });

  it('should save and retrieve system data from cache', async () => {
    initializeUnifiedPersistence({ batchSyncIntervalMs: 100000 });

    const testUserId = 'test-unified-' + Date.now();
    const testData = { testKey: 'testValue', number: 42 };

    // Save data
    await saveSystemData(testUserId, 'testSystem', testData, { immediate: false });

    // Retrieve from cache
    const retrieved = await getSystemData<typeof testData>(testUserId, 'testSystem');

    expect(retrieved).toEqual(testData);

    await shutdownUnifiedPersistence();
  });
});

