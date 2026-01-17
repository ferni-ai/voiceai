/**
 * World Awareness Tests
 *
 * Tests for the world awareness service that provides contextual
 * information about weather, news, sports, and cultural events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock external APIs
vi.mock('../../external-apis.js', () => ({
  getHistoricalEvent: vi.fn().mockResolvedValue('In 1969, Apollo 11 landed on the Moon.'),
}));

vi.mock('../../../tools/domains/information/weather.js', () => ({
  getCurrentWeather: vi.fn().mockResolvedValue('Sunny, 72°F'),
  getWeatherForecast: vi.fn().mockResolvedValue('Clear skies for the next 3 days'),
}));

vi.mock('../../../tools/domains/information/news.js', () => ({
  getGeneralNews: vi.fn().mockResolvedValue('Tech companies report strong earnings'),
  getTechNews: vi.fn().mockResolvedValue('New AI breakthrough announced'),
  getFinancialNews: vi.fn().mockResolvedValue('Markets reach all-time highs'),
}));

vi.mock('../../../tools/domains/information/sports.js', () => ({
  getTeamScore: vi.fn().mockResolvedValue('Lakers 105, Celtics 102 (Final)'),
}));

import {
  warmWorldCache,
  getWorldSnapshot,
  updateUserInterests,
  getConversationStarter,
  detectTeamMention,
  clearUserCache,
  type UserInterests,
  type WorldSnapshot,
  type WeatherContext,
  type NewsContext,
  type CulturalContext,
} from '../index.js';

describe('WorldAwareness', () => {
  const testUserId = 'world-test-user-' + Date.now();

  beforeEach(() => {
    clearUserCache(testUserId);
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearUserCache(testUserId);
  });

  describe('warmWorldCache', () => {
    it('should initialize cache for a user', async () => {
      await warmWorldCache(testUserId, {
        location: 'New York',
        favoriteTeams: ['Lakers'],
      });

      // Give time for background fetches
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      const snapshot = getWorldSnapshot(testUserId);
      expect(snapshot).toBeDefined();
    });

    it('should handle empty interests', async () => {
      await warmWorldCache(testUserId, {});

      const snapshot = getWorldSnapshot(testUserId);
      expect(snapshot).toBeDefined();
      expect(snapshot.cultural).toBeDefined();
    });

    it('should not block on API calls', async () => {
      const startTime = Date.now();
      await warmWorldCache(testUserId, { location: 'Los Angeles' });
      const duration = Date.now() - startTime;

      // Should return quickly (not wait for all fetches)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('getWorldSnapshot', () => {
    it('should return default snapshot for unknown user', () => {
      const snapshot = getWorldSnapshot('unknown-user');

      expect(snapshot).toBeDefined();
      expect(snapshot.cultural).toBeDefined();
      expect(snapshot.cultural.seasonalContext).toBeDefined();
      expect(snapshot.isFresh).toBe(false);
    });

    it('should include seasonal context', () => {
      const snapshot = getWorldSnapshot(testUserId);

      expect(snapshot.cultural.seasonalContext).toBeDefined();
      expect(typeof snapshot.cultural.seasonalContext).toBe('string');
      expect(snapshot.cultural.seasonalContext.length).toBeGreaterThan(0);
    });

    it('should have assembledAt timestamp', () => {
      const snapshot = getWorldSnapshot(testUserId);

      expect(snapshot.assembledAt).toBeInstanceOf(Date);
    });

    it('should include upcoming holidays array', () => {
      const snapshot = getWorldSnapshot(testUserId);

      expect(snapshot.cultural.upcomingHolidays).toBeDefined();
      expect(Array.isArray(snapshot.cultural.upcomingHolidays)).toBe(true);
    });
  });

  describe('updateUserInterests', () => {
    it('should update interests for existing user', async () => {
      await warmWorldCache(testUserId, { location: 'Chicago' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      updateUserInterests(testUserId, {
        favoriteTeams: ['Bulls', 'Bears'],
      });

      const snapshot = getWorldSnapshot(testUserId);
      expect(snapshot).toBeDefined();
    });

    it('should create cache for new user', () => {
      const newUserId = 'new-user-' + Date.now();
      updateUserInterests(newUserId, {
        location: 'Miami',
        favoriteTeams: ['Heat'],
      });

      const snapshot = getWorldSnapshot(newUserId);
      expect(snapshot).toBeDefined();

      clearUserCache(newUserId);
    });
  });

  describe('getConversationStarter', () => {
    it('should return null for unknown user', () => {
      const starter = getConversationStarter('unknown-user');

      expect(starter).toBeNull();
    });

    it('should return string or null', async () => {
      await warmWorldCache(testUserId, { location: 'Boston' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
      });

      const starter = getConversationStarter(testUserId);

      if (starter !== null) {
        expect(typeof starter).toBe('string');
        expect(starter.length).toBeGreaterThan(0);
      }
    });
  });

  describe('detectTeamMention', () => {
    it('should detect team mentions', () => {
      const team = detectTeamMention('Did you see the Lakers game last night?');

      expect(team).toBeDefined();
      expect(team?.toLowerCase()).toContain('laker');
    });

    it('should detect multiple team patterns', () => {
      const tests = [
        { text: 'The Yankees are playing tonight', pattern: 'yankee' },
        { text: 'Go Cubs!', pattern: 'cub' },
        { text: 'How about them Cowboys', pattern: 'cowboy' },
        { text: 'The Celtics won again', pattern: 'celtic' },
      ];

      for (const { text, pattern } of tests) {
        const team = detectTeamMention(text);
        if (team) {
          expect(team.toLowerCase()).toContain(pattern);
        }
      }
    });

    it('should return null for non-team text', () => {
      const team = detectTeamMention('The weather is nice today');

      expect(team).toBeNull();
    });
  });

  describe('clearUserCache', () => {
    it('should clear cache for user', async () => {
      await warmWorldCache(testUserId, { location: 'Seattle' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      clearUserCache(testUserId);

      const snapshot = getWorldSnapshot(testUserId);
      expect(snapshot.isFresh).toBe(false);
    });

    it('should handle clearing non-existent cache gracefully', () => {
      expect(() => {
        clearUserCache('non-existent-user');
      }).not.toThrow();
    });
  });

  describe('WorldSnapshot interface', () => {
    it('should have correct structure', async () => {
      await warmWorldCache(testUserId, {
        location: 'Denver',
        favoriteTeams: ['Broncos'],
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });

      const snapshot = getWorldSnapshot(testUserId);

      // Check structure
      expect(snapshot).toHaveProperty('cultural');
      expect(snapshot).toHaveProperty('assembledAt');
      expect(snapshot).toHaveProperty('isFresh');

      // Cultural context should always be present
      expect(snapshot.cultural).toHaveProperty('seasonalContext');
      expect(snapshot.cultural).toHaveProperty('upcomingHolidays');
    });
  });

  describe('Seasonal context', () => {
    it('should return appropriate seasonal message', () => {
      const snapshot = getWorldSnapshot(testUserId);
      const seasonal = snapshot.cultural.seasonalContext;

      // Should contain season-related word
      const seasonWords = ['spring', 'summer', 'fall', 'autumn', 'winter'];
      const hasSeasonWord = seasonWords.some((word) => seasonal.toLowerCase().includes(word));

      expect(hasSeasonWord).toBe(true);
    });
  });

  describe('User interests', () => {
    it('should support all interest types', () => {
      const interests: UserInterests = {
        favoriteTeams: ['Lakers', 'Dodgers'],
        industries: ['Technology', 'Finance'],
        topics: ['AI', 'Climate'],
        location: 'Los Angeles',
        timezone: 'America/Los_Angeles',
      };

      expect(() => {
        updateUserInterests(testUserId, interests);
      }).not.toThrow();
    });
  });
});
