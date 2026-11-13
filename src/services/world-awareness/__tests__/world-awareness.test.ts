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
  clearUserCache,
  type UserInterests,
  type WorldSnapshot,
  type WeatherContext,
  type NewsContext,
  type CulturalContext,
} from '../index.js';
import { perfBudget } from '../../../tests/perf-budget.js';

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
      expect(duration).toBeLessThan(perfBudget(1000));
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
});
