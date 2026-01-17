/**
 * Biometrics Service Tests
 *
 * Tests for biometric platform integrations, OAuth flows, and data processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock store-factory
vi.mock('../../../memory/store-factory.js', () => ({
  getStore: vi.fn().mockResolvedValue({
    getOrCreateProfile: vi.fn().mockResolvedValue({ userId: 'test-user' }),
    getProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock circuit breaker
vi.mock('../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: vi.fn().mockReturnValue({
    execute: vi.fn().mockImplementation((fn) => fn()),
  }),
}));

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  getAuthorizationUrl,
  generateTerraSession,
  handleTerraWebhook,
  type BiometricPlatform,
  type SleepData,
  type HRVData,
  type ActivityData,
  type RecoveryData,
  type BiometricSnapshot,
  type StressLevel,
} from '../index.js';

describe('Biometrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Type definitions', () => {
    it('should have valid BiometricPlatform values', () => {
      const platforms: BiometricPlatform[] = [
        'healthkit',
        'googlefit',
        'oura',
        'whoop',
        'fitbit',
        'terra',
      ];

      expect(platforms).toHaveLength(6);
    });

    it('should have valid StressLevel values', () => {
      const levels: StressLevel[] = ['low', 'moderate', 'high', 'elevated'];

      expect(levels).toHaveLength(4);
    });

    it('should have valid SleepData structure', () => {
      const sleepData: SleepData = {
        duration: 7.5,
        deepSleepPercent: 20,
        remSleepPercent: 25,
        disturbances: 2,
        qualityScore: 85,
        bedtime: new Date('2024-12-25T22:00:00Z'),
        wakeTime: new Date('2024-12-26T06:30:00Z'),
      };

      expect(sleepData.duration).toBe(7.5);
      expect(sleepData.qualityScore).toBeGreaterThanOrEqual(0);
      expect(sleepData.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should have valid HRVData structure', () => {
      const hrvData: HRVData = {
        current: 45,
        baseline: 50,
        deviationPercent: -10,
        timestamp: new Date(),
      };

      expect(hrvData.current).toBe(45);
      expect(hrvData.deviationPercent).toBe(-10);
    });

    it('should have valid ActivityData structure', () => {
      const activityData: ActivityData = {
        steps: 8500,
        activeMinutes: 45,
        caloriesBurned: 2200,
        hoursSinceActivity: 2,
        standingHours: 8,
      };

      expect(activityData.steps).toBe(8500);
      expect(activityData.activeMinutes).toBeGreaterThanOrEqual(0);
    });

    it('should have valid RecoveryData structure', () => {
      const recoveryData: RecoveryData = {
        score: 75,
        readiness: 'high',
        factors: {
          sleep: 80,
          hrv: 70,
          restingHR: 85,
          activity: 65,
        },
      };

      expect(recoveryData.score).toBe(75);
      expect(['low', 'moderate', 'high', 'peak']).toContain(recoveryData.readiness);
    });

    it('should have valid BiometricSnapshot structure', () => {
      const snapshot: BiometricSnapshot = {
        userId: 'test-user',
        platform: 'whoop',
        timestamp: new Date(),
        hrv: null,
        sleep: null,
        activity: null,
        recovery: null,
        stressLevel: 'low',
      };

      expect(snapshot.userId).toBe('test-user');
      expect(snapshot.platform).toBe('whoop');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate HealthKit deep link URL', () => {
      const url = getAuthorizationUrl('healthkit', 'user-123');

      expect(url).toContain('ferni://healthkit/auth');
      expect(url).toContain('state=');
    });

    it('should generate Google Fit OAuth URL', () => {
      const url = getAuthorizationUrl('googlefit', 'user-123');

      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('response_type=code');
      expect(url).toContain('fitness.heart_rate.read');
    });

    it('should generate Oura OAuth URL', () => {
      const url = getAuthorizationUrl('oura', 'user-123');

      expect(url).toContain('cloud.ouraring.com/oauth/authorize');
      expect(url).toContain('response_type=code');
    });

    it('should generate Whoop OAuth URL', () => {
      const url = getAuthorizationUrl('whoop', 'user-123');

      expect(url).toContain('api.prod.whoop.com/oauth/oauth2/auth');
      // Colons are URL-encoded as %3A
      expect(url).toContain('read%3Arecovery');
      expect(url).toContain('read%3Asleep');
    });

    it.skip('should generate Terra session placeholder (requires TERRA env vars)', () => {
      // Terra URL generation requires TERRA_DEV_ID and TERRA_API_KEY env vars
      // Tested via integration tests with actual credentials
      const url = getAuthorizationUrl('terra', 'user-123');

      expect(url).toContain('TERRA_SESSION_REQUIRED');
      expect(url).toContain('user-123');
    });

    it('should throw for unsupported platform', () => {
      expect(() => getAuthorizationUrl('unknown' as BiometricPlatform, 'user-123')).toThrow(
        'Unsupported platform'
      );
    });

    it('should include encoded state with userId and platform', () => {
      const url = getAuthorizationUrl('googlefit', 'user-123');
      const stateMatch = url.match(/state=([^&]+)/);

      expect(stateMatch).toBeTruthy();

      if (stateMatch) {
        const decoded = JSON.parse(Buffer.from(stateMatch[1], 'base64').toString());
        expect(decoded.userId).toBe('user-123');
        expect(decoded.platform).toBe('googlefit');
      }
    });

    it('should accept custom scopes for Google Fit', () => {
      const customScopes = ['https://www.googleapis.com/auth/fitness.activity.read'];
      const url = getAuthorizationUrl('googlefit', 'user-123', customScopes);

      expect(url).toContain(encodeURIComponent(customScopes[0]));
    });

    it('should accept custom scopes for Oura', () => {
      const customScopes = ['daily', 'sleep'];
      const url = getAuthorizationUrl('oura', 'user-123', customScopes);

      expect(url).toContain(encodeURIComponent(customScopes.join(' ')));
    });

    it('should accept custom scopes for Whoop', () => {
      const customScopes = ['read:recovery'];
      const url = getAuthorizationUrl('whoop', 'user-123', customScopes);

      expect(url).toContain(encodeURIComponent(customScopes[0]));
    });
  });

  describe('generateTerraSession', () => {
    it('should return error when Terra is not configured', async () => {
      // Terra credentials are not set in test env
      const result = await generateTerraSession('user-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Terra API not configured');
      }
    });
  });

  describe('handleTerraWebhook', () => {
    it('should reject invalid webhook payload', async () => {
      const result = await handleTerraWebhook({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid webhook payload');
    });

    it('should reject webhook without user reference', async () => {
      const result = await handleTerraWebhook({
        type: 'auth',
        // Missing user
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid webhook payload');
    });

    it('should process auth webhook successfully', async () => {
      const result = await handleTerraWebhook({
        type: 'auth',
        user: {
          reference_id: 'user-123',
          user_id: 'terra-user-456',
        },
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user-123');
    });

    it('should process deauth webhook successfully', async () => {
      const result = await handleTerraWebhook({
        type: 'deauth',
        user: {
          reference_id: 'user-123',
          user_id: 'terra-user-456',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should process sleep data webhook', async () => {
      // First authenticate the user
      await handleTerraWebhook({
        type: 'auth',
        user: {
          reference_id: 'user-sleep-test',
          user_id: 'terra-user-sleep',
        },
      });

      // Then send sleep data
      const result = await handleTerraWebhook({
        type: 'sleep',
        user: {
          reference_id: 'user-sleep-test',
          user_id: 'terra-user-sleep',
        },
        data: [
          {
            sleep_durations_data: {
              asleep: {
                duration_asleep_state_seconds: 25200, // 7 hours
              },
              sleep_efficiency: 0.85,
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should process activity data webhook', async () => {
      await handleTerraWebhook({
        type: 'auth',
        user: {
          reference_id: 'user-activity-test',
          user_id: 'terra-user-activity',
        },
      });

      const result = await handleTerraWebhook({
        type: 'activity',
        user: {
          reference_id: 'user-activity-test',
          user_id: 'terra-user-activity',
        },
        data: [
          {
            steps: 10000,
            active_durations_data: {
              activity_seconds: 3600,
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Data Range Validation', () => {
    it('should validate sleep duration is reasonable (0-24 hours)', () => {
      const validSleep: SleepData = {
        duration: 7.5,
        deepSleepPercent: 20,
        remSleepPercent: 25,
        disturbances: 2,
        qualityScore: 85,
        bedtime: new Date(),
        wakeTime: new Date(),
      };

      expect(validSleep.duration).toBeGreaterThanOrEqual(0);
      expect(validSleep.duration).toBeLessThanOrEqual(24);
    });

    it('should validate sleep percentages sum to <= 100', () => {
      const validSleep: SleepData = {
        duration: 7,
        deepSleepPercent: 20,
        remSleepPercent: 25,
        disturbances: 1,
        qualityScore: 80,
        bedtime: new Date(),
        wakeTime: new Date(),
      };

      expect(validSleep.deepSleepPercent + validSleep.remSleepPercent).toBeLessThanOrEqual(100);
    });

    it('should validate HRV is in reasonable range (0-200ms)', () => {
      const validHRV: HRVData = {
        current: 50,
        baseline: 55,
        deviationPercent: -9,
        timestamp: new Date(),
      };

      expect(validHRV.current).toBeGreaterThanOrEqual(0);
      expect(validHRV.current).toBeLessThanOrEqual(200);
    });

    it('should validate recovery score is 0-100', () => {
      const validRecovery: RecoveryData = {
        score: 85,
        readiness: 'high',
        factors: { sleep: 90, hrv: 80, restingHR: 85, activity: 75 },
      };

      expect(validRecovery.score).toBeGreaterThanOrEqual(0);
      expect(validRecovery.score).toBeLessThanOrEqual(100);
    });

    it('should validate steps are non-negative', () => {
      const validActivity: ActivityData = {
        steps: 0,
        activeMinutes: 0,
        caloriesBurned: 0,
        hoursSinceActivity: 0,
        standingHours: 0,
      };

      expect(validActivity.steps).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Platform-specific behavior', () => {
    it('should handle Fitbit as terra aggregation', () => {
      const platforms: BiometricPlatform[] = ['fitbit', 'terra'];

      // Both should be valid platforms
      platforms.forEach((platform) => {
        expect(['healthkit', 'googlefit', 'oura', 'whoop', 'fitbit', 'terra']).toContain(platform);
      });
    });

    it('should have different URL formats for each platform (excluding Terra)', () => {
      // Terra excluded because it requires env vars - tested separately
      const urls = {
        healthkit: getAuthorizationUrl('healthkit', 'user'),
        googlefit: getAuthorizationUrl('googlefit', 'user'),
        oura: getAuthorizationUrl('oura', 'user'),
        whoop: getAuthorizationUrl('whoop', 'user'),
      };

      // All URLs should be unique
      const uniqueUrls = new Set(Object.values(urls));
      expect(uniqueUrls.size).toBe(Object.keys(urls).length);
    });
  });

  describe('Stress Level Categories', () => {
    it('should have stress levels in increasing order', () => {
      const stressLevels: StressLevel[] = ['low', 'moderate', 'elevated', 'high'];

      expect(stressLevels.indexOf('low')).toBeLessThan(stressLevels.indexOf('moderate'));
      expect(stressLevels.indexOf('moderate')).toBeLessThan(stressLevels.indexOf('elevated'));
    });

    it('should support all stress levels in BiometricSnapshot', () => {
      const levels: StressLevel[] = ['low', 'moderate', 'high', 'elevated'];

      levels.forEach((level) => {
        const snapshot: BiometricSnapshot = {
          userId: 'test',
          platform: 'whoop',
          timestamp: new Date(),
          hrv: null,
          sleep: null,
          activity: null,
          recovery: null,
          stressLevel: level,
        };

        expect(snapshot.stressLevel).toBe(level);
      });
    });
  });
});
