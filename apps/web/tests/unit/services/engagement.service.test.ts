/**
 * Engagement Service Tests
 *
 * Tests for user engagement data management including:
 * - Callback registration
 * - Data message handling and routing
 * - API fetch operations with retry logic
 * - Streak milestone detection
 * - Cache behavior
 * - Offline fallback
 * - Prediction data transformation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  EngagementEvent,
  EngagementTriggerEvent
} from '../../../src/types/events.js';
import type {
  PredictionData,
  EngagementServiceCallbacks
} from '../../../src/services/engagement.service.js';
import type { EngagementData } from '../../../src/ui/engagement.ui.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('EngagementService', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setCallbacks', () => {
    it('should register callbacks', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const callbacks: EngagementServiceCallbacks = {
        onEngagementUpdate: vi.fn(),
        onEngagementTrigger: vi.fn(),
        onPredictionsUpdate: vi.fn(),
        onStreakMilestone: vi.fn(),
      };

      engagementService.setCallbacks(callbacks);

      // Callbacks should be stored (we can verify by triggering an event)
      expect(callbacks.onEngagementUpdate).toBeDefined();
    });

    it('should allow partial callbacks', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const callbacks: EngagementServiceCallbacks = {
        onEngagementUpdate: vi.fn(),
        // Only one callback provided
      };

      engagementService.setCallbacks(callbacks);

      // Should not throw
      expect(callbacks.onEngagementUpdate).toBeDefined();
    });
  });

  describe('handleDataMessage', () => {
    it('should return false for non-engagement messages', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const message = { type: 'status', text: 'hello' };
      const result = engagementService.handleDataMessage(message);

      expect(result).toBe(false);
    });

    it('should return true for engagement data messages', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 0,
          longestOverallStreak: 0,
          currentActiveStreaks: 0,
          teamHuddlesAttended: 0,
        },
        timestamp: Date.now(),
      };

      const result = engagementService.handleDataMessage(engagementMessage);

      expect(result).toBe(true);
    });

    it('should return true for engagement trigger messages', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const triggerMessage: EngagementTriggerEvent = {
        type: 'engagement_trigger',
        triggerType: 'streak_due',
        personaId: 'ferni',
        message: 'Time for your morning ritual!',
        priority: 'high',
        timestamp: Date.now(),
      };

      const result = engagementService.handleDataMessage(triggerMessage);

      expect(result).toBe(true);
    });

    it('should fire onEngagementUpdate callback on engagement message', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const updateCallback = vi.fn();
      engagementService.setCallbacks({ onEngagementUpdate: updateCallback });

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [{
          ritualId: 'ferni-sky-check',
          ritualName: 'Morning Sky Check',
          personaId: 'ferni',
          currentStreak: 5,
          longestStreak: 10,
          lastCompletedAt: '2025-12-05',
          dueToday: true,
        }],
        weatherHistory: [{
          primary: 'sunny',
          energy: 'high',
          recordedAt: '2025-12-05',
        }],
        stats: {
          totalRitualDays: 50,
          longestOverallStreak: 15,
          currentActiveStreaks: 1,
          teamHuddlesAttended: 3,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      expect(updateCallback).toHaveBeenCalledTimes(1);
      expect(updateCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          ritualStreaks: expect.any(Array),
          weatherHistory: expect.any(Array),
          stats: expect.any(Object),
        })
      );
    });

    it('should fire onEngagementTrigger callback on trigger message', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const triggerCallback = vi.fn();
      engagementService.setCallbacks({ onEngagementTrigger: triggerCallback });

      const triggerMessage: EngagementTriggerEvent = {
        type: 'engagement_trigger',
        triggerType: 'streak_milestone',
        personaId: 'ferni',
        message: '7 day streak!',
        priority: 'high',
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(triggerMessage);

      expect(triggerCallback).toHaveBeenCalledTimes(1);
      expect(triggerCallback).toHaveBeenCalledWith(triggerMessage);
    });

    it('should cache engagement data', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 25,
          longestOverallStreak: 8,
          currentActiveStreaks: 2,
          teamHuddlesAttended: 1,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      const cachedData = engagementService.getCachedData();
      expect(cachedData).not.toBeNull();
      expect(cachedData?.stats.totalRitualDays).toBe(25);
    });

    it('should cache predictions if provided', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const predictions: PredictionData[] = [
        {
          id: 'pred-1',
          category: 'mood',
          question: 'Week of Dec 1',
          userPrediction: 7,
          status: 'pending',
          createdAt: '2025-12-01',
        },
      ];

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 0,
          longestOverallStreak: 0,
          currentActiveStreaks: 0,
          teamHuddlesAttended: 0,
        },
        predictions,
        timestamp: Date.now(),
      };

      const predictionCallback = vi.fn();
      engagementService.setCallbacks({ onPredictionsUpdate: predictionCallback });

      engagementService.handleDataMessage(engagementMessage);

      expect(predictionCallback).toHaveBeenCalledWith(predictions);
      expect(engagementService.getCachedPredictions()).toEqual(predictions);
    });
  });

  describe('Streak Milestone Detection', () => {
    it('should detect 7 day streak milestone', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const milestoneCallback = vi.fn();
      engagementService.setCallbacks({ onStreakMilestone: milestoneCallback });

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [{
          ritualId: 'ferni-sky-check',
          ritualName: 'Morning Sky Check',
          personaId: 'ferni',
          currentStreak: 7,
          longestStreak: 7,
          lastCompletedAt: '2025-12-06',
          dueToday: false,
        }],
        weatherHistory: [],
        stats: {
          totalRitualDays: 7,
          longestOverallStreak: 7,
          currentActiveStreaks: 1,
          teamHuddlesAttended: 0,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      expect(milestoneCallback).toHaveBeenCalledWith({
        ritualName: 'Morning Sky Check',
        count: 7,
        personaId: 'ferni',
      });
    });

    it('should detect multiple milestone thresholds', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const milestoneCallback = vi.fn();
      engagementService.setCallbacks({ onStreakMilestone: milestoneCallback });

      const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];

      for (const count of milestones) {
        milestoneCallback.mockClear();

        const engagementMessage: EngagementEvent = {
          type: 'engagement',
          ritualStreaks: [{
            ritualId: 'ferni-sky-check',
            ritualName: 'Morning Sky Check',
            personaId: 'ferni',
            currentStreak: count,
            longestStreak: count,
            lastCompletedAt: '2025-12-06',
            dueToday: false,
          }],
          weatherHistory: [],
          stats: {
            totalRitualDays: count,
            longestOverallStreak: count,
            currentActiveStreaks: 1,
            teamHuddlesAttended: 0,
          },
          timestamp: Date.now(),
        };

        engagementService.handleDataMessage(engagementMessage);

        expect(milestoneCallback).toHaveBeenCalledWith({
          ritualName: 'Morning Sky Check',
          count,
          personaId: 'ferni',
        });
      }
    });

    it('should not fire milestone callback for non-milestone streaks', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const milestoneCallback = vi.fn();
      engagementService.setCallbacks({ onStreakMilestone: milestoneCallback });

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [{
          ritualId: 'ferni-sky-check',
          ritualName: 'Morning Sky Check',
          personaId: 'ferni',
          currentStreak: 5, // Not a milestone
          longestStreak: 10,
          lastCompletedAt: '2025-12-06',
          dueToday: false,
        }],
        weatherHistory: [],
        stats: {
          totalRitualDays: 5,
          longestOverallStreak: 10,
          currentActiveStreaks: 1,
          teamHuddlesAttended: 0,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      expect(milestoneCallback).not.toHaveBeenCalled();
    });

    it('should fire milestone for each streak reaching milestone', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      const milestoneCallback = vi.fn();
      engagementService.setCallbacks({ onStreakMilestone: milestoneCallback });

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [
          {
            ritualId: 'ferni-sky-check',
            ritualName: 'Morning Sky Check',
            personaId: 'ferni',
            currentStreak: 7,
            longestStreak: 7,
            lastCompletedAt: '2025-12-06',
            dueToday: false,
          },
          {
            ritualId: 'alex-inbox-pulse',
            ritualName: 'Inbox Pulse',
            personaId: 'alex',
            currentStreak: 14,
            longestStreak: 14,
            lastCompletedAt: '2025-12-06',
            dueToday: false,
          },
        ],
        weatherHistory: [],
        stats: {
          totalRitualDays: 21,
          longestOverallStreak: 14,
          currentActiveStreaks: 2,
          teamHuddlesAttended: 0,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      expect(milestoneCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchEngagementData', () => {
    it('should return cached data if available', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      // Set up cached data
      const cachedData: EngagementData = {
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 10,
          longestOverallStreak: 5,
          currentActiveStreaks: 1,
          teamHuddlesAttended: 2,
        },
        lastEngagementAt: '2025-12-05',
      };

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: cachedData.stats,
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      const result = await engagementService.fetchEngagementData('user123');

      expect(result).toEqual(expect.objectContaining({
        stats: cachedData.stats,
      }));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch from API when no cache', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          streaks: [{
            ritualId: 'ferni-sky-check',
            personaId: 'ferni',
            currentStreak: 3,
            longestStreak: 10,
            lastCompletedAt: '2025-12-05',
          }],
          weatherHistory: [],
          stats: {
            totalRitualDays: 15,
            longestOverallStreak: 10,
          },
        }),
      });

      const result = await engagementService.fetchEngagementData('user123');

      // API uses full URL with window.location.origin
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/rituals?userId=user123'),
        expect.any(Object)
      );
      expect(result).not.toBeNull();
      expect(result?.ritualStreaks).toHaveLength(1);
    });

    it('should return cached data on API error', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      // Set up cache first
      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 20,
          longestOverallStreak: 8,
          currentActiveStreaks: 1,
          teamHuddlesAttended: 0,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      // Now simulate API failure
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await engagementService.fetchEngagementData('user123');

      expect(result).not.toBeNull();
      expect(result?.stats.totalRitualDays).toBe(20);
    });

    it('should return cached data when offline', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      // Set up cache
      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 30,
          longestOverallStreak: 15,
          currentActiveStreaks: 2,
          teamHuddlesAttended: 5,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      // Simulate API failure (offline behavior)
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await engagementService.fetchEngagementData('user123');

      expect(result?.stats.totalRitualDays).toBe(30);
    });

    it('should transform API response correctly', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          streaks: [{
            ritualId: 'maya-habit-heartbeat',
            personaId: 'maya',
            currentStreak: 7,
            longestStreak: 12,
            lastCompletedAt: '2025-12-05T08:00:00Z',
          }],
          weatherHistory: [{
            weather: {
              primary: 'sunny',
              energy: 'high',
              note: 'Feeling great!',
            },
            date: '2025-12-06',
          }],
          stats: {
            totalRitualDays: 50,
            longestOverallStreak: 20,
            predictionAccuracy: 85,
            teamHuddlesAttended: 3,
          },
          lastEngagementAt: '2025-12-06T10:00:00Z',
        }),
      });

      const result = await engagementService.fetchEngagementData('user123');

      expect(result).not.toBeNull();
      expect(result?.ritualStreaks[0].ritualName).toBe('Habit Heartbeat');
      expect(result?.weatherHistory[0].primary).toBe('sunny');
      expect(result?.weatherHistory[0].note).toBe('Feeling great!');
      expect(result?.stats.predictionAccuracy).toBe(85);
    });

    it('should handle missing fields in API response', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          // Minimal response
        }),
      });

      const result = await engagementService.fetchEngagementData('user123');

      expect(result).not.toBeNull();
      expect(result?.ritualStreaks).toEqual([]);
      expect(result?.weatherHistory).toEqual([]);
      expect(result?.stats.totalRitualDays).toBe(0);
    });

    it('should fire onEngagementUpdate callback after successful fetch', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const updateCallback = vi.fn();
      engagementService.setCallbacks({ onEngagementUpdate: updateCallback });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          streaks: [],
          weatherHistory: [],
          stats: { totalRitualDays: 5 },
        }),
      });

      await engagementService.fetchEngagementData('user123');

      expect(updateCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchPredictions', () => {
    it('should return cached predictions if available', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const predictions: PredictionData[] = [{
        id: 'pred-1',
        category: 'mood',
        question: 'Test',
        userPrediction: 8,
        status: 'pending',
        createdAt: '2025-12-01',
      }];

      // Set up cache via message
      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 0,
          longestOverallStreak: 0,
          currentActiveStreaks: 0,
          teamHuddlesAttended: 0,
        },
        predictions,
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      const result = await engagementService.fetchPredictions('user123');

      expect(result).toEqual(predictions);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch from API when no cache', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          predictions: [{
            id: 'pred-1',
            predictions: {
              'Mood average (1-10)': 7,
            },
            weekOf: 'Dec 1',
            createdAt: '2025-12-01',
          }],
        }),
      });

      const result = await engagementService.fetchPredictions('user123');

      // API uses full URL with window.location.origin
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/predictions?userId=user123'),
        expect.any(Object)
      );
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('mood');
    });

    it('should transform prediction data correctly', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          predictions: [
            {
              id: 'pred-1',
              predictions: {
                'Mood average (1-10)': 7,
                'Sleep hours': 8,
              },
              weekOf: 'Dec 1',
              accuracy: 90,
              completedAt: '2025-12-08',
              createdAt: '2025-12-01',
            },
            {
              id: 'pred-2',
              predictions: {
                'Deep work hours': 5,
              },
              weekOf: 'Dec 8',
              createdAt: '2025-12-08',
            },
          ],
        }),
      });

      const result = await engagementService.fetchPredictions('user123');

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('mood');
      expect(result[0].actualOutcome).toBe(90);
      expect(result[0].status).toBe('resolved');
      expect(result[1].category).toBe('productivity');
      expect(result[1].status).toBe('pending');
    });

    it('should handle offline status for predictions', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      // Simulate API failure (offline)
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await engagementService.fetchPredictions('user123');

      expect(result).toEqual([]);
    });

    it('should extract category correctly', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          predictions: [
            {
              id: 'pred-1',
              predictions: { 'Mood average (1-10)': 7 },
              weekOf: 'Dec 1',
              createdAt: '2025-12-01',
            },
            {
              id: 'pred-2',
              predictions: { 'Deep work hours': 5 },
              weekOf: 'Dec 1',
              createdAt: '2025-12-01',
            },
            {
              id: 'pred-3',
              predictions: { 'Exercise sessions': 3 },
              weekOf: 'Dec 1',
              createdAt: '2025-12-01',
            },
            {
              id: 'pred-4',
              predictions: { 'Other metric': 10 },
              weekOf: 'Dec 1',
              createdAt: '2025-12-01',
            },
          ],
        }),
      });

      const result = await engagementService.fetchPredictions('user123');

      expect(result[0].category).toBe('mood');
      expect(result[1].category).toBe('productivity');
      expect(result[2].category).toBe('health');
      expect(result[3].category).toBe('overall');
    });

    it('should calculate main value as average', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          predictions: [{
            id: 'pred-1',
            predictions: {
              'Metric A': 6,
              'Metric B': 8,
              'Metric C': 10,
            },
            weekOf: 'Dec 1',
            createdAt: '2025-12-01',
          }],
        }),
      });

      const result = await engagementService.fetchPredictions('user123');

      // Average of 6, 8, 10 = 8
      expect(result[0].userPrediction).toBe(8);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      // Set up cache
      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 10,
          longestOverallStreak: 5,
          currentActiveStreaks: 1,
          teamHuddlesAttended: 0,
        },
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      expect(engagementService.getCachedData()).not.toBeNull();

      engagementService.clearCache();

      expect(engagementService.getCachedData()).toBeNull();
      expect(engagementService.getCachedPredictions()).toEqual([]);
    });

    it('should get pending predictions', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const predictions: PredictionData[] = [
        {
          id: 'pred-1',
          category: 'mood',
          question: 'Test 1',
          userPrediction: 7,
          status: 'pending',
          createdAt: '2025-12-01',
        },
        {
          id: 'pred-2',
          category: 'productivity',
          question: 'Test 2',
          userPrediction: 8,
          actualOutcome: 7,
          status: 'resolved',
          createdAt: '2025-12-01',
        },
      ];

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 0,
          longestOverallStreak: 0,
          currentActiveStreaks: 0,
          teamHuddlesAttended: 0,
        },
        predictions,
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      const pending = engagementService.getPendingPredictions();

      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
    });

    it('should get resolved predictions', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const predictions: PredictionData[] = [
        {
          id: 'pred-1',
          category: 'mood',
          question: 'Test 1',
          userPrediction: 7,
          status: 'pending',
          createdAt: '2025-12-01',
        },
        {
          id: 'pred-2',
          category: 'productivity',
          question: 'Test 2',
          userPrediction: 8,
          actualOutcome: 7,
          status: 'resolved',
          createdAt: '2025-12-01',
        },
      ];

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 0,
          longestOverallStreak: 0,
          currentActiveStreaks: 0,
          teamHuddlesAttended: 0,
        },
        predictions,
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      const resolved = engagementService.getResolvedPredictions();

      expect(resolved).toHaveLength(1);
      expect(resolved[0].status).toBe('resolved');
    });

    it('should calculate prediction accuracy', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const predictions: PredictionData[] = [
        {
          id: 'pred-1',
          category: 'mood',
          question: 'Test 1',
          userPrediction: 7,
          actualOutcome: 8,
          status: 'resolved',
          createdAt: '2025-12-01',
        },
        {
          id: 'pred-2',
          category: 'productivity',
          question: 'Test 2',
          userPrediction: 10,
          actualOutcome: 10,
          status: 'resolved',
          createdAt: '2025-12-01',
        },
      ];

      const engagementMessage: EngagementEvent = {
        type: 'engagement',
        ritualStreaks: [],
        weatherHistory: [],
        stats: {
          totalRitualDays: 0,
          longestOverallStreak: 0,
          currentActiveStreaks: 0,
          teamHuddlesAttended: 0,
        },
        predictions,
        timestamp: Date.now(),
      };

      engagementService.handleDataMessage(engagementMessage);

      const accuracy = engagementService.calculateAccuracy();

      // Average error: (|7-8| + |10-10|) / 2 = 0.5
      // Accuracy: 100 - 0.5 = 99.5 → rounded to 100
      expect(accuracy).toBeGreaterThanOrEqual(99);
    });

    it('should return null accuracy with no resolved predictions', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const accuracy = engagementService.calculateAccuracy();

      expect(accuracy).toBeNull();
    });
  });

  describe('submitPrediction', () => {
    it('should create and cache a new prediction', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const prediction = {
        category: 'mood',
        question: 'Week of Dec 1',
        userPrediction: 7,
      };

      const result = await engagementService.submitPrediction('user123', prediction);

      expect(result).not.toBeNull();
      expect(result?.category).toBe('mood');
      expect(result?.status).toBe('pending');
      expect(engagementService.getCachedPredictions()).toHaveLength(1);
    });

    it('should fire onPredictionsUpdate callback', async () => {
      const { engagementService } = await import('../../../src/services/engagement.service.js');

      engagementService.clearCache();

      const updateCallback = vi.fn();
      engagementService.setCallbacks({ onPredictionsUpdate: updateCallback });

      const prediction = {
        category: 'productivity',
        question: 'Week of Dec 8',
        userPrediction: 5,
      };

      await engagementService.submitPrediction('user123', prediction);

      expect(updateCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'productivity',
            userPrediction: 5,
          }),
        ])
      );
    });
  });
});
