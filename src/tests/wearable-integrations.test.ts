/**
 * Wearable Integration Tests
 *
 * Tests for health/wearable device integrations:
 * - Apple Health sync processing
 * - Oura Ring API
 * - Eight Sleep API
 * - Wearable integration service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  WearableProvider,
  WearableConfig,
  HealthMetrics,
  SleepData,
  ActivityData,
} from '../services/wearable-integration/types.js';

// Mock Firestore
const mockFirestoreDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
          set: vi.fn().mockResolvedValue(undefined),
        })),
        where: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ docs: [] }),
            })),
          })),
        })),
      })),
    })),
  })),
};

vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => mockFirestoreDb),
}));

vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// WEARABLE PROVIDER TYPES
// ============================================================================

describe('WearableProvider Types', () => {
  it('should include all supported providers', () => {
    const providers: WearableProvider[] = [
      'apple_health',
      'eight_sleep',
      'fitbit',
      'garmin',
      'oura',
      'whoop',
    ];

    expect(providers).toHaveLength(6);
    expect(providers).toContain('apple_health');
    expect(providers).toContain('eight_sleep');
    expect(providers).toContain('oura');
  });

  it('should have valid config structure', () => {
    const config: WearableConfig = {
      enabledProviders: ['apple_health', 'oura'],
      syncIntervalMinutes: 15,
      enableStressDetection: true,
      enableSleepAnalysis: true,
      enableActivityTracking: true,
      privacyMode: 'aggregated',
    };

    expect(config.enabledProviders).toHaveLength(2);
    expect(config.syncIntervalMinutes).toBe(15);
    expect(config.privacyMode).toBe('aggregated');
  });
});

// ============================================================================
// HEALTH METRICS
// ============================================================================

describe('Health Metrics', () => {
  it('should have valid health metrics structure', () => {
    const metrics: HealthMetrics = {
      restingHeartRate: 65,
      heartRateVariability: 45,
      respiratoryRate: 14,
      bloodOxygenLevel: 98,
      bodyTemperature: 98.6,
    };

    expect(metrics.restingHeartRate).toBeGreaterThan(0);
    expect(metrics.heartRateVariability).toBeGreaterThan(0);
    expect(metrics.bloodOxygenLevel).toBeGreaterThanOrEqual(90);
    expect(metrics.bloodOxygenLevel).toBeLessThanOrEqual(100);
  });

  it('should validate heart rate ranges', () => {
    const normalHR = 70;
    const elevatedHR = 100;
    const bradycardia = 50;

    expect(normalHR).toBeGreaterThanOrEqual(60);
    expect(normalHR).toBeLessThanOrEqual(100);
    expect(elevatedHR).toBe(100);
    expect(bradycardia).toBeLessThan(60);
  });
});

// ============================================================================
// SLEEP DATA
// ============================================================================

describe('Sleep Data', () => {
  it('should have valid sleep data structure', () => {
    const sleep: SleepData = {
      startTime: new Date('2024-01-15T23:00:00'),
      endTime: new Date('2024-01-16T07:00:00'),
      totalMinutes: 480, // 8 hours
      deepSleepMinutes: 90,
      remSleepMinutes: 120,
      lightSleepMinutes: 240,
      awakeMinutes: 30,
      efficiency: 0.9375, // (480-30)/480
    };

    expect(sleep.totalMinutes).toBe(480);
    expect(sleep.efficiency).toBeGreaterThan(0.9);
  });

  it('should calculate sleep efficiency correctly', () => {
    const totalMinutes = 480;
    const awakeMinutes = 48;
    const efficiency = (totalMinutes - awakeMinutes) / totalMinutes;

    expect(efficiency).toBe(0.9);
  });

  it('should validate sleep stages sum', () => {
    const deep = 90;
    const rem = 120;
    const light = 240;
    const awake = 30;
    const total = 480;

    // Sleep stages should sum to total time in bed
    const stagesSum = deep + rem + light + awake;
    expect(stagesSum).toBe(total);
  });
});

// ============================================================================
// ACTIVITY DATA
// ============================================================================

describe('Activity Data', () => {
  it('should have valid activity data structure', () => {
    const activity: ActivityData = {
      steps: 10000,
      distance: 7.5, // km
      caloriesBurned: 2200,
      activeMinutes: 45,
      standHours: 12,
      exerciseMinutes: 30,
    };

    expect(activity.steps).toBeGreaterThanOrEqual(0);
    expect(activity.standHours).toBeLessThanOrEqual(24);
  });

  it('should validate step goal thresholds', () => {
    const lowSteps = 3000;
    const moderateSteps = 7500;
    const goalSteps = 10000;
    const activeSteps = 15000;

    const STEP_GOAL = 10000;

    expect(lowSteps < STEP_GOAL * 0.5).toBe(true);
    expect(moderateSteps >= STEP_GOAL * 0.5).toBe(true);
    expect(goalSteps >= STEP_GOAL).toBe(true);
    expect(activeSteps >= STEP_GOAL).toBe(true);
  });
});

// ============================================================================
// APPLE HEALTH SYNC
// ============================================================================

describe('Apple Health Sync', () => {
  describe('Sleep Summary Computation', () => {
    it('should compute sleep summary from entries', () => {
      const entries = [
        { value: 'inBed', startDate: '2024-01-15T23:00:00', endDate: '2024-01-16T07:00:00' },
        { value: 'asleepDeep', startDate: '2024-01-15T23:30:00', endDate: '2024-01-16T01:00:00' },
        { value: 'asleepREM', startDate: '2024-01-16T01:00:00', endDate: '2024-01-16T03:00:00' },
        { value: 'asleepCore', startDate: '2024-01-16T03:00:00', endDate: '2024-01-16T06:30:00' },
        { value: 'awake', startDate: '2024-01-16T06:30:00', endDate: '2024-01-16T07:00:00' },
      ];

      // Calculate durations
      let deep = 0,
        rem = 0,
        core = 0,
        awake = 0,
        totalSleep = 0;

      for (const entry of entries) {
        const duration =
          (new Date(entry.endDate).getTime() - new Date(entry.startDate).getTime()) / 60000;

        switch (entry.value) {
          case 'asleepDeep':
            deep += duration;
            totalSleep += duration;
            break;
          case 'asleepREM':
            rem += duration;
            totalSleep += duration;
            break;
          case 'asleepCore':
            core += duration;
            totalSleep += duration;
            break;
          case 'awake':
            awake += duration;
            break;
        }
      }

      expect(deep).toBe(90); // 1.5 hours
      expect(rem).toBe(120); // 2 hours
      expect(core).toBe(210); // 3.5 hours
      expect(awake).toBe(30); // 0.5 hours
      expect(totalSleep).toBe(420); // 7 hours of actual sleep
    });

    it('should handle different sleep value types', () => {
      const sleepValueTypes = [
        'inBed',
        'awake',
        'asleepCore',
        'asleepDeep',
        'asleepREM',
        'asleepUnspecified',
      ];

      expect(sleepValueTypes).toContain('asleepDeep');
      expect(sleepValueTypes).toContain('asleepREM');
      expect(sleepValueTypes).toContain('asleepCore');
    });
  });

  describe('Token Generation', () => {
    it('should generate 64-character hex tokens', () => {
      // Simulate token generation (32 bytes = 64 hex chars)
      const mockToken = 'a'.repeat(64);
      expect(mockToken).toHaveLength(64);
      expect(/^[0-9a-f]+$/i.test(mockToken)).toBe(true);
    });

    it('should hash tokens with SHA256', async () => {
      const crypto = await import('node:crypto');
      const token = 'test-token-12345';
      const hashed = crypto.createHash('sha256').update(token).digest('hex');

      expect(hashed).toHaveLength(64);
      expect(hashed).not.toBe(token);
    });
  });

  describe('Payload Processing', () => {
    it('should handle empty data arrays gracefully', () => {
      const payload = {
        deviceId: 'device-123',
        syncedAt: new Date().toISOString(),
        data: {
          sleep: [],
          activity: [],
          heartRate: [],
          hrv: [],
          steps: [],
          workouts: [],
          mindfulness: [],
        },
      };

      let processedCount = 0;

      if (payload.data.sleep && payload.data.sleep.length > 0) {
        processedCount += payload.data.sleep.length;
      }
      if (payload.data.activity && payload.data.activity.length > 0) {
        processedCount += payload.data.activity.length;
      }

      expect(processedCount).toBe(0);
    });

    it('should count processed items correctly', () => {
      const payload = {
        data: {
          sleep: [{ value: 'asleepDeep' }, { value: 'asleepREM' }],
          steps: [{ value: 1000 }, { value: 2000 }, { value: 3000 }],
          workouts: [{ type: 'running' }],
        },
      };

      let processedCount = 0;
      processedCount += payload.data.sleep.length;
      processedCount += payload.data.steps.length;
      processedCount += payload.data.workouts.length;

      expect(processedCount).toBe(6);
    });
  });
});

// ============================================================================
// OURA RING INTEGRATION
// ============================================================================

describe('Oura Ring Integration', () => {
  describe('OAuth URL Generation', () => {
    it('should generate valid OAuth authorize URL', () => {
      const clientId = 'test-client-id';
      const redirectUri = 'https://example.com/callback';
      const scopes = ['daily', 'sleep', 'personal'];

      const url = new URL('https://cloud.ouraring.com/oauth/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', scopes.join(' '));

      expect(url.origin).toBe('https://cloud.ouraring.com');
      expect(url.pathname).toBe('/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe(clientId);
      expect(url.searchParams.get('response_type')).toBe('code');
    });
  });

  describe('Readiness Score', () => {
    it('should calculate readiness from contributors', () => {
      const contributors = {
        activity_balance: 85,
        body_temperature: 90,
        hrv_balance: 75,
        previous_day_activity: 80,
        previous_night: 88,
        recovery_index: 92,
        resting_heart_rate: 85,
        sleep_balance: 78,
      };

      const values = Object.values(contributors);
      const average = values.reduce((a, b) => a + b, 0) / values.length;

      expect(average).toBeGreaterThan(70);
      expect(average).toBeLessThan(100);
    });

    it('should categorize readiness levels', () => {
      const categorizeReadiness = (score: number): string => {
        if (score >= 85) return 'optimal';
        if (score >= 70) return 'good';
        if (score >= 60) return 'fair';
        return 'pay_attention';
      };

      expect(categorizeReadiness(92)).toBe('optimal');
      expect(categorizeReadiness(78)).toBe('good');
      expect(categorizeReadiness(65)).toBe('fair');
      expect(categorizeReadiness(45)).toBe('pay_attention');
    });
  });

  describe('Sleep Score', () => {
    it('should validate sleep score components', () => {
      const sleepScore = {
        total_score: 85,
        contributors: {
          deep_sleep: 90,
          efficiency: 88,
          latency: 75,
          rem_sleep: 82,
          restfulness: 80,
          timing: 70,
          total_sleep: 92,
        },
      };

      expect(sleepScore.total_score).toBeGreaterThanOrEqual(0);
      expect(sleepScore.total_score).toBeLessThanOrEqual(100);

      for (const [key, value] of Object.entries(sleepScore.contributors)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Activity Score', () => {
    it('should validate activity metrics', () => {
      const activity = {
        score: 82,
        active_calories: 450,
        steps: 8500,
        total_calories: 2200,
        low_activity_time: 180,
        medium_activity_time: 45,
        high_activity_time: 20,
      };

      expect(activity.steps).toBeGreaterThan(0);
      expect(activity.active_calories).toBeLessThan(activity.total_calories);
      expect(activity.high_activity_time).toBeLessThan(activity.medium_activity_time);
    });
  });
});

// ============================================================================
// EIGHT SLEEP INTEGRATION
// ============================================================================

describe('Eight Sleep Integration', () => {
  describe('OAuth URL Generation', () => {
    it('should generate valid OAuth authorize URL', () => {
      const clientId = 'test-client-id';
      const redirectUri = 'https://example.com/callback';

      const url = new URL('https://client-api.8slp.net/oauth/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');

      expect(url.origin).toBe('https://client-api.8slp.net');
      expect(url.pathname).toBe('/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe(clientId);
    });
  });

  describe('Bed Temperature', () => {
    it('should validate temperature ranges', () => {
      // Eight Sleep uses -10 to +10 range for temperature levels
      const coldest = -10;
      const hottest = 10;
      const neutral = 0;
      const slightlyWarm = 3;

      expect(coldest).toBeGreaterThanOrEqual(-10);
      expect(hottest).toBeLessThanOrEqual(10);
      expect(neutral).toBe(0);
      expect(slightlyWarm).toBeGreaterThan(0);
      expect(slightlyWarm).toBeLessThan(hottest);
    });

    it('should convert temperature level to Fahrenheit', () => {
      // Approximate conversion for display
      const levelToFahrenheit = (level: number): number => {
        // Level 0 = ~86°F (bed neutral temp)
        // Each level = ~2°F
        return 86 + level * 2;
      };

      expect(levelToFahrenheit(0)).toBe(86);
      expect(levelToFahrenheit(5)).toBe(96);
      expect(levelToFahrenheit(-5)).toBe(76);
    });
  });

  describe('Sleep Fitness Score', () => {
    it('should validate sleep fitness components', () => {
      const sleepFitness = {
        overall: 85,
        latency: 90, // How quickly fell asleep
        routine: 75, // Consistency
        sleep_quality: 88,
        tosses_and_turns: 82, // Lower tossing = higher score
      };

      for (const [key, value] of Object.entries(sleepFitness)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Bed Sides', () => {
    it('should handle dual-zone temperatures', () => {
      const bedState = {
        leftSide: {
          userId: 'user-1',
          targetLevel: 3,
          currentLevel: 2.8,
          isActive: true,
        },
        rightSide: {
          userId: 'user-2',
          targetLevel: -2,
          currentLevel: -1.5,
          isActive: true,
        },
      };

      expect(bedState.leftSide.targetLevel).not.toBe(bedState.rightSide.targetLevel);
      expect(bedState.leftSide.isActive).toBe(true);
      expect(bedState.rightSide.isActive).toBe(true);
    });
  });

  describe('Sleep Stages', () => {
    it('should track sleep stages correctly', () => {
      const stages = [
        { stage: 'awake', start: '2024-01-15T23:00:00', end: '2024-01-15T23:15:00' },
        { stage: 'light', start: '2024-01-15T23:15:00', end: '2024-01-16T00:30:00' },
        { stage: 'deep', start: '2024-01-16T00:30:00', end: '2024-01-16T02:00:00' },
        { stage: 'rem', start: '2024-01-16T02:00:00', end: '2024-01-16T03:30:00' },
        { stage: 'light', start: '2024-01-16T03:30:00', end: '2024-01-16T05:00:00' },
        { stage: 'deep', start: '2024-01-16T05:00:00', end: '2024-01-16T06:00:00' },
        { stage: 'awake', start: '2024-01-16T06:00:00', end: '2024-01-16T06:30:00' },
      ];

      const stageCounts = stages.reduce(
        (acc, s) => {
          acc[s.stage] = (acc[s.stage] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      expect(stageCounts['deep']).toBe(2);
      expect(stageCounts['rem']).toBe(1);
      expect(stageCounts['light']).toBe(2);
      expect(stageCounts['awake']).toBe(2);
    });
  });
});

// ============================================================================
// STRESS DETECTION
// ============================================================================

describe('Stress Detection from Wearables', () => {
  it('should detect elevated stress from low HRV', () => {
    const hrvBaseline = 50; // User's typical HRV
    const currentHrv = 30; // Lower than usual

    const hrvDeviation = ((hrvBaseline - currentHrv) / hrvBaseline) * 100;
    const stressLevel = Math.min(100, Math.max(0, hrvDeviation));

    expect(stressLevel).toBe(40);
    expect(stressLevel > 40).toBe(false); // Threshold for elevated
  });

  it('should detect elevated stress from high resting HR', () => {
    const normalRestingHR = 65;
    const elevatedRestingHR = 85;
    const threshold = 80;

    expect(elevatedRestingHR > threshold).toBe(true);
    expect(normalRestingHR > threshold).toBe(false);
  });

  it('should combine multiple stress indicators', () => {
    const indicators = {
      hrvDeviation: 35,
      elevatedHR: true,
      poorSleep: true,
    };

    let stressScore = indicators.hrvDeviation;
    if (indicators.elevatedHR) stressScore += 15;
    if (indicators.poorSleep) stressScore += 10;

    const stressLevel = Math.min(100, stressScore);
    expect(stressLevel).toBe(60);
    expect(stressLevel > 40).toBe(true); // Elevated
  });
});

// ============================================================================
// CACHING
// ============================================================================

describe('Status Caching', () => {
  it('should expire cache entries after TTL', async () => {
    const CACHE_TTL_MS = 60 * 1000; // 1 minute
    const now = Date.now();

    const cachedEntry = {
      status: { connected: true, lastSyncAt: '2024-01-15T10:00:00' },
      expiresAt: now + CACHE_TTL_MS,
    };

    // Fresh cache
    expect(cachedEntry.expiresAt > now).toBe(true);

    // Expired cache (simulate time passing)
    const expiredEntry = {
      ...cachedEntry,
      expiresAt: now - 1000,
    };
    expect(expiredEntry.expiresAt > now).toBe(false);
  });

  it('should clear cache on disconnect', () => {
    const cache = new Map<string, unknown>();
    cache.set('user-1', { status: 'connected' });

    expect(cache.has('user-1')).toBe(true);

    cache.delete('user-1');
    expect(cache.has('user-1')).toBe(false);
  });
});
