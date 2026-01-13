/**
 * Health Service Tests
 *
 * "Better than Human" - We KNOW when you're sleep-deprived.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger - must include both createLogger and getLogger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// Mock Firestore
vi.mock('../../../memory/firestore/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Import after mocks
import { healthService, buildHealthAwarenessInjection } from '../index.js';
import type { HealthSummary, HealthPreferences } from '../types.js';

describe('Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('healthService.isEnabled', () => {
    it('should return false when not enabled', async () => {
      const isEnabled = await healthService.isEnabled('test-user');
      expect(isEnabled).toBe(false);
    });
  });

  describe('healthService.enable', () => {
    it('should enable health integration', async () => {
      await expect(healthService.enable('test-user')).resolves.not.toThrow();
    });
  });

  describe('healthService.disable', () => {
    it('should disable health integration', async () => {
      await expect(healthService.disable('test-user')).resolves.not.toThrow();
    });
  });

  describe('healthService.shouldMentionHealth', () => {
    it('should return false when no health data', async () => {
      const shouldMention = await healthService.shouldMentionHealth('test-user', {
        hasHealthData: false,
        confidence: 'low',
        dataAvailableDays: 0,
      });
      expect(shouldMention).toBe(false);
    });

    it('should return false when no insights', async () => {
      const shouldMention = await healthService.shouldMentionHealth('test-user', {
        hasHealthData: true,
        confidence: 'high',
        dataAvailableDays: 7,
        // No sleepInsight or stressInsight means shouldMention returns false
      });
      expect(shouldMention).toBe(false);
    });
  });

  describe('buildHealthAwarenessInjection', () => {
    it('should return null when no health data', async () => {
      const injection = await buildHealthAwarenessInjection('test-user');
      // Without real data, should return null
      expect(injection).toBeNull();
    });
  });

  describe('Health Summary Types', () => {
    it('should have correct structure', () => {
      const summary: HealthSummary = {
        userId: 'test-user',
        date: new Date().toISOString().split('T')[0],
        syncedAt: new Date().toISOString(),
        source: 'apple_health',
        sleepHours: 7.5,
        sleepQuality: 'good',
        exerciseMinutes: 45,
        stepsToday: 8000,
        mindfulMinutes: 10,
      };

      expect(summary.sleepHours).toBe(7.5);
      expect(summary.sleepQuality).toBe('good');
    });
  });

  describe('Health Preferences Types', () => {
    it('should have correct structure', () => {
      const prefs: HealthPreferences = {
        enabled: true,
        shareSleep: true,
        shareStress: true,
        shareActivity: true,
        shareWellness: true,
        shareCycle: false,
        proactiveHealthMentions: true,
        updatedAt: new Date().toISOString(),
      };

      expect(prefs.enabled).toBe(true);
      expect(prefs.shareCycle).toBe(false);
    });
  });
});
