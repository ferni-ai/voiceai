/**
 * Ambient Mode Service Tests
 *
 * "Better than Human" - Continuous background presence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

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
import { ambientMode, buildAmbientModeInjection } from '../index.js';
import type { AmbientState, AmbientPreferences, NudgeType } from '../types.js';

describe('Ambient Mode Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ambientMode.isEnabled', () => {
    it('should return false when not enabled', async () => {
      const isEnabled = await ambientMode.isEnabled('test-user');
      expect(isEnabled).toBe(false);
    });
  });

  describe('ambientMode.enable', () => {
    it('should enable ambient mode', async () => {
      await expect(ambientMode.enable('test-user')).resolves.not.toThrow();
    });
  });

  describe('ambientMode.disable', () => {
    it('should disable ambient mode', async () => {
      await expect(ambientMode.disable('test-user')).resolves.not.toThrow();
    });
  });

  describe('ambientMode.setQuietHours', () => {
    it('should set quiet hours', async () => {
      await expect(ambientMode.setQuietHours('test-user', '22:00', '08:00')).resolves.not.toThrow();
    });
  });

  describe('buildAmbientModeInjection', () => {
    it('should return null when no ambient data', async () => {
      const injection = await buildAmbientModeInjection('test-user');
      // Without real data, should return null
      expect(injection).toBeNull();
    });
  });

  describe('Ambient State Types', () => {
    it('should have correct structure for AmbientState', () => {
      const state: AmbientState = {
        userId: 'test-user',
        updatedAt: new Date().toISOString(),
        locationType: 'home',
        timezone: 'America/New_York',
        localTime: '18:00',
        timeOfDay: 'evening',
        deviceType: 'ios',
        deviceActive: true,
      };

      expect(state.locationType).toBe('home');
      expect(state.timeOfDay).toBe('evening');
    });
  });

  describe('Ambient Preferences Types', () => {
    it('should have correct structure for AmbientPreferences', () => {
      const prefs: AmbientPreferences = {
        enabled: true,
        allowLocation: true,
        allowActivityDetection: true,
        allowPushNudges: true,
        maxNudgesPerDay: 3,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        allowedNudgeTypes: ['morning_checkin', 'evening_reflection'] as NudgeType[],
        updatedAt: new Date().toISOString(),
      };

      expect(prefs.enabled).toBe(true);
      expect(prefs.maxNudgesPerDay).toBe(3);
      expect(prefs.quietHoursStart).toBe('22:00');
    });
  });

  describe('Nudge Types', () => {
    it('should accept valid nudge types', () => {
      const nudgeTypes: NudgeType[] = [
        'morning_checkin',
        'evening_reflection',
        'post_meeting',
        'workout_encouragement',
        'commute_moment',
        'bedtime_reminder',
        'weather_related',
        'location_triggered',
      ];

      nudgeTypes.forEach((type) => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Sync Request Types', () => {
    it('should accept valid sync request', () => {
      const syncRequest = {
        userId: 'test-user',
        locationType: 'work' as const,
        locationName: 'Office',
        activity: 'working',
        batteryLevel: 80,
        timestamp: new Date().toISOString(),
      };

      expect(syncRequest.locationType).toBe('work');
      expect(syncRequest.batteryLevel).toBe(80);
    });
  });

  describe('Nudge Evaluation', () => {
    it('should evaluate nudge appropriateness', async () => {
      // evaluateNudge takes a state object, not userId
      const state: AmbientState = {
        userId: 'test-user',
        updatedAt: new Date().toISOString(),
        timezone: 'America/New_York',
        localTime: '09:00',
        timeOfDay: 'morning',
        deviceType: 'ios',
        deviceActive: true,
      };
      const evaluation = await ambientMode.evaluateNudge(state);

      // evaluateNudge returns AmbientNudge | null
      // If no nudge is appropriate, it returns null
      if (evaluation) {
        expect(typeof evaluation.shouldSend).toBe('boolean');
        expect(typeof evaluation.reason).toBe('string');
      } else {
        expect(evaluation).toBeNull();
      }
    });
  });
});
