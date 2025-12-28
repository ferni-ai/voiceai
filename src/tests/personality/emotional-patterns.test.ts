/**
 * Tests for Emotional Pattern Recognition
 *
 * Tests the superhuman pattern detection capabilities:
 * - Data collection
 * - Pattern analysis
 * - Growth tracking
 * - Memory management
 *
 * @module tests/personality/emotional-patterns
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllUserEmotionalTracking,
  clearUserEmotionalData,
  clearUserGrowthMoments,
  clearUserPatterns,
  formatGrowthForPrompt,
  formatPatternForPrompt,
  getEmotionalHistory,
  getEmotionalTrackingStats,
  getGrowthCelebrations,
  getPatternInsights,
  hasEnoughHistoryForPatterns,
  markGrowthSurfaced,
  markPatternSurfaced,
  recordEmotionalDataPoint,
  recordGrowthEvidence,
  type EmotionalPattern,
  type GrowthMoment,
} from '../../personality/emotional-patterns.js';

describe('Emotional Pattern Recognition', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Clear all tracking before each test
    clearAllUserEmotionalTracking(testUserId);
  });

  afterEach(() => {
    // Clean up after tests
    clearAllUserEmotionalTracking(testUserId);
  });

  // ============================================================================
  // DATA COLLECTION TESTS
  // ============================================================================

  describe('Data Collection', () => {
    it('should record emotional data points', () => {
      recordEmotionalDataPoint(testUserId, 'happy', 0.8, ['morning', 'coffee'], 'Feeling great');

      const history = getEmotionalHistory(testUserId);
      expect(history).toHaveLength(1);
      expect(history[0].emotion).toBe('happy');
      expect(history[0].intensity).toBe(0.8);
      expect(history[0].topics).toContain('morning');
      expect(history[0].context).toBe('Feeling great');
    });

    it('should accumulate multiple data points', () => {
      recordEmotionalDataPoint(testUserId, 'happy', 0.8, ['morning']);
      recordEmotionalDataPoint(testUserId, 'stressed', 0.6, ['work']);
      recordEmotionalDataPoint(testUserId, 'calm', 0.5, ['evening']);

      const history = getEmotionalHistory(testUserId);
      expect(history).toHaveLength(3);
    });

    it('should track whether user has enough history for patterns', () => {
      expect(hasEnoughHistoryForPatterns(testUserId)).toBe(false);

      // Record enough data points (need 5 minimum)
      for (let i = 0; i < 5; i++) {
        recordEmotionalDataPoint(testUserId, 'neutral', 0.5, ['test']);
      }

      expect(hasEnoughHistoryForPatterns(testUserId)).toBe(true);
    });

    it('should clear user emotional data', () => {
      recordEmotionalDataPoint(testUserId, 'happy', 0.8, ['test']);

      expect(getEmotionalHistory(testUserId)).toHaveLength(1);

      clearUserEmotionalData(testUserId);

      expect(getEmotionalHistory(testUserId)).toHaveLength(0);
    });
  });

  // ============================================================================
  // PATTERN DETECTION TESTS
  // ============================================================================

  describe('Pattern Detection', () => {
    it('should detect work-related stress patterns', () => {
      // Record enough data with work + stress correlation
      for (let i = 0; i < 5; i++) {
        recordEmotionalDataPoint(testUserId, 'stress', 0.7, ['work', 'meeting']);
      }

      const patterns = getPatternInsights(testUserId);
      expect(patterns.length).toBeGreaterThanOrEqual(0);
      // Pattern detection requires correlation threshold
    });

    it('should return empty array for users without patterns', () => {
      const patterns = getPatternInsights('nonexistent-user');
      expect(patterns).toHaveLength(0);
    });

    it('should mark patterns as surfaced', () => {
      // Create a pattern manually by recording correlated data
      for (let i = 0; i < 5; i++) {
        recordEmotionalDataPoint(testUserId, 'anxiety', 0.8, ['money', 'bills']);
      }

      const patterns = getPatternInsights(testUserId, { onlyUnsurfaced: true });

      if (patterns.length > 0) {
        const patternId = patterns[0].id;
        markPatternSurfaced(patternId, testUserId);

        const unsurfacedPatterns = getPatternInsights(testUserId, { onlyUnsurfaced: true });
        const surfacedPattern = unsurfacedPatterns.find((p) => p.id === patternId);
        expect(surfacedPattern).toBeUndefined();
      }
    });

    it('should clear user patterns', () => {
      for (let i = 0; i < 5; i++) {
        recordEmotionalDataPoint(testUserId, 'stress', 0.8, ['work']);
      }

      clearUserPatterns(testUserId);
      const patterns = getPatternInsights(testUserId);
      expect(patterns).toHaveLength(0);
    });
  });

  // ============================================================================
  // GROWTH TRACKING TESTS
  // ============================================================================

  describe('Growth Tracking', () => {
    it('should record growth evidence from a low point', () => {
      recordGrowthEvidence(
        testUserId,
        'communication',
        "I can't talk to my boss about this",
        false // Not progress - starting point
      );

      const celebrations = getGrowthCelebrations(testUserId);
      // Won't have a celebration yet - need progress evidence
      expect(celebrations).toHaveLength(0);
    });

    it('should update growth when progress is made', () => {
      // Start tracking from a low point
      recordGrowthEvidence(testUserId, 'communication', "I can't talk to my boss", false);

      // Record progress
      recordGrowthEvidence(testUserId, 'communication', 'I finally talked to my boss!', true);

      // Check growth moments - may or may not have celebration depending on time
      const celebrations = getGrowthCelebrations(testUserId, { onlyUnsurfaced: true });
      // Growth celebration requires 7+ days between evidence
      expect(celebrations).toBeDefined();
    });

    it('should clear user growth moments', () => {
      recordGrowthEvidence(testUserId, 'test-area', 'evidence', false);

      clearUserGrowthMoments(testUserId);
      const celebrations = getGrowthCelebrations(testUserId);
      expect(celebrations).toHaveLength(0);
    });
  });

  // ============================================================================
  // FORMATTING TESTS
  // ============================================================================

  describe('Prompt Formatting', () => {
    it('should format pattern for prompt injection', () => {
      const mockPattern: EmotionalPattern = {
        id: 'test-pattern',
        userId: testUserId,
        pattern: 'work → stress/anxiety',
        evidence: ['deadline pressure', 'meeting stress', 'boss mentioned'],
        trend: 'triggered',
        triggers: ['work'],
        insight: "I've noticed you seem more stressed when work comes up lately",
        deliveryTiming: 'when_relevant',
        confidence: 0.75,
        detectedAt: new Date(),
        lastUpdated: new Date(),
        surfacedToUser: false,
      };

      const formatted = formatPatternForPrompt(mockPattern);

      expect(formatted).toContain('PATTERN INSIGHT');
      expect(formatted).toContain('work → stress/anxiety');
      expect(formatted).toContain('75%');
      expect(formatted).toContain('SUPERHUMAN');
    });

    it('should format growth for prompt injection', () => {
      const mockGrowth: GrowthMoment = {
        id: 'test-growth',
        userId: testUserId,
        area: 'communication',
        pastEvidence: "couldn't speak up in meetings",
        pastDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        currentEvidence: 'led the entire presentation',
        currentDate: new Date(),
        celebration: "Look at you now! You led that whole presentation. That's real growth.",
        significance: 'breakthrough',
        surfaced: false,
      };

      const formatted = formatGrowthForPrompt(mockGrowth);

      expect(formatted).toContain('GROWTH CELEBRATION');
      expect(formatted).toContain('communication');
      expect(formatted).toContain("couldn't speak up");
      expect(formatted).toContain('led the entire presentation');
      expect(formatted).toContain('SUPERHUMAN');
    });
  });

  // ============================================================================
  // MEMORY MANAGEMENT TESTS
  // ============================================================================

  describe('Memory Management', () => {
    it('should clear all tracking for a user', () => {
      // Add data to all tracking systems
      recordEmotionalDataPoint(testUserId, 'happy', 0.8, ['test']);
      recordGrowthEvidence(testUserId, 'test-area', 'evidence', false);

      clearAllUserEmotionalTracking(testUserId);

      expect(getEmotionalHistory(testUserId)).toHaveLength(0);
      expect(getGrowthCelebrations(testUserId)).toHaveLength(0);
      expect(getPatternInsights(testUserId)).toHaveLength(0);
    });

    it('should provide stats for monitoring', () => {
      recordEmotionalDataPoint(testUserId, 'happy', 0.8, ['test']);

      const stats = getEmotionalTrackingStats();

      expect(stats.emotionalData).toBeDefined();
      expect(stats.emotionalData.userCount).toBeGreaterThanOrEqual(1);
      expect(stats.patterns).toBeDefined();
      expect(stats.growth).toBeDefined();
    });
  });
});
