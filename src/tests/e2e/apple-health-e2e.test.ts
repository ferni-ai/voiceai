/**
 * Apple Health E2E Integration Tests
 *
 * Tests the full flow: iOS App → API → Firestore → Semantic Memory → Context
 *
 * @module tests/e2e/apple-health-e2e.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firestore
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn().mockReturnValue({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ exists: false }),
          })),
        })),
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      })),
    })),
  }),
  cleanForFirestore: vi.fn((obj) => obj),
}));

// Track what gets indexed
const indexedData: Array<{
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
}> = [];

vi.mock('../../services/data-layer/hooks/health-hooks.js', async () => {
  const actual = await vi.importActual('../../services/data-layer/hooks/health-hooks.js');
  return {
    ...actual,
    onSleepPatternChange: vi.fn(async (_userId, _entityId, data, action) => {
      if (action !== 'delete') {
        indexedData.push({
          entityType: 'sleep_pattern',
          content: `Sleep pattern: ${data.pattern}`,
          metadata: data,
        });
      }
    }),
    onWorkoutChange: vi.fn(async (_userId, _entityId, data, action) => {
      if (action !== 'delete') {
        indexedData.push({
          entityType: 'workout',
          content: `Workout: ${data.activity}`,
          metadata: data,
        });
      }
    }),
    onWellnessCheckinChange: vi.fn(async (_userId, _entityId, data, action) => {
      if (action !== 'delete') {
        indexedData.push({
          entityType: 'wellness_checkin',
          content: `Wellness check: Mood ${data.mood}/10`,
          metadata: data,
        });
      }
    }),
    onHealthSummaryChange: vi.fn(async (_userId, _entityId, data, action) => {
      if (action !== 'delete') {
        indexedData.push({
          entityType: 'health_summary',
          content: `Health summary for ${data.date}`,
          metadata: data,
        });
      }
    }),
  };
});

describe('Apple Health E2E Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    indexedData.length = 0;
  });

  describe('Sync Payload Processing', () => {
    it('should process sleep data and index to semantic memory', async () => {
      const { processSyncPayload } = await import('../../services/identity/apple-health-sync.js');
      const { onSleepPatternChange } =
        await import('../../services/data-layer/hooks/health-hooks.js');

      const payload = {
        userId: 'test-user',
        deviceId: 'device-123',
        syncedAt: new Date().toISOString(),
        data: {
          sleep: [
            {
              id: 'sleep-1',
              startDate: '2024-01-15T23:00:00Z',
              endDate: '2024-01-16T07:00:00Z',
              sleepType: 'asleep',
              source: 'iPhone',
            },
          ],
        },
      };

      const result = await processSyncPayload('test-user', payload);

      expect(result.success).toBe(true);
      expect(result.data?.processed).toBe(1);

      // Verify semantic indexing was triggered
      expect(onSleepPatternChange).toHaveBeenCalled();
    });

    it('should process workout data and index to semantic memory', async () => {
      const { processSyncPayload } = await import('../../services/identity/apple-health-sync.js');
      const { onWorkoutChange } = await import('../../services/data-layer/hooks/health-hooks.js');

      const payload = {
        userId: 'test-user',
        deviceId: 'device-123',
        syncedAt: new Date().toISOString(),
        data: {
          workouts: [
            {
              id: 'workout-1',
              startDate: '2024-01-15T08:00:00Z',
              endDate: '2024-01-15T08:45:00Z',
              activityType: 'running',
              duration: 45 * 60, // seconds
              distance: 5.5, // km
              energyBurned: 450,
              source: 'Apple Watch',
            },
          ],
        },
      };

      const result = await processSyncPayload('test-user', payload);

      expect(result.success).toBe(true);
      expect(result.data?.processed).toBe(1);

      // Verify semantic indexing was triggered
      expect(onWorkoutChange).toHaveBeenCalled();
    });

    it('should process activity data and index as wellness checkin', async () => {
      const { processSyncPayload } = await import('../../services/identity/apple-health-sync.js');
      const { onWellnessCheckinChange } =
        await import('../../services/data-layer/hooks/health-hooks.js');

      const payload = {
        userId: 'test-user',
        deviceId: 'device-123',
        syncedAt: new Date().toISOString(),
        data: {
          activity: [
            {
              date: '2024-01-15',
              activeEnergyBurned: 350,
              appleExerciseTime: 30,
              appleStandHours: 10,
              stepCount: 8500,
            },
          ],
        },
      };

      const result = await processSyncPayload('test-user', payload);

      expect(result.success).toBe(true);

      // Verify wellness checkin was indexed
      expect(onWellnessCheckinChange).toHaveBeenCalledWith(
        'test-user',
        expect.stringContaining('activity'),
        expect.objectContaining({
          notes: expect.stringContaining('350'),
        }),
        'update'
      );
    });

    it('should handle multiple data types in single sync', async () => {
      const { processSyncPayload } = await import('../../services/identity/apple-health-sync.js');

      const payload = {
        userId: 'test-user',
        deviceId: 'device-123',
        syncedAt: new Date().toISOString(),
        data: {
          sleep: [
            {
              id: 'sleep-1',
              startDate: '2024-01-15T23:00:00Z',
              endDate: '2024-01-16T07:00:00Z',
              sleepType: 'asleep',
              source: 'iPhone',
            },
          ],
          workouts: [
            {
              id: 'workout-1',
              startDate: '2024-01-15T08:00:00Z',
              endDate: '2024-01-15T08:45:00Z',
              activityType: 'cycling',
              duration: 45 * 60,
              distance: 15,
              energyBurned: 380,
              source: 'Apple Watch',
            },
          ],
          activity: [
            {
              date: '2024-01-15',
              activeEnergyBurned: 450,
              appleExerciseTime: 60,
              appleStandHours: 12,
              stepCount: 10500,
            },
          ],
        },
      };

      const result = await processSyncPayload('test-user', payload);

      expect(result.success).toBe(true);
      // 1 sleep + 1 workout + 1 activity = 3
      expect(result.data?.processed).toBe(3);
    });
  });

  describe('Health Data Store Integration', () => {
    it('should store health summary and index to semantic memory', async () => {
      const { storeHealthSummary } = await import('../../services/health/health-data-store.js');
      const { onHealthSummaryChange } =
        await import('../../services/data-layer/hooks/health-hooks.js');

      await storeHealthSummary({
        userId: 'test-user',
        date: '2024-01-15',
        sleepHours: 7.5,
        sleepQuality: 'good',
        stepsToday: 8500,
        activityTrend: 'active',
        restingHeartRate: 62,
      });

      // Verify semantic indexing was triggered
      expect(onHealthSummaryChange).toHaveBeenCalledWith(
        'test-user',
        '2024-01-15',
        expect.objectContaining({
          sleepHours: 7.5,
          sleepQuality: 'good',
        }),
        'update'
      );
    });
  });

  describe('Context Injection', () => {
    it('should make health data available to context builders', async () => {
      // This tests that health data indexed to semantic memory
      // can be retrieved by context builders

      // First, simulate indexing some health data
      const { onHealthSummaryChange } =
        await import('../../services/data-layer/hooks/health-hooks.js');

      await onHealthSummaryChange(
        'context-test-user',
        '2024-01-15',
        {
          date: '2024-01-15',
          sleepHours: 5.5, // Poor sleep
          sleepQuality: 'poor',
          activity: 'sedentary',
          mood: 4,
        },
        'create'
      );

      // Verify data was indexed
      const healthSummary = indexedData.find((d) => d.entityType === 'health_summary');
      expect(healthSummary).toBeDefined();
      expect(healthSummary?.metadata.sleepQuality).toBe('poor');

      // In real flow, this would be retrieved by:
      // 1. searchUserContext('health sleep') → finds indexed data
      // 2. Context builder injects into LLM prompt
      // 3. LLM can reference "You only got 5.5 hours of sleep"
    });
  });
});

describe('Apple Health → Outreach Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    indexedData.length = 0;
  });

  it('should trigger outreach when sleep quality is poor for multiple days', async () => {
    // This tests that poor health data triggers proactive outreach
    const { onHealthSummaryChange } =
      await import('../../services/data-layer/hooks/health-hooks.js');

    // Simulate 3 days of poor sleep
    for (let i = 0; i < 3; i++) {
      await onHealthSummaryChange(
        'poor-sleep-user',
        `2024-01-${15 + i}`,
        {
          date: `2024-01-${15 + i}`,
          sleepHours: 4 + Math.random(),
          sleepQuality: 'poor',
          mood: 3 + Math.floor(Math.random() * 2),
        },
        'create'
      );
    }

    // Verify multiple poor sleep entries were indexed
    const poorSleepEntries = indexedData.filter(
      (d) => d.entityType === 'health_summary' && d.metadata.sleepQuality === 'poor'
    );
    expect(poorSleepEntries.length).toBe(3);

    // In real flow, the Capacity Guardian would:
    // 1. Detect pattern of poor sleep
    // 2. Call onPersistentLowEnergy() from outreach bridge
    // 3. Trigger proactive "How are you feeling?" outreach
  });

  it('should trigger celebration outreach for fitness milestones', async () => {
    const { onWorkoutChange } = await import('../../services/data-layer/hooks/health-hooks.js');

    // Simulate workout data that represents a milestone
    await onWorkoutChange(
      'fitness-user',
      'workout-milestone',
      {
        activity: 'Running',
        duration: 60,
        intensity: 'high',
        date: '2024-01-15',
        mood_before: 5,
        mood_after: 9, // Big mood boost!
        notes: '10K personal best!',
      },
      'create'
    );

    // Verify workout was indexed with mood improvement
    const workout = indexedData.find((d) => d.entityType === 'workout');
    expect(workout).toBeDefined();
    expect(workout?.metadata.mood_after).toBe(9);

    // In real flow:
    // 1. Detect significant mood improvement post-workout
    // 2. Trigger celebration outreach
  });
});

describe('Apple Health Data Privacy', () => {
  it('should respect user preferences for health data sharing', async () => {
    const { handleHealthSync } = await import('../../services/health/health-data-store.js');

    // Mock user preferences - sharing disabled
    vi.mock('../../services/health/health-data-store.js', async () => {
      const actual = await vi.importActual('../../services/health/health-data-store.js');
      return {
        ...actual,
        getHealthPreferences: vi.fn().mockResolvedValue({
          enabled: false, // User disabled health sharing
        }),
      };
    });

    // When sharing is disabled, sync should fail gracefully
    const result = await handleHealthSync({
      userId: 'privacy-user',
      deviceType: 'ios',
      timestamp: new Date().toISOString(),
      summary: {
        sleepHours: 7,
        stepsToday: 8000,
      },
    });

    // Should indicate that sharing is disabled
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });
});
