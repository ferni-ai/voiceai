/**
 * Personal Journey Integration Tests
 *
 * Tests the full flow from session start to persistence,
 * ensuring all components work together correctly.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { clearChapterCache } from '../../services/personal-journey/chapter-detector.js';
import {
  clearAllJourneyCaches,
  getJourneySnapshot,
  selectMomentForTurn,
} from '../../services/personal-journey/journey-orchestrator.js';
import {
  clearRhythmCache,
  getRhythmStats,
} from '../../services/personal-journey/rhythm-awareness.js';
import { clearSeasonalCache } from '../../services/personal-journey/seasonal-memory.js';
import {
  cleanupPersonalJourney,
  getPersonalJourneyForPersistence,
  initPersonalJourney,
  updateJourneyFromConversation,
} from '../../services/personal-journey/session-integration.js';
import type { UserProfile } from '../../types/user-profile.js';

describe('Personal Journey Integration', () => {
  const testUserId = 'test-user-integration-123';

  beforeEach(() => {
    // Clear all caches
    clearRhythmCache(testUserId);
    clearSeasonalCache(testUserId);
    clearChapterCache(testUserId);
    clearAllJourneyCaches(testUserId);
  });

  describe('Session Lifecycle', () => {
    it('should initialize journey for new user', async () => {
      await initPersonalJourney(testUserId, null);

      // Should have recorded a session
      const stats = getRhythmStats(testUserId);
      expect(stats.totalConversations).toBe(1);
    });

    it('should initialize from existing profile data', async () => {
      // Create a mock profile with existing journey data
      const mockProfile = {
        id: testUserId,
        personalJourney: {
          rhythm: {
            userId: testUserId,
            updatedAt: new Date(),
            sessions: {
              totalCount: 10,
              firstSession: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
              lastSession: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
              averageSessionsPerWeek: 2,
              currentStreak: 3,
              longestStreak: 5,
            },
            timePreferences: {
              preferredHours: [9, 10, 11],
              preferredDays: [1, 2, 3, 4, 5],
              mostActiveTimeOfDay: 'morning' as const,
              weekdayVsWeekend: 'weekday' as const,
            },
            consistency: {
              averageGapDays: 3,
              longestGap: 7,
              isConsistent: true,
              currentGapDays: 1,
            },
            rhythmMilestones: [
              {
                type: 'first_conversation' as const,
                achievedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                acknowledged: true,
              },
            ],
          },
        },
      } as unknown as UserProfile;

      await initPersonalJourney(testUserId, mockProfile);

      // Should preserve existing data and increment
      const stats = getRhythmStats(testUserId);
      expect(stats.totalConversations).toBe(11); // 10 + 1 new session
    });

    it('should cleanup journey at session end', async () => {
      await initPersonalJourney(testUserId, null);

      // Get data before cleanup
      const beforeCleanup = getPersonalJourneyForPersistence(testUserId);
      expect(beforeCleanup.rhythm).toBeDefined();

      // Cleanup
      cleanupPersonalJourney(testUserId);

      // Cache should be cleared (new data created on access)
      const stats = getRhythmStats(testUserId);
      expect(stats.totalConversations).toBe(0); // Reset after cleanup
    });
  });

  describe('Conversation Analysis Integration', () => {
    it('should update journey from conversation data', async () => {
      await initPersonalJourney(testUserId, null);

      // Simulate conversation analysis
      await updateJourneyFromConversation(testUserId, {
        topics: ['career', 'job search', 'interview'],
        emotions: ['anxious', 'hopeful'],
        keyMoments: ['Decided to apply for dream job'],
        wins: ['Got an interview callback'],
        struggles: ['Nervous about salary negotiation'],
      });

      // Check that chapter detection was updated
      const journeyData = getPersonalJourneyForPersistence(testUserId);
      expect(journeyData.chapters).toBeDefined();
    });
  });

  describe('Moment Selection Flow', () => {
    it('should select appropriate moment for greeting', async () => {
      await initPersonalJourney(testUserId, null);

      // First session should have first_conversation milestone
      const moment = selectMomentForTurn(testUserId, {
        isGreeting: true,
        turnCount: 0,
      });

      // May or may not select a moment
      expect(moment === null || moment?.type !== undefined).toBe(true);
    });

    it('should select different moments for mid-conversation', async () => {
      await initPersonalJourney(testUserId, null);

      // Update with some conversation data
      await updateJourneyFromConversation(testUserId, {
        topics: ['stress', 'work-life balance'],
        emotions: ['tired', 'overwhelmed'],
      });

      const moment = selectMomentForTurn(testUserId, {
        isGreeting: false,
        turnCount: 5,
        userText: 'I feel so overwhelmed lately',
      });

      // May get community wisdom or chapter-related moment
      expect(moment === null || moment?.id !== undefined).toBe(true);
    });
  });

  describe('Persistence Flow', () => {
    it('should produce valid persistence data', async () => {
      await initPersonalJourney(testUserId, null);

      // Add some activity
      await updateJourneyFromConversation(testUserId, {
        topics: ['health', 'fitness', 'goals'],
        emotions: ['motivated'],
        wins: ['Started workout routine'],
      });

      // Get persistence data
      const persistData = getPersonalJourneyForPersistence(testUserId);

      // Validate structure
      expect(persistData.userId).toBe(testUserId);
      expect(persistData.rhythm).toBeDefined();
      expect(persistData.rhythm?.sessions.totalCount).toBeGreaterThan(0);
      expect(persistData.updatedAt).toBeInstanceOf(Date);
    });

    it('should round-trip data correctly', async () => {
      // Initialize fresh
      await initPersonalJourney(testUserId, null);

      // Add data
      await updateJourneyFromConversation(testUserId, {
        topics: ['family', 'parenting'],
        emotions: ['happy'],
      });

      // Get persistence data
      const persistData = getPersonalJourneyForPersistence(testUserId);
      const originalCount = persistData.rhythm?.sessions.totalCount || 0;

      // Cleanup
      cleanupPersonalJourney(testUserId);

      // Re-initialize with persisted data
      const mockProfile = {
        id: testUserId,
        personalJourney: persistData,
      } as unknown as UserProfile;

      await initPersonalJourney(testUserId, mockProfile);

      // Verify data was restored (and incremented by 1 for new session)
      const stats = getRhythmStats(testUserId);
      expect(stats.totalConversations).toBe(originalCount + 1);
    });
  });

  describe('Snapshot Generation', () => {
    it('should generate valid journey snapshot', async () => {
      await initPersonalJourney(testUserId, null);

      const snapshot = getJourneySnapshot(testUserId);

      expect(snapshot.userId).toBe(testUserId);
      expect(snapshot.stats).toBeDefined();
      expect(snapshot.stats.totalConversations).toBeGreaterThan(0);
      expect(snapshot.stats.daysKnown).toBeGreaterThanOrEqual(0);
      expect(snapshot.availableMoments).toBeDefined();
      expect(snapshot.capturedAt).toBeInstanceOf(Date);
    });

    it('should track relationship stage', async () => {
      await initPersonalJourney(testUserId, null);

      const snapshot = getJourneySnapshot(testUserId);

      expect(['new', 'building', 'established', 'deep']).toContain(
        snapshot.stats.relationshipStage
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle init with undefined profile gracefully', async () => {
      await expect(initPersonalJourney(testUserId, undefined)).resolves.not.toThrow();
    });

    it('should handle cleanup of non-existent user gracefully', () => {
      expect(() => cleanupPersonalJourney('non-existent-user')).not.toThrow();
    });

    it('should handle update with empty data gracefully', async () => {
      await initPersonalJourney(testUserId, null);

      await expect(
        updateJourneyFromConversation(testUserId, {
          topics: [],
          emotions: [],
        })
      ).resolves.not.toThrow();
    });
  });
});
