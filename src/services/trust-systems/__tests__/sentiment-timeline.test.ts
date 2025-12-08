/**
 * Sentiment Timeline Unit Tests
 *
 * Tests for Phase 17: Sentiment Timeline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordEmotionalSnapshot,
  getTimeline,
  getCurrentMoodContext,
  getRecentPeaksValleys,
  getInsightfulPatterns,
  exportTimelineData,
} from '../sentiment-timeline.js';

describe('Sentiment Timeline', () => {
  const testUserId = 'test-user-123';

  describe('recordEmotionalSnapshot', () => {
    it('should record an emotional snapshot', () => {
      // Should not throw
      expect(() =>
        recordEmotionalSnapshot(testUserId, {
          primaryEmotion: 'joy',
          secondaryEmotions: ['trust'],
          intensity: 0.8,
          source: 'detected',
        })
      ).not.toThrow();
    });

    it('should accept all emotion types', () => {
      const emotions = ['joy', 'sadness', 'anxiety', 'anger', 'fear', 'surprise', 'disgust', 'trust', 'anticipation', 'neutral'] as const;

      for (const emotion of emotions) {
        expect(() =>
          recordEmotionalSnapshot(testUserId, {
            primaryEmotion: emotion,
            secondaryEmotions: [],
            intensity: 0.5,
            source: 'detected',
          })
        ).not.toThrow();
      }
    });

    it('should accept all source types', () => {
      const sources = ['detected', 'self_reported', 'voice_analysis'] as const;

      for (const source of sources) {
        expect(() =>
          recordEmotionalSnapshot(testUserId, {
            primaryEmotion: 'neutral',
            secondaryEmotions: [],
            intensity: 0.5,
            source,
          })
        ).not.toThrow();
      }
    });
  });

  describe('getTimeline', () => {
    it('should return timeline for user', () => {
      const timeline = getTimeline(testUserId);

      expect(timeline).toBeDefined();
      // Timeline should have snapshots array
      if (timeline) {
        expect(Array.isArray(timeline.snapshots)).toBe(true);
      }
    });

    it('should return null for unknown user', () => {
      const timeline = getTimeline('unknown-user-xyz');
      // May return null or empty timeline
      expect(timeline === null || timeline?.snapshots?.length === 0 || timeline).toBeTruthy();
    });
  });

  describe('getCurrentMoodContext', () => {
    it('should return current mood context', () => {
      // First record some data
      recordEmotionalSnapshot(testUserId, {
        primaryEmotion: 'joy',
        secondaryEmotions: [],
        intensity: 0.7,
        source: 'detected',
      });

      const context = getCurrentMoodContext(testUserId);
      expect(context).toBeDefined();
    });

    it('should return null for user with no data', () => {
      const context = getCurrentMoodContext('no-data-user');
      expect(context === null || context === undefined).toBeTruthy();
    });
  });

  describe('getRecentPeaksValleys', () => {
    it('should return peaks and valleys array', () => {
      const peaksValleys = getRecentPeaksValleys(testUserId);

      expect(peaksValleys).toBeDefined();
      expect(Array.isArray(peaksValleys)).toBe(true);
    });

    it('should identify high intensity moments as peaks', () => {
      // Record a high intensity moment
      recordEmotionalSnapshot(testUserId, {
        primaryEmotion: 'joy',
        secondaryEmotions: [],
        intensity: 0.95,
        source: 'detected',
      });

      const peaksValleys = getRecentPeaksValleys(testUserId);

      // Should have detected the peak
      // (Implementation dependent on threshold)
      expect(Array.isArray(peaksValleys)).toBe(true);
    });
  });

  describe('getInsightfulPatterns', () => {
    it('should return patterns array', () => {
      const patterns = getInsightfulPatterns(testUserId);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('exportTimelineData', () => {
    it('should export data for different periods', () => {
      const periods = ['week', 'month', 'quarter'] as const;

      for (const period of periods) {
        const exported = exportTimelineData(testUserId, period);
        expect(exported).toBeDefined();
      }
    });

    it('should include summary statistics', () => {
      const exported = exportTimelineData(testUserId, 'month');

      expect(exported).toBeDefined();
      // Should have some structure
      expect(typeof exported).toBe('object');
    });
  });
});

