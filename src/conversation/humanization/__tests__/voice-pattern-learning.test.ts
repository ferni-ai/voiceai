/**
 * Voice Pattern Learning Tests
 *
 * Tests cross-session voice preference learning with EMA updates,
 * Bayesian probability estimation, and time-of-day patterns.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getVoicePatternEngine,
  resetVoicePatternEngine,
  recordVoiceObservation,
  getVoicePatterns,
  getRecommendedAgentWpm,
  getRecommendedTurnGap,
  getCurrentTimeOfDay,
  VOICE_PATTERN_CONFIG,
  type VoicePatternData,
} from '../voice-pattern-learning.js';

describe('VoicePatternLearning', () => {
  const testSessionId = 'test-session-123';
  const testUserId = 'test-user-456';

  beforeEach(() => {
    resetVoicePatternEngine(testSessionId);
  });

  afterEach(() => {
    resetVoicePatternEngine(testSessionId);
  });

  describe('Engine Lifecycle', () => {
    it('creates a new engine for a session', () => {
      const engine = getVoicePatternEngine(testSessionId, testUserId);
      expect(engine).toBeDefined();
      expect(engine.sessionId).toBe(testSessionId);
      expect(engine.userId).toBe(testUserId);
      expect(engine.observations).toHaveLength(0);
    });

    it('returns the same engine for the same session', () => {
      const engine1 = getVoicePatternEngine(testSessionId, testUserId);
      const engine2 = getVoicePatternEngine(testSessionId, testUserId);
      expect(engine1).toBe(engine2);
    });

    it('initializes with persisted data when provided', () => {
      const persistedData: VoicePatternData = {
        userId: testUserId,
        preferredAgentWpm: 140,
        preferredTurnGapMs: 600,
        interruptionProbability: 0.2,
        prefersQuickResponses: true,
        timeOfDayPatterns: {
          morning: { preferredWpm: 150, preferredGapMs: 700, avgEnergy: 0.6, sampleCount: 5 },
          afternoon: { preferredWpm: 145, preferredGapMs: 650, avgEnergy: 0.55, sampleCount: 3 },
          evening: { preferredWpm: 135, preferredGapMs: 800, avgEnergy: 0.45, sampleCount: 4 },
          lateNight: { preferredWpm: 130, preferredGapMs: 900, avgEnergy: 0.35, sampleCount: 2 },
        },
        sessionCount: 10,
        totalObservations: 150,
        confidence: 0.72,
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const engine = getVoicePatternEngine(testSessionId, testUserId, persistedData);
      expect(engine.persistedData).toEqual(persistedData);
    });
  });

  describe('Observation Recording', () => {
    it('records voice observations', () => {
      getVoicePatternEngine(testSessionId, testUserId);

      recordVoiceObservation(testSessionId, {
        agentWpm: 140,
        turnGapMs: 700,
        timestamp: Date.now(),
      });

      const engine = getVoicePatternEngine(testSessionId, testUserId);
      expect(engine.observations).toHaveLength(1);
    });

    it('trims old observations beyond MAX_SESSION_OBSERVATIONS', () => {
      getVoicePatternEngine(testSessionId, testUserId);

      // Record more than max
      for (let i = 0; i < VOICE_PATTERN_CONFIG.MAX_SESSION_OBSERVATIONS + 10; i++) {
        recordVoiceObservation(testSessionId, {
          agentWpm: 140 + i,
          timestamp: Date.now(),
        });
      }

      const engine = getVoicePatternEngine(testSessionId, testUserId);
      expect(engine.observations.length).toBe(VOICE_PATTERN_CONFIG.MAX_SESSION_OBSERVATIONS);
    });
  });

  describe('Pattern Calculation', () => {
    it('returns default patterns with no observations', () => {
      getVoicePatternEngine(testSessionId, testUserId);
      const patterns = getVoicePatterns(testSessionId);

      expect(patterns).toBeDefined();
      expect(patterns?.preferredAgentWpm).toBe(VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm);
      expect(patterns?.preferredTurnGapMs).toBe(VOICE_PATTERN_CONFIG.DEFAULTS.turnGapMs);
      expect(patterns?.confidence).toBeGreaterThan(0);
    });

    it('updates WPM preference with EMA', () => {
      getVoicePatternEngine(testSessionId, testUserId);

      // Record several observations with faster WPM
      for (let i = 0; i < 10; i++) {
        recordVoiceObservation(testSessionId, {
          agentWpm: 180,
          timestamp: Date.now(),
        });
      }

      const patterns = getVoicePatterns(testSessionId);
      // Should have moved toward 180 from default 150
      expect(patterns?.preferredAgentWpm).toBeGreaterThan(VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm);
      expect(patterns?.preferredAgentWpm).toBeLessThan(180); // Not fully converged yet
    });

    it('updates turn gap preference with EMA', () => {
      getVoicePatternEngine(testSessionId, testUserId);

      // Record observations with shorter gaps
      for (let i = 0; i < 10; i++) {
        recordVoiceObservation(testSessionId, {
          turnGapMs: 400,
          timestamp: Date.now(),
        });
      }

      const patterns = getVoicePatterns(testSessionId);
      expect(patterns?.preferredTurnGapMs).toBeLessThan(VOICE_PATTERN_CONFIG.DEFAULTS.turnGapMs);
      expect(patterns?.prefersQuickResponses).toBe(true);
    });

    it('updates interruption probability with Bayesian update', () => {
      getVoicePatternEngine(testSessionId, testUserId);

      // Record several interruptions
      for (let i = 0; i < 5; i++) {
        recordVoiceObservation(testSessionId, {
          userInterrupted: true,
          timestamp: Date.now(),
        });
      }

      const patterns = getVoicePatterns(testSessionId);
      // Should have increased from default 0.1
      expect(patterns?.interruptionProbability).toBeGreaterThan(
        VOICE_PATTERN_CONFIG.DEFAULTS.interruptionProbability
      );
    });

    it('calculates confidence based on session count', () => {
      // New user with no history
      getVoicePatternEngine(testSessionId, testUserId);
      const newPatterns = getVoicePatterns(testSessionId);
      expect(newPatterns?.confidence).toBeLessThan(0.5);

      // Reset and create with historical data
      resetVoicePatternEngine(testSessionId);
      const persistedData: VoicePatternData = {
        userId: testUserId,
        preferredAgentWpm: 150,
        preferredTurnGapMs: 800,
        interruptionProbability: 0.1,
        prefersQuickResponses: false,
        timeOfDayPatterns: {
          morning: { preferredWpm: 150, preferredGapMs: 800, avgEnergy: 0.5, sampleCount: 0 },
          afternoon: { preferredWpm: 150, preferredGapMs: 800, avgEnergy: 0.5, sampleCount: 0 },
          evening: { preferredWpm: 150, preferredGapMs: 800, avgEnergy: 0.5, sampleCount: 0 },
          lateNight: { preferredWpm: 150, preferredGapMs: 800, avgEnergy: 0.5, sampleCount: 0 },
        },
        sessionCount: 20,
        totalObservations: 200,
        confidence: 0.75,
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      getVoicePatternEngine(testSessionId, testUserId, persistedData);
      const veteranPatterns = getVoicePatterns(testSessionId);
      expect(veteranPatterns?.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Time of Day Patterns', () => {
    it('correctly identifies time of day', () => {
      // Morning: 5-12
      const morning = new Date();
      morning.setHours(8, 0, 0, 0);
      expect(getCurrentTimeOfDay(morning.getTime())).toBe('morning');

      // Afternoon: 12-17
      const afternoon = new Date();
      afternoon.setHours(14, 0, 0, 0);
      expect(getCurrentTimeOfDay(afternoon.getTime())).toBe('afternoon');

      // Evening: 17-21
      const evening = new Date();
      evening.setHours(19, 0, 0, 0);
      expect(getCurrentTimeOfDay(evening.getTime())).toBe('evening');

      // Late night: 21-5
      const lateNight = new Date();
      lateNight.setHours(23, 0, 0, 0);
      expect(getCurrentTimeOfDay(lateNight.getTime())).toBe('lateNight');

      const earlyMorning = new Date();
      earlyMorning.setHours(3, 0, 0, 0);
      expect(getCurrentTimeOfDay(earlyMorning.getTime())).toBe('lateNight');
    });

    it('updates time-of-day specific patterns', () => {
      getVoicePatternEngine(testSessionId, testUserId);

      // Record morning observations
      const morningTime = new Date();
      morningTime.setHours(9, 0, 0, 0);

      for (let i = 0; i < 5; i++) {
        recordVoiceObservation(testSessionId, {
          agentWpm: 170,
          userEnergy: 0.8,
          timestamp: morningTime.getTime(),
        });
      }

      const patterns = getVoicePatterns(testSessionId);
      expect(patterns?.timeOfDayPatterns.morning.sampleCount).toBe(5);
      expect(patterns?.timeOfDayPatterns.morning.preferredWpm).toBeGreaterThan(150);
      expect(patterns?.timeOfDayPatterns.morning.avgEnergy).toBeGreaterThan(0.5);
    });
  });

  describe('Recommendations', () => {
    it('returns default WPM for low confidence', () => {
      getVoicePatternEngine(testSessionId, testUserId);
      const wpm = getRecommendedAgentWpm(testSessionId);
      expect(wpm).toBe(VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm);
    });

    it('returns learned WPM for high confidence users', () => {
      const persistedData: VoicePatternData = {
        userId: testUserId,
        preferredAgentWpm: 140,
        preferredTurnGapMs: 600,
        interruptionProbability: 0.1,
        prefersQuickResponses: true,
        timeOfDayPatterns: {
          morning: { preferredWpm: 150, preferredGapMs: 700, avgEnergy: 0.6, sampleCount: 5 },
          afternoon: { preferredWpm: 145, preferredGapMs: 650, avgEnergy: 0.55, sampleCount: 5 },
          evening: { preferredWpm: 135, preferredGapMs: 800, avgEnergy: 0.45, sampleCount: 5 },
          lateNight: { preferredWpm: 130, preferredGapMs: 900, avgEnergy: 0.35, sampleCount: 5 },
        },
        sessionCount: 15,
        totalObservations: 200,
        confidence: 0.75,
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      getVoicePatternEngine(testSessionId, testUserId, persistedData);

      const wpm = getRecommendedAgentWpm(testSessionId);
      // Should blend overall (140) with time-of-day pattern
      expect(wpm).not.toBe(VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm);
    });

    it('returns default gap for low confidence', () => {
      getVoicePatternEngine(testSessionId, testUserId);
      const gap = getRecommendedTurnGap(testSessionId);
      expect(gap).toBe(VOICE_PATTERN_CONFIG.DEFAULTS.turnGapMs);
    });
  });

  describe('Persisted Data Integration', () => {
    it('builds on persisted data with new observations', () => {
      const persistedData: VoicePatternData = {
        userId: testUserId,
        preferredAgentWpm: 140,
        preferredTurnGapMs: 700,
        interruptionProbability: 0.15,
        prefersQuickResponses: false,
        timeOfDayPatterns: {
          morning: { preferredWpm: 150, preferredGapMs: 700, avgEnergy: 0.5, sampleCount: 10 },
          afternoon: { preferredWpm: 145, preferredGapMs: 650, avgEnergy: 0.5, sampleCount: 10 },
          evening: { preferredWpm: 140, preferredGapMs: 800, avgEnergy: 0.5, sampleCount: 10 },
          lateNight: { preferredWpm: 135, preferredGapMs: 900, avgEnergy: 0.5, sampleCount: 10 },
        },
        sessionCount: 5,
        totalObservations: 50,
        confidence: 0.55,
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      getVoicePatternEngine(testSessionId, testUserId, persistedData);

      // Add new observations pushing toward faster pace
      for (let i = 0; i < 5; i++) {
        recordVoiceObservation(testSessionId, {
          agentWpm: 170,
          turnGapMs: 500,
          timestamp: Date.now(),
        });
      }

      const patterns = getVoicePatterns(testSessionId);

      // Should have moved toward 170 from 140
      expect(patterns?.preferredAgentWpm).toBeGreaterThan(140);
      // Should have moved toward 500 from 700
      expect(patterns?.preferredTurnGapMs).toBeLessThan(700);
      // Session count should increment
      expect(patterns?.sessionCount).toBe(6);
      // Total observations should increase
      expect(patterns?.totalObservations).toBe(55);
    });
  });
});
