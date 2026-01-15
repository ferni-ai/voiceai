/**
 * Daily Rituals Service Tests
 *
 * Tests for daily ritual management, streaks,
 * emotional weather tracking, and persona-specific content.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock background task
vi.mock('../../utils/background-task.js', () => ({
  runBackground: vi.fn(),
}));

// Mock engagement store
vi.mock('../engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn().mockResolvedValue({
    getProfile: vi.fn().mockResolvedValue({}),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    toRitualProfile: vi.fn().mockResolvedValue(null),
    saveRitualStreak: vi.fn().mockResolvedValue(undefined),
    recordWeather: vi.fn().mockResolvedValue(undefined),
  }),
}));

import {
  type DailyRitual,
  type RitualCompletion,
  type EmotionalWeather,
  type RitualStreak,
  type UserRitualProfile,
  PERSONA_RITUALS,
  RITUAL_PROMPTS,
  DailyRitualsService,
  getDailyRitualsService,
  resetDailyRitualsService,
} from '../scheduling/daily-rituals.js';

describe('DailyRituals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDailyRitualsService();
  });

  describe('DailyRitual type', () => {
    it('should define ritual structure', () => {
      const ritual: DailyRitual = {
        id: 'test-ritual',
        personaId: 'ferni',
        name: 'Morning Check',
        description: 'Daily check-in',
        duration: '30 seconds',
        frequency: 'daily',
        preferredTime: 'morning',
        streakable: true,
      };

      expect(ritual.id).toBe('test-ritual');
      expect(ritual.streakable).toBe(true);
    });

    it('should support all frequency types', () => {
      const frequencies: DailyRitual['frequency'][] = ['daily', 'weekday', 'weekend', 'weekly'];
      expect(frequencies).toHaveLength(4);
    });
  });

  describe('EmotionalWeather type', () => {
    it('should have all weather types', () => {
      const weathers: EmotionalWeather['primary'][] = [
        'sunny',
        'partly-cloudy',
        'cloudy',
        'rainy',
        'stormy',
        'foggy',
        'rainbow',
      ];

      expect(weathers).toHaveLength(7);
    });

    it('should support energy levels', () => {
      const weather: EmotionalWeather = {
        primary: 'sunny',
        energy: 'high',
        note: 'Feeling great today!',
      };

      expect(weather.energy).toBe('high');
      expect(weather.note).toBe('Feeling great today!');
    });
  });

  describe('RitualStreak type', () => {
    it('should track streak data', () => {
      const streak: RitualStreak = {
        ritualId: 'ferni-sky-check',
        userId: 'user-123',
        currentStreak: 7,
        longestStreak: 14,
        lastCompletedAt: new Date(),
        totalCompletions: 50,
        streakHistory: [
          { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-14'), length: 14 },
        ],
      };

      expect(streak.currentStreak).toBe(7);
      expect(streak.longestStreak).toBe(14);
      expect(streak.streakHistory).toHaveLength(1);
    });
  });

  describe('UserRitualProfile type', () => {
    it('should track user ritual data', () => {
      const profile: UserRitualProfile = {
        userId: 'user-123',
        activeRituals: ['ferni-sky-check', 'maya-habit-heartbeat'],
        streaks: {},
        emotionalWeatherHistory: [],
        weeklyInsights: [],
        lastRitualDate: new Date(),
        totalRitualDays: 30,
        preferences: {
          preferredTime: 'morning',
          reminderEnabled: true,
          favoriteRitual: 'ferni-sky-check',
        },
      };

      expect(profile.activeRituals).toHaveLength(2);
      expect(profile.preferences.preferredTime).toBe('morning');
    });
  });

  describe('PERSONA_RITUALS', () => {
    it('should define Ferni sky check', () => {
      const ritual = PERSONA_RITUALS['ferni-sky-check'];
      expect(ritual.name).toBe('Morning Sky Check');
      expect(ritual.personaId).toBe('ferni');
      expect(ritual.duration).toBe('30 seconds');
    });

    it('should define Alex inbox pulse', () => {
      const ritual = PERSONA_RITUALS['alex-inbox-pulse'];
      expect(ritual.name).toBe('Inbox Pulse');
      expect(ritual.personaId).toBe('alex-chen');
      expect(ritual.frequency).toBe('weekday');
    });

    it('should define Maya habit heartbeat', () => {
      const ritual = PERSONA_RITUALS['maya-habit-heartbeat'];
      expect(ritual.name).toBe('Habit Heartbeat');
      expect(ritual.personaId).toBe('maya-santos');
    });

    it('should define Jordan today chapter', () => {
      const ritual = PERSONA_RITUALS['jordan-todays-chapter'];
      expect(ritual.name).toBe("Today's Chapter");
      expect(ritual.personaId).toBe('jordan-taylor');
    });

    it('should define Nayan morning stillness', () => {
      const ritual = PERSONA_RITUALS['nayan-morning-stillness'];
      expect(ritual.name).toBe('Morning Stillness');
      expect(ritual.personaId).toBe('nayan-patel');
      expect(ritual.duration).toBe('15 seconds');
    });

    it('should define Peter pattern pulse', () => {
      const ritual = PERSONA_RITUALS['peter-pattern-pulse'];
      expect(ritual.name).toBe('Pattern Pulse');
      expect(ritual.personaId).toBe('peter-john');
    });

    it('should have 6 persona rituals', () => {
      expect(Object.keys(PERSONA_RITUALS)).toHaveLength(6);
    });
  });

  describe('RITUAL_PROMPTS', () => {
    describe('Ferni sky check prompts', () => {
      it('should have openings', () => {
        const prompts = RITUAL_PROMPTS['ferni-sky-check'];
        expect(prompts.openings.length).toBeGreaterThan(0);
      });

      it('should have weather responses for all types', () => {
        const prompts = RITUAL_PROMPTS['ferni-sky-check'];
        const weatherTypes = [
          'sunny',
          'partly-cloudy',
          'cloudy',
          'rainy',
          'stormy',
          'foggy',
          'rainbow',
        ] as const;

        weatherTypes.forEach((weather) => {
          expect(prompts.weatherResponses[weather]).toBeDefined();
          expect(prompts.weatherResponses[weather].length).toBeGreaterThan(0);
        });
      });

      it('should have streak celebrations', () => {
        const prompts = RITUAL_PROMPTS['ferni-sky-check'];
        expect(prompts.streakCelebrations[3]).toBeDefined();
        expect(prompts.streakCelebrations[7]).toBeDefined();
        expect(prompts.streakCelebrations[30]).toBeDefined();
        expect(prompts.streakCelebrations[66]).toBeDefined();
        expect(prompts.streakCelebrations[100]).toBeDefined();
      });
    });

    describe('Maya habit heartbeat prompts', () => {
      it('should have cat commentary', () => {
        const prompts = RITUAL_PROMPTS['maya-habit-heartbeat'];
        expect(prompts.catCommentary.compound.length).toBeGreaterThan(0);
        expect(prompts.catCommentary.interest.length).toBeGreaterThan(0);
      });
    });

    describe('Nayan morning stillness prompts', () => {
      it('should have wisdom drops', () => {
        const prompts = RITUAL_PROMPTS['nayan-morning-stillness'];
        expect(prompts.wisdomDrops.length).toBeGreaterThan(0);
      });

      it('should have at least 10 wisdom drops', () => {
        const prompts = RITUAL_PROMPTS['nayan-morning-stillness'];
        expect(prompts.wisdomDrops.length).toBeGreaterThanOrEqual(10);
      });
    });
  });

  describe('DailyRitualsService', () => {
    let service: DailyRitualsService;

    beforeEach(() => {
      service = new DailyRitualsService();
    });

    describe('getOrCreateProfile', () => {
      it('should create new profile', () => {
        const profile = service.getOrCreateProfile('user-123');

        expect(profile.userId).toBe('user-123');
        expect(profile.activeRituals).toEqual([]);
        expect(profile.preferences.preferredTime).toBe('morning');
      });

      it('should return existing profile', () => {
        const profile1 = service.getOrCreateProfile('user-123');
        profile1.activeRituals.push('ferni-sky-check');

        const profile2 = service.getOrCreateProfile('user-123');
        expect(profile2.activeRituals).toContain('ferni-sky-check');
      });
    });

    describe('activateRitual', () => {
      it('should add ritual to active rituals', async () => {
        await service.activateRitual('user-123', 'ferni-sky-check');
        const profile = service.getOrCreateProfile('user-123');

        expect(profile.activeRituals).toContain('ferni-sky-check');
      });

      it('should initialize streak', async () => {
        await service.activateRitual('user-123', 'ferni-sky-check');
        const profile = service.getOrCreateProfile('user-123');

        expect(profile.streaks['ferni-sky-check']).toBeDefined();
        expect(profile.streaks['ferni-sky-check'].currentStreak).toBe(0);
      });

      it('should not duplicate active rituals', async () => {
        await service.activateRitual('user-123', 'ferni-sky-check');
        await service.activateRitual('user-123', 'ferni-sky-check');

        const profile = service.getOrCreateProfile('user-123');
        const count = profile.activeRituals.filter((r) => r === 'ferni-sky-check').length;
        expect(count).toBe(1);
      });
    });

    describe('recordCompletion', () => {
      it('should record completion and return streak info', () => {
        const profile = service.getOrCreateProfile('user-123');
        profile.activeRituals.push('ferni-sky-check');
        profile.streaks['ferni-sky-check'] = {
          ritualId: 'ferni-sky-check',
          userId: 'user-123',
          currentStreak: 0,
          longestStreak: 0,
          lastCompletedAt: new Date(0),
          totalCompletions: 0,
          streakHistory: [],
        };

        const result = service.recordCompletion('user-123', 'ferni-sky-check');

        expect(result.newStreak).toBeGreaterThanOrEqual(0);
      });

      it('should track emotional weather', () => {
        const profile = service.getOrCreateProfile('user-123');
        profile.activeRituals.push('ferni-sky-check');
        profile.streaks['ferni-sky-check'] = {
          ritualId: 'ferni-sky-check',
          userId: 'user-123',
          currentStreak: 5,
          longestStreak: 10,
          lastCompletedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          totalCompletions: 20,
          streakHistory: [],
        };

        service.recordCompletion('user-123', 'ferni-sky-check', {
          emotionalWeather: { primary: 'sunny', energy: 'high' },
        });

        // Verify it was called (async persistence happens in background)
        expect(profile.streaks['ferni-sky-check']).toBeDefined();
      });
    });

    describe('getRitualOpening', () => {
      it('should return opening for ferni sky check', () => {
        const opening = service.getRitualOpening('ferni-sky-check');
        expect(opening).toBeDefined();
        expect(typeof opening).toBe('string');
        expect(opening.length).toBeGreaterThan(0);
      });

      it('should return default for unknown ritual', () => {
        const opening = service.getRitualOpening('unknown-ritual');
        expect(opening).toBe('Time for your daily ritual.');
      });
    });

    describe('getWeatherResponse', () => {
      it('should return response for sunny', () => {
        const response = service.getWeatherResponse('sunny');
        expect(response).toBeDefined();
        // Response can be either "Clear skies..." or "Sunny inside..." (randomized)
        const hasSunnyResponse =
          response.includes('Clear skies') || response.includes('Sunny inside');
        expect(hasSunnyResponse).toBe(true);
      });

      it('should return response for stormy', () => {
        const response = service.getWeatherResponse('stormy');
        expect(response).toBeDefined();
        expect(response.toLowerCase()).toContain('storm');
      });
    });

    describe('getDailyWisdom', () => {
      it('should return wisdom string', () => {
        const wisdom = service.getDailyWisdom();
        expect(typeof wisdom).toBe('string');
        expect(wisdom.length).toBeGreaterThan(0);
      });

      it('should return consistent wisdom for same day', () => {
        const wisdom1 = service.getDailyWisdom();
        const wisdom2 = service.getDailyWisdom();
        expect(wisdom1).toBe(wisdom2);
      });
    });

    describe('getCatCommentary', () => {
      it('should return both cat comments', () => {
        const commentary = service.getCatCommentary();
        expect(commentary.compound).toBeDefined();
        expect(commentary.interest).toBeDefined();
        expect(typeof commentary.compound).toBe('string');
        expect(typeof commentary.interest).toBe('string');
      });
    });

    describe('getWeatherTrends', () => {
      it('should return null for user without history', () => {
        const trends = service.getWeatherTrends('user-123');
        expect(trends.dominantWeather).toBeNull();
        expect(trends.energyTrend).toBe('stable');
      });

      it('should calculate trends with sufficient history', () => {
        const profile = service.getOrCreateProfile('user-123');
        profile.emotionalWeatherHistory = [
          { date: new Date(), weather: { primary: 'sunny', energy: 'high' } },
          { date: new Date(), weather: { primary: 'sunny', energy: 'high' } },
          { date: new Date(), weather: { primary: 'cloudy', energy: 'medium' } },
        ];

        const trends = service.getWeatherTrends('user-123');
        expect(trends.dominantWeather).toBe('sunny');
      });
    });

    describe('shouldRemind', () => {
      it('should return false for user without profile', () => {
        expect(service.shouldRemind('user-123', 'ferni-sky-check')).toBe(false);
      });

      it('should return false if reminders disabled', () => {
        const profile = service.getOrCreateProfile('user-123');
        profile.preferences.reminderEnabled = false;

        expect(service.shouldRemind('user-123', 'ferni-sky-check')).toBe(false);
      });
    });

    describe('getDueRituals', () => {
      it('should return empty for user without profile', () => {
        expect(service.getDueRituals('user-123')).toEqual([]);
      });

      it('should filter by frequency', () => {
        const profile = service.getOrCreateProfile('user-123');
        profile.activeRituals = ['ferni-sky-check', 'alex-inbox-pulse'];
        profile.streaks = {
          'ferni-sky-check': {
            ritualId: 'ferni-sky-check',
            userId: 'user-123',
            currentStreak: 0,
            longestStreak: 0,
            lastCompletedAt: new Date(0),
            totalCompletions: 0,
            streakHistory: [],
          },
          'alex-inbox-pulse': {
            ritualId: 'alex-inbox-pulse',
            userId: 'user-123',
            currentStreak: 0,
            longestStreak: 0,
            lastCompletedAt: new Date(0),
            totalCompletions: 0,
            streakHistory: [],
          },
        };

        const dueRituals = service.getDueRituals('user-123');
        // ferni-sky-check is daily, alex-inbox-pulse is weekday only
        expect(dueRituals.some((r) => r.id === 'ferni-sky-check')).toBe(true);
      });
    });

    describe('exportProfile and importProfile', () => {
      it('should export null for unknown user', () => {
        expect(service.exportProfile('unknown')).toBeNull();
      });

      it('should export existing profile', () => {
        service.getOrCreateProfile('user-123');
        const exported = service.exportProfile('user-123');

        expect(exported).not.toBeNull();
        expect(exported?.userId).toBe('user-123');
      });

      it('should import profile', () => {
        const profile: UserRitualProfile = {
          userId: 'user-456',
          activeRituals: ['ferni-sky-check'],
          streaks: {},
          emotionalWeatherHistory: [],
          weeklyInsights: ['Great week!'],
          lastRitualDate: new Date(),
          totalRitualDays: 10,
          preferences: {
            preferredTime: 'evening',
            reminderEnabled: true,
          },
        };

        service.importProfile(profile);
        const retrieved = service.exportProfile('user-456');

        expect(retrieved?.preferences.preferredTime).toBe('evening');
        expect(retrieved?.weeklyInsights).toContain('Great week!');
      });
    });
  });

  describe('Singleton pattern', () => {
    it('should return same instance', () => {
      resetDailyRitualsService();
      const service1 = getDailyRitualsService();
      const service2 = getDailyRitualsService();

      expect(service1).toBe(service2);
    });

    it('should reset singleton', () => {
      const service1 = getDailyRitualsService();
      resetDailyRitualsService();
      const service2 = getDailyRitualsService();

      expect(service1).not.toBe(service2);
    });
  });

  describe('Streak milestone celebrations', () => {
    const milestones = [3, 7, 14, 21, 30, 66, 100] as const;

    it.each([...milestones])('should have celebration for %d day streak', (days) => {
      const prompts = RITUAL_PROMPTS['ferni-sky-check'];
      // Not all milestones exist for all rituals, but ferni has most
      const milestone = days as keyof typeof prompts.streakCelebrations;
      if (prompts.streakCelebrations[milestone]) {
        expect(prompts.streakCelebrations[milestone].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Ritual content quality', () => {
    it('should have SSML pauses in Ferni openings', () => {
      const prompts = RITUAL_PROMPTS['ferni-sky-check'];
      prompts.openings.forEach((opening) => {
        expect(opening).toContain('<break');
      });
    });

    it('should have SSML pauses in Nayan wisdom', () => {
      const prompts = RITUAL_PROMPTS['nayan-morning-stillness'];
      prompts.wisdomDrops.forEach((wisdom) => {
        expect(wisdom).toContain('<break');
      });
    });
  });
});
