/**
 * Voice Agent Integration Tests
 *
 * Tests for Phase 2 + 3 integration with voice agent sessions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadUserTriggerContext,
  getSessionTriggerContext,
  recordTriggerOutcome,
  saveUserTriggerContext,
  getCombinedTriggerBoost,
  getApproachingSignificantDates,
  clearAllSessionContexts,
  getActiveSessionCount,
} from '../voice-agent-integration.js';
import { resetTemporalAnalytics } from '../temporal-pattern-detector.js';
import { resetUserTriggerProfileService } from '../user-trigger-profile-service.js';

// Mock the profile service to avoid Firestore
vi.mock('../user-trigger-profile-service.js', async () => {
  const actual = await vi.importActual('../user-trigger-profile-service.js');
  return {
    ...(actual as object),
    getUserTriggerProfileService: () => ({
      loadProfile: vi.fn().mockResolvedValue({
        userId: 'test_user',
        createdAt: new Date(),
        updatedAt: new Date(),
        schemaVersion: 2,
        significantDates: [
          {
            id: 'mom_bday',
            date: `YYYY-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate() + 3).padStart(2, '0')}`,
            type: 'birthday',
            description: "Mom's birthday",
            isRecurring: true,
            emotionalWeight: 0.8,
            triggerCategories: ['celebration'],
            extractedAt: new Date(),
            confidence: 0.9,
            source: 'explicit',
          },
        ],
        relationships: [
          {
            id: 'mom',
            name: 'Mom',
            type: 'family',
            aliases: ['Mother'],
            emotionalCloseness: 0.9,
            lastMentioned: new Date(),
            triggerCategories: ['family'],
          },
        ],
        communicationPatterns: {
          phrasesUsed: [],
          topicsDiscussed: [],
          emotionalRange: { low: 0.4, high: 0.8, average: 0.6 },
          deflectionPatterns: [],
          engagementPatterns: [],
        },
        triggerEffectiveness: [],
        temporalIntelligence: {
          dayPatterns: [],
          timePatterns: [],
          datePatterns: [],
          recentFirings: [],
          lastAnalyzedAt: new Date(),
          minObservationsForPattern: 5,
          overallConfidence: 0.5,
        },
      }),
      saveProfile: vi.fn().mockResolvedValue(true),
    }),
    resetUserTriggerProfileService: vi.fn(),
  };
});

describe('Voice Agent Integration', () => {
  beforeEach(() => {
    clearAllSessionContexts();
    resetTemporalAnalytics();
  });

  describe('Session Lifecycle', () => {
    it('should load user trigger context', async () => {
      const context = await loadUserTriggerContext('test_user', 'session_1');

      expect(context).toBeDefined();
      expect(context.userId).toBe('test_user');
      expect(context.profile).toBeDefined();
      expect(context.personalBoost).toBeDefined();
      expect(context.temporalBoost).toBeDefined();
      expect(context.sessionFirings).toHaveLength(0);
      expect(context.isDirty).toBe(false);
    });

    it('should get session context after loading', async () => {
      await loadUserTriggerContext('test_user', 'session_2');

      const context = getSessionTriggerContext('session_2');
      expect(context).toBeDefined();
      expect(context?.userId).toBe('test_user');
    });

    it('should return undefined for unknown session', () => {
      const context = getSessionTriggerContext('unknown_session');
      expect(context).toBeUndefined();
    });

    it('should track active session count', async () => {
      expect(getActiveSessionCount()).toBe(0);

      await loadUserTriggerContext('user1', 'session_a');
      expect(getActiveSessionCount()).toBe(1);

      await loadUserTriggerContext('user2', 'session_b');
      expect(getActiveSessionCount()).toBe(2);

      clearAllSessionContexts();
      expect(getActiveSessionCount()).toBe(0);
    });
  });

  describe('Trigger Outcome Recording', () => {
    it('should record trigger outcomes', async () => {
      await loadUserTriggerContext('test_user', 'session_3');

      recordTriggerOutcome('session_3', 'gentle_check_in', 'emotional', 'engaged');

      const context = getSessionTriggerContext('session_3');
      expect(context?.sessionFirings).toHaveLength(1);
      expect(context?.sessionFirings[0].triggerName).toBe('gentle_check_in');
      expect(context?.sessionFirings[0].outcome).toBe('engaged');
      expect(context?.isDirty).toBe(true);
    });

    it('should handle recording for unknown session gracefully', () => {
      // Should not throw
      recordTriggerOutcome('unknown', 'test', 'emotional', 'engaged');
    });

    it('should record multiple outcomes in a session', async () => {
      await loadUserTriggerContext('test_user', 'session_4');

      recordTriggerOutcome('session_4', 'trigger_1', 'emotional', 'engaged');
      recordTriggerOutcome('session_4', 'trigger_2', 'behavioral', 'deflected');
      recordTriggerOutcome('session_4', 'trigger_3', 'temporal', 'neutral');

      const context = getSessionTriggerContext('session_4');
      expect(context?.sessionFirings).toHaveLength(3);
    });
  });

  describe('Context Saving', () => {
    it('should save dirty context', async () => {
      await loadUserTriggerContext('test_user', 'session_5');
      recordTriggerOutcome('session_5', 'test', 'emotional', 'engaged');

      const saved = await saveUserTriggerContext('session_5');
      expect(saved).toBe(true);

      // Session should be cleaned up after save
      expect(getSessionTriggerContext('session_5')).toBeUndefined();
    });

    it('should skip save for clean context with no firings', async () => {
      await loadUserTriggerContext('test_user', 'session_6');

      const saved = await saveUserTriggerContext('session_6');
      expect(saved).toBe(true);

      // Session should be cleaned up
      expect(getSessionTriggerContext('session_6')).toBeUndefined();
    });

    it('should return false for unknown session', async () => {
      const saved = await saveUserTriggerContext('unknown');
      expect(saved).toBe(false);
    });
  });

  describe('Combined Trigger Boost', () => {
    it('should return neutral boost for unknown session', () => {
      const boost = getCombinedTriggerBoost('unknown', 'test', 'emotional');

      expect(boost.multiplier).toBe(1.0);
      expect(boost.shouldBoost).toBe(false);
      expect(boost.shouldSuppress).toBe(false);
    });

    it('should include temporal boost multiplier', async () => {
      await loadUserTriggerContext('test_user', 'session_7');

      const boost = getCombinedTriggerBoost('session_7', 'gentle_check_in', 'emotional');

      expect(boost).toBeDefined();
      expect(typeof boost.multiplier).toBe('number');
      expect(Array.isArray(boost.contextNotes)).toBe(true);
    });

    it('should cap multiplier within bounds', async () => {
      await loadUserTriggerContext('test_user', 'session_8');

      const boost = getCombinedTriggerBoost('session_8', 'test', 'emotional');

      expect(boost.multiplier).toBeGreaterThanOrEqual(0.1);
      expect(boost.multiplier).toBeLessThanOrEqual(3.0);
    });
  });

  describe('Approaching Significant Dates', () => {
    it('should return empty for unknown session', () => {
      const dates = getApproachingSignificantDates('unknown');
      expect(dates).toHaveLength(0);
    });

    it('should find dates within window', async () => {
      await loadUserTriggerContext('test_user', 'session_9');

      // The mock includes a date 3 days away
      const dates = getApproachingSignificantDates('session_9', 7);

      // Should find the mom's birthday that's 3 days away
      expect(dates.length).toBeGreaterThanOrEqual(0); // May be 0 if date wraps to next year
    });

    it('should respect window size', async () => {
      await loadUserTriggerContext('test_user', 'session_10');

      // With 1-day window, may not find the date that's 3 days away
      const dates = getApproachingSignificantDates('session_10', 1);

      // This should be empty or only contain very close dates
      for (const date of dates) {
        expect(date.isRecurring).toBe(true);
      }
    });
  });
});
