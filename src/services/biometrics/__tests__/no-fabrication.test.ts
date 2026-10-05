/**
 * Biometrics - No Fabrication Tests
 *
 * Verify that missing biometric data is not replaced with invented values.
 * Tests ensure that consumers receive null/undefined for unavailable fields
 * rather than plausible-but-false defaults.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../memory/store-factory.js', () => ({
  getStore: vi.fn().mockResolvedValue({
    getOrCreateProfile: vi.fn().mockResolvedValue({ userId: 'test-user' }),
    getProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: vi.fn().mockReturnValue({
    execute: vi.fn().mockImplementation((fn) => fn()),
  }),
}));

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { handleTerraWebhook, getCurrentBiometrics, getStressLevel } from '../index.js';

describe('No Fabrication - Terra Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should leave sleep fields undefined when Terra omits deep/REM data', async () => {
    const userId = 'test-no-fab-user';

    // First, authenticate the user
    const auth = await handleTerraWebhook({
      type: 'auth',
      user: { reference_id: userId, user_id: 'terra-123' },
    });
    expect(auth.success).toBe(true);

    // Send sleep data WITHOUT deep/REM breakdown (typical for Terra webhook)
    const sleepWebhook = {
      type: 'sleep',
      user: { reference_id: userId, user_id: 'terra-123' },
      data: [
        {
          sleep_durations_data: {
            asleep: { duration_asleep_state_seconds: 26000 }, // ~7.2 hours
            sleep_efficiency: 85, // Quality score
            // Notably absent: deep_sleep_duration, rem_sleep_duration
          },
        },
      ],
    };

    const result = await handleTerraWebhook(sleepWebhook);
    expect(result.success).toBe(true);

    // Get the snapshot
    const snapshot = getCurrentBiometrics(userId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.sleep).not.toBeNull();

    // Verify: duration and qualityScore are populated (real data)
    expect(snapshot!.sleep!.duration).toBeCloseTo(7.2, 1);
    expect(snapshot!.sleep!.qualityScore).toBe(85);

    // Verify: deep/REM/disturbances/bedtime/wakeTime are UNDEFINED (not fabricated)
    expect(snapshot!.sleep!.deepSleepPercent).toBeUndefined();
    expect(snapshot!.sleep!.remSleepPercent).toBeUndefined();
    expect(snapshot!.sleep!.disturbances).toBeUndefined();
    expect(snapshot!.sleep!.bedtime).toBeUndefined();
    expect(snapshot!.sleep!.wakeTime).toBeUndefined();
  });

  it('should return unknown stress when no biometric data is available', async () => {
    const userId = 'stress-unknown-user';

    // User with no biometrics connected
    const stressLevel = getStressLevel(userId);
    expect(stressLevel).toBe('unknown');
  });

  it('should leave sleep as null if Terra provides no duration', async () => {
    const userId = 'test-no-duration-user';

    const auth = await handleTerraWebhook({
      type: 'auth',
      user: { reference_id: userId, user_id: 'terra-456' },
    });
    expect(auth.success).toBe(true);

    // Sleep webhook with 0 duration (e.g., no sleep detected)
    const sleepWebhook = {
      type: 'sleep',
      user: { reference_id: userId, user_id: 'terra-456' },
      data: [
        {
          sleep_durations_data: {
            asleep: { duration_asleep_state_seconds: 0 }, // No sleep
            sleep_efficiency: 0,
          },
        },
      ],
    };

    const result = await handleTerraWebhook(sleepWebhook);
    expect(result.success).toBe(true);

    const snapshot = getCurrentBiometrics(userId);
    // When duration is 0, sleep should remain null (no fabricated reading)
    expect(snapshot!.sleep).toBeNull();
  });

  it('should not default stress level to moderate when unknown', async () => {
    const userId = 'stress-level-test-user';

    // Authenticate but don't provide HRV data
    const auth = await handleTerraWebhook({
      type: 'auth',
      user: { reference_id: userId, user_id: 'terra-789' },
    });
    expect(auth.success).toBe(true);

    // Get the stress level - should be 'unknown', not 'moderate'
    const stressLevel = getStressLevel(userId);
    expect(stressLevel).toBe('unknown');
    expect(stressLevel).not.toBe('moderate');
  });

  it('should handle partial sleep data without inventing missing fields', async () => {
    const userId = 'partial-sleep-user';

    const auth = await handleTerraWebhook({
      type: 'auth',
      user: { reference_id: userId, user_id: 'terra-partial' },
    });
    expect(auth.success).toBe(true);

    // Sleep data with only duration and quality (most common case from wearables)
    const sleepWebhook = {
      type: 'sleep',
      user: { reference_id: userId, user_id: 'terra-partial' },
      data: [
        {
          sleep_durations_data: {
            asleep: { duration_asleep_state_seconds: 28800 }, // 8 hours
            sleep_efficiency: 75, // Quality
            // Missing all breakdown data
          },
        },
      ],
    };

    const result = await handleTerraWebhook(sleepWebhook);
    expect(result.success).toBe(true);

    const snapshot = getCurrentBiometrics(userId);
    expect(snapshot!.sleep).not.toBeNull();

    // Real data is present
    expect(snapshot!.sleep!.duration).toBe(8);
    expect(snapshot!.sleep!.qualityScore).toBe(75);

    // Missing data is not invented (not 20, not 22, not 2, not new Date())
    expect(snapshot!.sleep!.deepSleepPercent).toBeUndefined();
    expect(snapshot!.sleep!.remSleepPercent).toBeUndefined();
    expect(snapshot!.sleep!.disturbances).toBeUndefined();
    expect(snapshot!.sleep!.bedtime).toBeUndefined();
    expect(snapshot!.sleep!.wakeTime).toBeUndefined();
  });
});

describe('Sleep Quality Insights - Graceful Handling of Missing Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only generate sleep insight when qualityScore is available', async () => {
    const { generateBiometricInsight } = await import('../insights.js');

    // Snapshot with sleep data but NO quality score (undefined)
    const snapshot = {
      userId: 'test',
      platform: 'terra' as const,
      timestamp: new Date(),
      hrv: null,
      sleep: {
        duration: 7,
        qualityScore: undefined, // Missing
        deepSleepPercent: undefined,
        remSleepPercent: undefined,
        disturbances: undefined,
        bedtime: undefined,
        wakeTime: undefined,
      },
      activity: null,
      recovery: null,
      stressLevel: 'unknown' as const,
    };

    const insight = generateBiometricInsight(snapshot);
    // Should not generate sleep insight when quality is unavailable
    expect(insight?.type).not.toBe('sleep');
  });

  it('should generate sleep insight when qualityScore IS available', async () => {
    const { generateBiometricInsight } = await import('../insights.js');

    const snapshot = {
      userId: 'test',
      platform: 'terra' as const,
      timestamp: new Date(),
      hrv: null,
      sleep: {
        duration: 6, // Poor sleep
        qualityScore: 45, // Available and low
        deepSleepPercent: undefined,
        remSleepPercent: undefined,
        disturbances: undefined,
        bedtime: undefined,
        wakeTime: undefined,
      },
      activity: null,
      recovery: null,
      stressLevel: 'unknown' as const,
    };

    const insight = generateBiometricInsight(snapshot);
    // Should generate sleep insight when qualityScore is available and poor
    expect(insight?.type).toBe('sleep');
    expect(insight?.insight).toContain('poor sleep');
  });
});
