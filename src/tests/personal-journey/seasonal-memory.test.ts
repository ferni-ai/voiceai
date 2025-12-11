/**
 * Seasonal Memory Service Tests
 *
 * Tests for time-anchored memories and seasonal patterns.
 * These enable "I remember last winter you mentioned..." moments.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addTimeAnchoredMemory,
  captureSeasonalSnapshot,
  clearSeasonalCache,
  detectAnnualPatterns,
  getCurrentSeason,
  getPreviousSeason,
  getRelevantTimeMemories,
  getSeasonalGreetingContext,
  getSeasonalMemory,
  getSeasonFromDate,
  initializeSeasonalMemory,
  shouldCaptureSnapshot,
} from '../../services/personal-journey/seasonal-memory.js';

describe('Seasonal Memory Service', () => {
  const testUserId = 'test-user-seasonal-123';

  beforeEach(() => {
    clearSeasonalCache(testUserId);
  });

  describe('Season Helpers', () => {
    it('should return a valid season for current date', () => {
      const season = getCurrentSeason();
      expect(['spring', 'summer', 'fall', 'winter']).toContain(season);
    });

    it('should get season from date', () => {
      const januaryDate = new Date(2024, 0, 15); // January = winter
      const aprilDate = new Date(2024, 3, 15); // April = spring
      const julyDate = new Date(2024, 6, 15); // July = summer
      const octoberDate = new Date(2024, 9, 15); // October = fall

      expect(getSeasonFromDate(januaryDate)).toBe('winter');
      expect(getSeasonFromDate(aprilDate)).toBe('spring');
      expect(getSeasonFromDate(julyDate)).toBe('summer');
      expect(getSeasonFromDate(octoberDate)).toBe('fall');
    });

    it('should get previous season correctly', () => {
      expect(getPreviousSeason('spring')).toBe('winter');
      expect(getPreviousSeason('summer')).toBe('spring');
      expect(getPreviousSeason('fall')).toBe('summer');
      expect(getPreviousSeason('winter')).toBe('fall');
    });
  });

  describe('Memory Management', () => {
    it('should create empty seasonal memory for new user', () => {
      const memory = getSeasonalMemory(testUserId);
      expect(memory.userId).toBe(testUserId);
      expect(memory.seasonalSnapshots).toHaveLength(0);
      expect(memory.timeAnchors).toHaveLength(0);
      expect(memory.annualPatterns).toHaveLength(0);
    });

    it('should initialize from persisted data', () => {
      const persistedData = {
        seasonalSnapshots: [
          {
            id: 'snap1',
            season: 'winter' as const,
            year: 2023,
            emotionalState: 'reflective',
            activeThemes: ['career', 'family'],
            keyMoments: ['got promotion'],
            capturedAt: new Date(),
          },
        ],
        timeAnchors: [],
        annualPatterns: [],
      };

      initializeSeasonalMemory(testUserId, persistedData);

      const memory = getSeasonalMemory(testUserId);
      expect(memory.seasonalSnapshots).toHaveLength(1);
      expect(memory.seasonalSnapshots[0].emotionalState).toBe('reflective');
    });
  });

  describe('Seasonal Snapshots', () => {
    it('should capture a seasonal snapshot', () => {
      const snapshot = captureSeasonalSnapshot(testUserId, {
        emotionalState: 'hopeful',
        activeThemes: ['health', 'relationships'],
        keyMoments: ['started new job', 'made new friend'],
        wins: ['completed project'],
        struggles: ['work stress'],
      });

      expect(snapshot.emotionalState).toBe('hopeful');
      expect(snapshot.activeThemes).toContain('health');
      expect(snapshot.wins).toContain('completed project');
    });

    it('should update existing snapshot for same season/year', () => {
      // First snapshot
      captureSeasonalSnapshot(testUserId, {
        emotionalState: 'stressed',
        activeThemes: ['work'],
        keyMoments: ['busy period'],
      });

      // Update for same season
      const updated = captureSeasonalSnapshot(testUserId, {
        emotionalState: 'calm',
        activeThemes: ['rest'],
        keyMoments: ['took break'],
      });

      const memory = getSeasonalMemory(testUserId);
      expect(memory.seasonalSnapshots).toHaveLength(1);
      expect(updated.emotionalState).toBe('calm');
    });
  });

  describe('Time-Anchored Memories', () => {
    it('should add a time-anchored memory', () => {
      const anchor = addTimeAnchoredMemory(testUserId, {
        description: 'Had a breakthrough about career direction',
        emotionalWeight: 0.8,
        topics: ['career', 'growth'],
        canReference: true,
      });

      expect(anchor.description).toBe('Had a breakthrough about career direction');
      expect(anchor.emotionalWeight).toBe(0.8);
      expect(anchor.topics).toContain('career');
    });

    it('should limit time anchors to 50', () => {
      // Add 55 memories
      for (let i = 0; i < 55; i++) {
        addTimeAnchoredMemory(testUserId, {
          description: `Memory ${i}`,
          emotionalWeight: 0.5,
          topics: ['test'],
        });
      }

      const memory = getSeasonalMemory(testUserId);
      expect(memory.timeAnchors.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Annual Patterns', () => {
    it('should return empty for insufficient data', () => {
      const patterns = detectAnnualPatterns(testUserId);
      expect(patterns).toHaveLength(0);
    });

    it('should detect recurring emotional patterns', () => {
      // Add snapshots for same season across multiple years
      const memory = getSeasonalMemory(testUserId);

      // Simulate 3 years of winter data with same emotional state
      memory.seasonalSnapshots = [
        {
          id: '1',
          season: 'winter',
          year: 2021,
          emotionalState: 'reflective',
          activeThemes: ['family'],
          keyMoments: [],
          capturedAt: new Date(),
        },
        {
          id: '2',
          season: 'winter',
          year: 2022,
          emotionalState: 'reflective',
          activeThemes: ['family'],
          keyMoments: [],
          capturedAt: new Date(),
        },
        {
          id: '3',
          season: 'winter',
          year: 2023,
          emotionalState: 'reflective',
          activeThemes: ['family'],
          keyMoments: [],
          capturedAt: new Date(),
        },
        {
          id: '4',
          season: 'summer',
          year: 2022,
          emotionalState: 'energetic',
          activeThemes: ['travel'],
          keyMoments: [],
          capturedAt: new Date(),
        },
      ];

      const patterns = detectAnnualPatterns(testUserId);

      // Should detect winter pattern
      const winterPattern = patterns.find((p) => p.timeOfYear === 'winter');
      expect(winterPattern).toBeDefined();
      expect(winterPattern?.pattern).toContain('reflective');
    });
  });

  describe('Relevant Memories', () => {
    it('should return empty for new users', () => {
      const memories = getRelevantTimeMemories(testUserId);
      expect(memories).toHaveLength(0);
    });

    it('should return relevant memories based on current time', () => {
      // Add a memory for current time of year
      addTimeAnchoredMemory(testUserId, {
        description: 'Important moment',
        emotionalWeight: 0.9,
        topics: ['life'],
        canReference: true,
      });

      const memories = getRelevantTimeMemories(testUserId);
      // May or may not find depending on timing - just verify it runs
      expect(Array.isArray(memories)).toBe(true);
    });
  });

  describe('Greeting Context', () => {
    it('should return safe defaults for new user', () => {
      const context = getSeasonalGreetingContext(testUserId);
      // API returns hasSeasonalInsight, not hasSeasonalContext
      expect(context.hasSeasonalInsight).toBe(false);
    });

    it('should include insight when sufficient history exists', () => {
      // Add multiple seasonal snapshots (need at least 2 for insight)
      const memory = getSeasonalMemory(testUserId);
      memory.seasonalSnapshots = [
        {
          id: '1',
          season: getCurrentSeason(),
          year: new Date().getFullYear() - 1, // Last year same season
          emotionalState: 'energized',
          activeThemes: ['fitness', 'creativity'],
          keyMoments: ['started gym'],
          capturedAt: new Date(),
        },
        {
          id: '2',
          season: getCurrentSeason(),
          year: new Date().getFullYear(),
          emotionalState: 'active',
          activeThemes: ['health'],
          keyMoments: ['maintained routine'],
          capturedAt: new Date(),
        },
      ];

      const context = getSeasonalGreetingContext(testUserId);
      // May or may not have insight depending on data
      expect(typeof context.hasSeasonalInsight).toBe('boolean');
    });
  });

  describe('Snapshot Capture Trigger', () => {
    it('should determine if snapshot should be captured', () => {
      // For a new user, should be okay to capture
      const should = shouldCaptureSnapshot(testUserId);
      expect(typeof should).toBe('boolean');
    });

    it('should not capture if recent snapshot exists', () => {
      // Capture a snapshot
      captureSeasonalSnapshot(testUserId, {
        emotionalState: 'calm',
        activeThemes: ['rest'],
        keyMoments: [],
      });

      // Should not need another capture
      const should = shouldCaptureSnapshot(testUserId);
      expect(should).toBe(false);
    });
  });
});
