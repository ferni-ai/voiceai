/**
 * Engagement Features Integration Tests
 *
 * Tests the complete engagement system including:
 * - Daily rituals and streak tracking
 * - Memory-based engagement
 * - Team dynamics
 * - Seasonal events
 * - Engagement tools
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDailyRitualsService,
  resetDailyRitualsService,
  PERSONA_RITUALS,
  RITUAL_PROMPTS,
  type EmotionalWeather,
  type DailyRitualsService,
} from '../services/daily-rituals.js';
import {
  getMemoryEngagementEngine,
  resetMemoryEngagementEngine,
  buildMemoryEngagementContext,
  type MemoryEngagementEngine,
} from '../intelligence/memory-engagement.js';
import {
  getTeamEngagementService,
  resetTeamEngagementService,
  type TeamEngagementService,
} from '../services/engagement/team-engagement.js';

// ============================================================================
// DAILY RITUALS TESTS
// ============================================================================

describe('DailyRitualsService', () => {
  let service: DailyRitualsService;

  beforeEach(() => {
    resetDailyRitualsService();
    service = getDailyRitualsService();
  });

  afterEach(() => {
    resetDailyRitualsService();
  });

  describe('Ritual Definitions', () => {
    it('should have rituals for all personas', () => {
      const personaIds = [
        'ferni',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
        'peter-john',
      ];

      for (const personaId of personaIds) {
        const ritual = Object.values(PERSONA_RITUALS).find((r) => r.personaId === personaId);
        expect(ritual, `Missing ritual for ${personaId}`).toBeDefined();
      }
    });

    it('should have prompts for each ritual', () => {
      for (const ritualId of Object.keys(PERSONA_RITUALS)) {
        expect(
          RITUAL_PROMPTS[ritualId as keyof typeof RITUAL_PROMPTS],
          `Missing prompts for ${ritualId}`
        ).toBeDefined();
      }
    });
  });

  describe('Profile Management', () => {
    it('should create a new profile for unknown user', () => {
      const profile = service.getOrCreateProfile('test-user-1');
      expect(profile).toBeDefined();
      expect(profile.userId).toBe('test-user-1');
      expect(profile.activeRituals).toEqual([]);
      expect(profile.totalRitualDays).toBe(0);
    });

    it('should return existing profile for known user', () => {
      const profile1 = service.getOrCreateProfile('test-user-2');
      profile1.totalRitualDays = 5;

      const profile2 = service.getOrCreateProfile('test-user-2');
      expect(profile2.totalRitualDays).toBe(5);
    });
  });

  describe('Ritual Activation', () => {
    it('should activate a ritual', async () => {
      await service.activateRitual('test-user-3', 'ferni-sky-check');
      const profile = service.getOrCreateProfile('test-user-3');

      expect(profile.activeRituals).toContain('ferni-sky-check');
      expect(profile.streaks['ferni-sky-check']).toBeDefined();
    });

    it('should not duplicate activated rituals', async () => {
      await service.activateRitual('test-user-4', 'ferni-sky-check');
      await service.activateRitual('test-user-4', 'ferni-sky-check');
      const profile = service.getOrCreateProfile('test-user-4');

      expect(profile.activeRituals.filter((r) => r === 'ferni-sky-check')).toHaveLength(1);
    });
  });

  describe('Streak Tracking', () => {
    it('should start a new streak on first completion', async () => {
      await service.activateRitual('test-user-5', 'ferni-sky-check');
      const result = await service.recordCompletionAsync('test-user-5', 'ferni-sky-check');

      expect(result.newStreak).toBe(1);
      expect(result.isNewRecord).toBe(true);
    });

    it('should increment streak on consecutive days', async () => {
      await service.activateRitual('test-user-6', 'ferni-sky-check');

      // First completion
      await service.recordCompletionAsync('test-user-6', 'ferni-sky-check');

      // Simulate next day
      const profile = service.getOrCreateProfile('test-user-6');
      const streak = profile.streaks['ferni-sky-check'];
      streak.lastCompletedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Second completion
      const result = await service.recordCompletionAsync('test-user-6', 'ferni-sky-check');
      expect(result.newStreak).toBe(2);
    });

    it('should record emotional weather', async () => {
      await service.activateRitual('test-user-7', 'ferni-sky-check');
      const weather: EmotionalWeather = { primary: 'sunny', energy: 'high' };

      await service.recordCompletionAsync('test-user-7', 'ferni-sky-check', {
        emotionalWeather: weather,
      });

      const profile = service.getOrCreateProfile('test-user-7');
      expect(profile.emotionalWeatherHistory).toHaveLength(1);
      expect(profile.emotionalWeatherHistory[0].weather.primary).toBe('sunny');
    });
  });

  describe('Ritual Prompts', () => {
    it('should return valid openings', () => {
      const opening = service.getRitualOpening('ferni-sky-check');
      expect(opening).toBeDefined();
      expect(opening.length).toBeGreaterThan(10);
    });

    it('should return weather-specific responses', () => {
      const weathers: Array<EmotionalWeather['primary']> = [
        'sunny',
        'partly-cloudy',
        'cloudy',
        'rainy',
        'stormy',
        'foggy',
        'rainbow',
      ];

      for (const weather of weathers) {
        const response = service.getWeatherResponse(weather);
        expect(response, `Missing response for ${weather}`).toBeDefined();
        expect(response.length).toBeGreaterThan(10);
      }
    });

    it('should return daily wisdom', () => {
      const wisdom = service.getDailyWisdom();
      expect(wisdom).toBeDefined();
      expect(wisdom.length).toBeGreaterThan(10);
    });

    it('should return cat commentary', () => {
      const cats = service.getCatCommentary();
      expect(cats.compound).toBeDefined();
      expect(cats.interest).toBeDefined();
    });
  });

  describe('Weather Trends', () => {
    it('should calculate weather trends', async () => {
      await service.activateRitual('test-user-8', 'ferni-sky-check');

      // Add some weather history
      const profile = service.getOrCreateProfile('test-user-8');
      for (let i = 0; i < 7; i++) {
        profile.emotionalWeatherHistory.push({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          weather: { primary: 'sunny', energy: 'high' },
        });
      }

      const trends = service.getWeatherTrends('test-user-8');
      expect(trends.dominantWeather).toBe('sunny');
      expect(trends.energyTrend).toBe('stable');
    });
  });

  describe('Due Rituals', () => {
    it('should return due rituals', async () => {
      await service.activateRitual('test-user-9', 'ferni-sky-check');
      await service.activateRitual('test-user-9', 'maya-habit-heartbeat');

      const due = service.getDueRituals('test-user-9');
      expect(due.length).toBe(2);
    });

    it('should not return completed rituals', async () => {
      await service.activateRitual('test-user-10', 'ferni-sky-check');
      await service.recordCompletionAsync('test-user-10', 'ferni-sky-check');

      const due = service.getDueRituals('test-user-10');
      expect(due.find((r) => r.id === 'ferni-sky-check')).toBeUndefined();
    });
  });
});

// ============================================================================
// MEMORY ENGAGEMENT TESTS
// ============================================================================

describe('MemoryEngagementEngine', () => {
  let engine: MemoryEngagementEngine;

  beforeEach(() => {
    resetMemoryEngagementEngine();
    engine = getMemoryEngagementEngine();
  });

  afterEach(() => {
    resetMemoryEngagementEngine();
  });

  describe('Memory Callback Generation', () => {
    it('should have generateCallbacks method', () => {
      expect(engine).toBeDefined();
      expect(typeof engine.generateCallbacks).toBe('function');
    });

    it('should generate callbacks for a user', () => {
      const callbacks = engine.generateCallbacks('test-user-callback', null, 'ferni');

      // Empty array for null profile is expected
      expect(Array.isArray(callbacks)).toBe(true);
    });

    it('should build memory engagement context', async () => {
      const context = await buildMemoryEngagementContext('test-user-callback', [], 'ferni');

      // Context may be empty string if no callbacks, but should not error
      expect(context).toBeDefined();
    });
  });

  describe('Callback Prioritization', () => {
    it('should sort callbacks by priority', () => {
      // Create a mock profile with some data
      const mockProfile = {
        id: 'test-user-priority',
        name: 'Test User',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        relationshipStage: 'getting_to_know' as const,
        preferences: {},
        keyMoments: [],
        conversationSummaries: [],
      };

      const callbacks = engine.generateCallbacks('test-user-priority', mockProfile as any, 'ferni');

      // If callbacks exist, they should be sorted by priority (highest first)
      for (let i = 1; i < callbacks.length; i++) {
        expect(callbacks[i - 1].priority).toBeGreaterThanOrEqual(callbacks[i].priority);
      }
    });
  });
});

// ============================================================================
// TEAM ENGAGEMENT TESTS
// ============================================================================

describe('TeamEngagementService', () => {
  let service: TeamEngagementService;

  beforeEach(() => {
    resetTeamEngagementService();
    service = getTeamEngagementService();
  });

  afterEach(() => {
    resetTeamEngagementService();
  });

  describe('Team Huddles', () => {
    it('should generate team huddles', async () => {
      const huddle = await service.generateTeamHuddle('test-user-huddle', null, 'weekly');

      expect(huddle).toBeDefined();
      expect(huddle.intro).toBeDefined();
      expect(huddle.comments).toBeDefined();
      expect(huddle.outro).toBeDefined();
    });

    it('should include Ferni in all huddles', async () => {
      const huddle = await service.generateTeamHuddle('test-user-huddle-2', null, 'weekly');

      const ferniComment = huddle.comments.find((c) => c.personaId === 'ferni');
      expect(ferniComment).toBeDefined();
    });

    it('should include 3-4 personas total in huddles', async () => {
      const huddle = await service.generateTeamHuddle('test-user-huddle-3', null, 'weekly');

      expect(huddle.comments.length).toBeGreaterThanOrEqual(3);
      expect(huddle.comments.length).toBeLessThanOrEqual(4);
    });
  });

  describe('Cross-Persona References', () => {
    it('should generate cross-persona references', () => {
      const reference = service.getCrossPersonaReference('ferni');

      // May or may not return a reference
      if (reference) {
        expect(typeof reference).toBe('string');
        expect(reference.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Seasonal Events', () => {
    it('should return active seasonal event if applicable', () => {
      const event = service.getActiveSeasonalEvent();

      // Event may or may not be active depending on date
      if (event) {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('name');
        expect(event).toHaveProperty('personaResponses');
      }
    });
  });

  describe('Persona Evolution Stories', () => {
    it('should return unlocked evolution events', async () => {
      const events = await service.getUnlockedEvolutions('test-user-evolutions', null, 'ferni');

      expect(Array.isArray(events)).toBe(true);
    });

    it('should filter by persona when specified', async () => {
      const events = await service.getUnlockedEvolutions(
        'test-user-evolutions-2',
        null,
        'alex-chen'
      );

      for (const event of events) {
        expect(event.personaId).toBe('alex-chen');
      }
    });
  });
});

// ============================================================================
// ENGAGEMENT CONTEXT BUILDER TESTS
// ============================================================================

describe('Engagement Context Builder', () => {
  it('should build engagement context', async () => {
    // Import the builder
    const { buildEngagementContext } =
      await import('../intelligence/context-builders/engagement-context.js');

    const context = await buildEngagementContext({
      personaId: 'ferni',
      userId: 'test-user-context',
      turnCount: 1,
    });

    expect(context).toBeDefined();
    expect(typeof context).toBe('object');
    // Context structure varies based on user state
    expect(context).toHaveProperty('opportunities');
  });

  it('should handle missing user gracefully', async () => {
    const { buildEngagementContext } =
      await import('../intelligence/context-builders/engagement-context.js');

    // Should not throw
    const context = await buildEngagementContext({
      personaId: 'alex-chen',
      userId: 'nonexistent-user',
      turnCount: 1,
    });

    expect(context).toBeDefined();
  });
});

// ============================================================================
// STREAK CELEBRATION TESTS
// ============================================================================

describe('Streak Celebrations', () => {
  it('should have celebrations at key milestones', () => {
    const milestones = [3, 7, 14, 21, 30, 66, 100];

    for (const ritualId of Object.keys(RITUAL_PROMPTS)) {
      const prompts = RITUAL_PROMPTS[ritualId as keyof typeof RITUAL_PROMPTS];
      if ('streakCelebrations' in prompts) {
        const celebrations = prompts.streakCelebrations as Record<number, string>;

        // Check that some milestones have celebrations
        const hasCelebrations = milestones.some((m) => celebrations[m] !== undefined);
        expect(hasCelebrations, `No celebrations for ${ritualId}`).toBe(true);
      }
    }
  });
});
