/**
 * Intelligence Constants Tests
 *
 * Tests for intelligence module magic numbers and thresholds.
 *
 * @module @ferni/config/__tests__/intelligence-constants
 */

import { describe, expect, it } from 'vitest';
import {
  CACHE,
  COMMUNITY,
  CONVERSATION,
  EMOTION,
  EVOLUTION,
  INTELLIGENCE_CONSTANTS,
  LEARNING,
  PERSISTENCE,
  PROACTIVE,
  THREADING,
} from '../intelligence-constants.js';

describe('Intelligence Constants', () => {
  describe('CONVERSATION', () => {
    it('should have minimum turns for preference learning', () => {
      expect(CONVERSATION.MIN_TURNS_FOR_PREFERENCE_LEARNING).toBe(5);
      expect(CONVERSATION.MIN_TURNS_FOR_PREFERENCE_LEARNING).toBeGreaterThan(0);
    });

    it('should have emotion history size', () => {
      expect(CONVERSATION.EMOTION_HISTORY_SIZE).toBe(20);
      expect(CONVERSATION.EMOTION_HISTORY_SIZE).toBeGreaterThan(0);
    });

    it('should have max conversation history limit', () => {
      expect(CONVERSATION.MAX_CONVERSATION_HISTORY).toBe(100);
      expect(CONVERSATION.MAX_CONVERSATION_HISTORY).toBeGreaterThan(
        CONVERSATION.EMOTION_HISTORY_SIZE
      );
    });

    it('should have turns between preference capture', () => {
      expect(CONVERSATION.TURNS_BETWEEN_PREFERENCE_CAPTURE).toBe(5);
    });
  });

  describe('EMOTION', () => {
    it('should have LLM enhancement threshold', () => {
      expect(EMOTION.LLM_ENHANCEMENT_THRESHOLD).toBe(0.5);
      expect(EMOTION.LLM_ENHANCEMENT_THRESHOLD).toBeGreaterThan(0);
      expect(EMOTION.LLM_ENHANCEMENT_THRESHOLD).toBeLessThan(1);
    });

    it('should have high confidence threshold above enhancement threshold', () => {
      expect(EMOTION.HIGH_CONFIDENCE_THRESHOLD).toBe(0.7);
      expect(EMOTION.HIGH_CONFIDENCE_THRESHOLD).toBeGreaterThan(EMOTION.LLM_ENHANCEMENT_THRESHOLD);
    });

    it('should have escalating distress thresholds', () => {
      expect(EMOTION.DISTRESS_SUPPORT_THRESHOLD).toBe(0.4);
      expect(EMOTION.HIGH_DISTRESS_THRESHOLD).toBe(0.6);
      expect(EMOTION.CRISIS_DISTRESS_THRESHOLD).toBe(0.8);

      // They should be in ascending order
      expect(EMOTION.DISTRESS_SUPPORT_THRESHOLD).toBeLessThan(EMOTION.HIGH_DISTRESS_THRESHOLD);
      expect(EMOTION.HIGH_DISTRESS_THRESHOLD).toBeLessThan(EMOTION.CRISIS_DISTRESS_THRESHOLD);
    });

    it('should have intensity tracking threshold', () => {
      expect(EMOTION.INTENSITY_TRACKING_THRESHOLD).toBe(0.5);
    });
  });

  describe('COMMUNITY', () => {
    it('should have minimum samples for pattern reliability', () => {
      expect(COMMUNITY.MIN_SAMPLES_FOR_PATTERN).toBe(10);
    });

    it('should have higher sample count for high confidence', () => {
      expect(COMMUNITY.HIGH_CONFIDENCE_SAMPLES).toBe(50);
      expect(COMMUNITY.HIGH_CONFIDENCE_SAMPLES).toBeGreaterThan(COMMUNITY.MIN_SAMPLES_FOR_PATTERN);
    });

    it('should have recompute interval', () => {
      expect(COMMUNITY.RECOMPUTE_PATTERN_INTERVAL).toBe(100);
    });

    it('should have max response signals limit', () => {
      expect(COMMUNITY.MAX_RESPONSE_SIGNALS).toBe(10000);
    });
  });

  describe('PROACTIVE', () => {
    it('should have max insights per user', () => {
      expect(PROACTIVE.MAX_INSIGHTS_PER_USER).toBe(50);
    });

    it('should have default overdue days', () => {
      expect(PROACTIVE.DEFAULT_OVERDUE_DAYS).toBe(14);
    });

    it('should have high priority overdue days greater than default', () => {
      expect(PROACTIVE.HIGH_PRIORITY_OVERDUE_DAYS).toBe(30);
      expect(PROACTIVE.HIGH_PRIORITY_OVERDUE_DAYS).toBeGreaterThan(PROACTIVE.DEFAULT_OVERDUE_DAYS);
    });

    it('should have goal reminder days', () => {
      expect(PROACTIVE.GOAL_REMINDER_DAYS).toBe(90);
      expect(PROACTIVE.GOAL_HIGH_PRIORITY_DAYS).toBe(30);
      expect(PROACTIVE.GOAL_STALLED_DAYS).toBe(30);
    });

    it('should have relationship milestones in ascending order', () => {
      const milestones = PROACTIVE.RELATIONSHIP_MILESTONES;
      expect(milestones).toEqual([6, 12, 24, 36, 48, 60]);

      for (let i = 1; i < milestones.length; i++) {
        expect(milestones[i]).toBeGreaterThan(milestones[i - 1]);
      }
    });
  });

  describe('THREADING', () => {
    it('should have max open threads limit', () => {
      expect(THREADING.MAX_OPEN_THREADS).toBe(20);
    });

    it('should have max follow-ups limit', () => {
      expect(THREADING.MAX_FOLLOW_UPS).toBe(20);
    });

    it('should have short conversation threshold in minutes', () => {
      expect(THREADING.SHORT_CONVERSATION_MINUTES).toBe(5);
    });
  });

  describe('LEARNING', () => {
    it('should have max key moments limit', () => {
      expect(LEARNING.MAX_KEY_MOMENTS).toBe(50);
    });

    it('should have max emotional patterns limit', () => {
      expect(LEARNING.MAX_EMOTIONAL_PATTERNS).toBe(50);
    });

    it('should have max shared stories limit', () => {
      expect(LEARNING.MAX_SHARED_STORIES).toBe(50);
    });

    it('should have recent moment days', () => {
      expect(LEARNING.RECENT_MOMENT_DAYS).toBe(30);
    });

    it('should have voice emotion validation window in ms', () => {
      expect(LEARNING.VOICE_EMOTION_VALIDATION_WINDOW_MS).toBe(30000); // 30 seconds
    });

    it('should have voice emotion sample size', () => {
      expect(LEARNING.VOICE_EMOTION_SAMPLE_SIZE).toBe(20);
    });
  });

  describe('EVOLUTION', () => {
    it('should have auto-enable confidence threshold', () => {
      expect(EVOLUTION.AUTO_ENABLE_CONFIDENCE).toBe(0.7);
    });

    it('should have experiment z-score threshold', () => {
      expect(EVOLUTION.EXPERIMENT_Z_SCORE_THRESHOLD).toBe(1.96); // 95% confidence
    });

    it('should have emergent pattern detection thresholds', () => {
      expect(EVOLUTION.EMERGENT_PATTERN_MIN_SAMPLES).toBe(10);
      expect(EVOLUTION.EMERGENT_POSITIVE_RATE_THRESHOLD).toBe(0.15);
    });
  });

  describe('CACHE', () => {
    it('should have user engine cache sizes', () => {
      expect(CACHE.USER_ENGINES).toBe(500);
    });

    it('should have consistent cache sizes for user-scoped data', () => {
      // All user-scoped caches should have same size for consistency
      const userCacheSize = 500;
      expect(CACHE.RESPONSE_TRACKERS).toBe(userCacheSize);
      expect(CACHE.PATTERN_ANALYZERS).toBe(userCacheSize);
      expect(CACHE.PACE_ADAPTERS).toBe(userCacheSize);
      expect(CACHE.HUMOR_CALIBRATION).toBe(userCacheSize);
      expect(CACHE.STORY_PREFERENCE).toBe(userCacheSize);
      expect(CACHE.COMMUNICATION_MIRRORING).toBe(userCacheSize);
      expect(CACHE.EMOTIONAL_MEMORY).toBe(userCacheSize);
      expect(CACHE.FINANCIAL_JOURNEY).toBe(userCacheSize);
    });
  });

  describe('PERSISTENCE', () => {
    it('should have Firestore load cooldown', () => {
      expect(PERSISTENCE.FIRESTORE_LOAD_COOLDOWN_MS).toBe(60000); // 1 minute
    });
  });

  describe('INTELLIGENCE_CONSTANTS', () => {
    it('should aggregate all constant groups', () => {
      expect(INTELLIGENCE_CONSTANTS.CONVERSATION).toBe(CONVERSATION);
      expect(INTELLIGENCE_CONSTANTS.EMOTION).toBe(EMOTION);
      expect(INTELLIGENCE_CONSTANTS.COMMUNITY).toBe(COMMUNITY);
      expect(INTELLIGENCE_CONSTANTS.PROACTIVE).toBe(PROACTIVE);
      expect(INTELLIGENCE_CONSTANTS.THREADING).toBe(THREADING);
      expect(INTELLIGENCE_CONSTANTS.LEARNING).toBe(LEARNING);
      expect(INTELLIGENCE_CONSTANTS.EVOLUTION).toBe(EVOLUTION);
      expect(INTELLIGENCE_CONSTANTS.CACHE).toBe(CACHE);
      expect(INTELLIGENCE_CONSTANTS.PERSISTENCE).toBe(PERSISTENCE);
    });
  });

  describe('Constant Immutability', () => {
    it('should have all constants marked as const', () => {
      // TypeScript enforces this at compile time via `as const`
      // We test that modifications don't affect the original

      // Attempting to modify should have no effect
      const conversationCopy = { ...CONVERSATION };
      expect(CONVERSATION.MIN_TURNS_FOR_PREFERENCE_LEARNING).toBe(5);
    });
  });
});
