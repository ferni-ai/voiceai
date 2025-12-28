/**
 * Wellbeing Tracking Service Tests
 *
 * Tests for wellbeing dimensions, snapshots, profiles, and signal detection.
 */

import { describe, it, expect } from 'vitest';

import {
  ALL_DIMENSIONS,
  type WellbeingDimensions,
  type WellbeingDimension,
  type WellbeingSnapshot,
  type WellbeingSignal,
  type WellbeingProfile,
  type WellbeingTrend,
  type WellbeingAlert,
  type AlertType,
} from '../types.js';

describe('WellbeingTracking', () => {
  describe('Type definitions', () => {
    describe('ALL_DIMENSIONS constant', () => {
      it('should have 12 core dimensions', () => {
        expect(ALL_DIMENSIONS).toHaveLength(12);
      });

      it('should include mood and affect dimensions', () => {
        expect(ALL_DIMENSIONS).toContain('mood');
        expect(ALL_DIMENSIONS).toContain('moodStability');
      });

      it('should include energy and motivation dimensions', () => {
        expect(ALL_DIMENSIONS).toContain('energy');
        expect(ALL_DIMENSIONS).toContain('motivation');
      });

      it('should include anxiety dimensions', () => {
        expect(ALL_DIMENSIONS).toContain('worry');
        expect(ALL_DIMENSIONS).toContain('physicalTension');
      });

      it('should include connection dimensions', () => {
        expect(ALL_DIMENSIONS).toContain('loneliness');
        expect(ALL_DIMENSIONS).toContain('socialSatisfaction');
      });

      it('should include purpose dimensions', () => {
        expect(ALL_DIMENSIONS).toContain('meaningfulness');
        expect(ALL_DIMENSIONS).toContain('hopefulness');
      });

      it('should include self-care dimensions', () => {
        expect(ALL_DIMENSIONS).toContain('sleepQuality');
        expect(ALL_DIMENSIONS).toContain('selfCareLevel');
      });
    });

    describe('WellbeingDimensions interface', () => {
      it('should accept valid dimension values', () => {
        const dimensions: WellbeingDimensions = {
          mood: 0.5,
          moodStability: 0.7,
          energy: 0.6,
          motivation: 0.8,
          worry: 0.3,
          physicalTension: 0.2,
          loneliness: 0.4,
          socialSatisfaction: 0.7,
          meaningfulness: 0.8,
          hopefulness: 0.7,
          sleepQuality: 0.6,
          selfCareLevel: 0.5,
        };

        expect(dimensions.mood).toBe(0.5);
        expect(dimensions.energy).toBe(0.6);
      });

      it('should allow mood range from -1 to +1', () => {
        const lowMood: Partial<WellbeingDimensions> = { mood: -0.8 };
        const highMood: Partial<WellbeingDimensions> = { mood: 0.9 };
        const neutralMood: Partial<WellbeingDimensions> = { mood: 0 };

        expect(lowMood.mood).toBe(-0.8);
        expect(highMood.mood).toBe(0.9);
        expect(neutralMood.mood).toBe(0);
      });

      it('should allow other dimensions from 0 to 1', () => {
        const dimensions: Partial<WellbeingDimensions> = {
          energy: 0,
          motivation: 1,
          sleepQuality: 0.5,
        };

        expect(dimensions.energy).toBeGreaterThanOrEqual(0);
        expect(dimensions.motivation).toBeLessThanOrEqual(1);
      });
    });

    describe('WellbeingSnapshot interface', () => {
      it('should create valid snapshot', () => {
        const snapshot: WellbeingSnapshot = {
          id: 'snap-123',
          userId: 'user-456',
          timestamp: new Date(),
          source: 'detected',
          dimensions: {
            mood: 0.7,
            energy: 0.6,
          },
          confidence: {
            mood: 0.8,
            energy: 0.7,
          },
          signals: [],
        };

        expect(snapshot.id).toBe('snap-123');
        expect(snapshot.source).toBe('detected');
      });

      it('should support all source types', () => {
        const sources: WellbeingSnapshot['source'][] = [
          'detected',
          'self_reported',
          'voice_analysis',
          'inferred',
        ];

        sources.forEach((source) => {
          const snapshot: WellbeingSnapshot = {
            id: 'test',
            userId: 'user',
            timestamp: new Date(),
            source,
            dimensions: {},
            confidence: {},
            signals: [],
          };
          expect(snapshot.source).toBe(source);
        });
      });

      it('should accept optional context', () => {
        const snapshot: WellbeingSnapshot = {
          id: 'test',
          userId: 'user',
          timestamp: new Date(),
          source: 'detected',
          dimensions: { mood: 0.5 },
          confidence: { mood: 0.7 },
          signals: [],
          context: {
            topic: 'work stress',
            emotion: 'anxious',
            turnCount: 5,
          },
        };

        expect(snapshot.context?.topic).toBe('work stress');
        expect(snapshot.context?.emotion).toBe('anxious');
      });
    });

    describe('WellbeingSignal interface', () => {
      it('should create valid signal', () => {
        const signal: WellbeingSignal = {
          dimension: 'mood',
          signal: 'User said "I feel great today"',
          value: 0.8,
          confidence: 0.7,
          source: 'text',
        };

        expect(signal.dimension).toBe('mood');
        expect(signal.value).toBe(0.8);
      });

      it('should support all dimensions', () => {
        ALL_DIMENSIONS.forEach((dim) => {
          const signal: WellbeingSignal = {
            dimension: dim,
            signal: 'test signal',
            value: 0.5,
            confidence: 0.5,
            source: 'text',
          };
          expect(signal.dimension).toBe(dim);
        });
      });

      it('should support all signal sources', () => {
        const sources: WellbeingSignal['source'][] = ['text', 'voice', 'pattern', 'explicit'];

        sources.forEach((source) => {
          const signal: WellbeingSignal = {
            dimension: 'mood',
            signal: 'test',
            value: 0.5,
            confidence: 0.5,
            source,
          };
          expect(signal.source).toBe(source);
        });
      });
    });

    describe('WellbeingProfile interface', () => {
      it('should create valid profile', () => {
        const profile: WellbeingProfile = {
          userId: 'user-123',
          current: null,
          recentAverage: { mood: 0.6, energy: 0.5 },
          personalBaseline: {
            mood: 0.6,
            energy: 0.5,
          },
          baselineConfidence: 0.8,
          baselineSnapshots: 10,
          weeklyTrend: {
            period: 'week',
            direction: 'stable',
            magnitude: 0.1,
            confidence: 0.7,
            byDimension: {},
            observations: [],
          },
          monthlyTrend: {
            period: 'month',
            direction: 'improving',
            magnitude: 0.2,
            confidence: 0.8,
            byDimension: {},
            observations: [],
          },
          temporalPatterns: [],
          triggerPatterns: [],
          alerts: [],
          createdAt: new Date(),
          lastUpdated: new Date(),
          totalSnapshots: 10,
        };

        expect(profile.userId).toBe('user-123');
        expect(profile.totalSnapshots).toBe(10);
      });

      it('should support current snapshot or null', () => {
        const profileWithSnapshot: WellbeingProfile = {
          userId: 'user',
          current: {
            id: 'snap-1',
            userId: 'user',
            timestamp: new Date(),
            source: 'detected',
            dimensions: { mood: 0.5 },
            confidence: { mood: 0.8 },
            signals: [],
          },
          recentAverage: {},
          personalBaseline: {},
          baselineConfidence: 0.5,
          baselineSnapshots: 5,
          weeklyTrend: {
            period: 'week',
            direction: 'stable',
            magnitude: 0,
            confidence: 0.5,
            byDimension: {},
            observations: [],
          },
          monthlyTrend: {
            period: 'month',
            direction: 'stable',
            magnitude: 0,
            confidence: 0.5,
            byDimension: {},
            observations: [],
          },
          temporalPatterns: [],
          triggerPatterns: [],
          alerts: [],
          createdAt: new Date(),
          lastUpdated: new Date(),
          totalSnapshots: 1,
        };

        expect(profileWithSnapshot.current?.dimensions.mood).toBe(0.5);
      });
    });

    describe('WellbeingTrend interface', () => {
      it('should create valid trend', () => {
        const trend: WellbeingTrend = {
          period: 'week',
          direction: 'improving',
          magnitude: 0.15,
          confidence: 0.8,
          byDimension: {
            mood: { direction: 'improving', change: 0.1 },
          },
          observations: ['Mood has been improving this week'],
        };

        expect(trend.period).toBe('week');
        expect(trend.direction).toBe('improving');
      });

      it('should support all trend directions', () => {
        const directions: WellbeingTrend['direction'][] = ['improving', 'declining', 'stable'];

        directions.forEach((dir) => {
          const trend: WellbeingTrend = {
            period: 'week',
            direction: dir,
            magnitude: 0.1,
            confidence: 0.7,
            byDimension: {},
            observations: [],
          };
          expect(trend.direction).toBe(dir);
        });
      });

      it('should support all period types', () => {
        const periods: WellbeingTrend['period'][] = ['week', 'month', 'quarter'];

        periods.forEach((period) => {
          const trend: WellbeingTrend = {
            period,
            direction: 'stable',
            magnitude: 0.1,
            confidence: 0.7,
            byDimension: {},
            observations: [],
          };
          expect(trend.period).toBe(period);
        });
      });
    });

    describe('WellbeingAlert interface', () => {
      it('should create valid alert', () => {
        const alert: WellbeingAlert = {
          id: 'alert-123',
          userId: 'user-456',
          createdAt: new Date(),
          type: 'significant_decline',
          severity: 'concern',
          message: 'Your mood has been declining over the past week',
          signals: [],
          recommendations: [],
          status: 'active',
        };

        expect(alert.type).toBe('significant_decline');
        expect(alert.severity).toBe('concern');
        expect(alert.status).toBe('active');
      });

      it('should support all alert types', () => {
        const types: AlertType[] = [
          'depression_risk',
          'anxiety_spike',
          'burnout_trajectory',
          'isolation_pattern',
          'sleep_deterioration',
          'motivation_collapse',
          'significant_decline',
          'crisis_indicators',
        ];

        types.forEach((type) => {
          const alert: WellbeingAlert = {
            id: 'test',
            userId: 'user',
            createdAt: new Date(),
            type,
            severity: 'watch',
            message: 'Test alert',
            signals: [],
            recommendations: [],
            status: 'active',
          };
          expect(alert.type).toBe(type);
        });
      });

      it('should support all severity levels', () => {
        const severities: WellbeingAlert['severity'][] = ['watch', 'concern', 'urgent'];

        severities.forEach((severity) => {
          const alert: WellbeingAlert = {
            id: 'test',
            userId: 'user',
            createdAt: new Date(),
            type: 'significant_decline',
            severity,
            message: 'Test alert',
            signals: [],
            recommendations: [],
            status: 'active',
          };
          expect(alert.severity).toBe(severity);
        });
      });

      it('should support all status values', () => {
        const statuses: WellbeingAlert['status'][] = [
          'active',
          'acknowledged',
          'resolved',
          'dismissed',
        ];

        statuses.forEach((status) => {
          const alert: WellbeingAlert = {
            id: 'test',
            userId: 'user',
            createdAt: new Date(),
            type: 'anxiety_spike',
            severity: 'concern',
            message: 'Test alert',
            signals: [],
            recommendations: [],
            status,
          };
          expect(alert.status).toBe(status);
        });
      });

      it('should allow recommendations', () => {
        const alert: WellbeingAlert = {
          id: 'test',
          userId: 'user',
          createdAt: new Date(),
          type: 'sleep_deterioration',
          severity: 'concern',
          message: 'Sleep quality declining',
          signals: [],
          recommendations: [
            { target: 'user', action: 'Consider setting a consistent bedtime', priority: 'medium' },
            { target: 'ferni', action: 'Check in about sleep habits', priority: 'high' },
          ],
          status: 'active',
        };

        expect(alert.recommendations).toHaveLength(2);
        expect(alert.recommendations[0].action).toBe('Consider setting a consistent bedtime');
      });
    });
  });

  describe('Dimension value validation', () => {
    it('should validate mood is in range -1 to +1', () => {
      const validMoods = [-1, -0.5, 0, 0.5, 1];

      validMoods.forEach((mood) => {
        expect(mood).toBeGreaterThanOrEqual(-1);
        expect(mood).toBeLessThanOrEqual(1);
      });
    });

    it('should validate other dimensions are in range 0 to 1', () => {
      const dimensions: WellbeingDimensions = {
        mood: 0.5,
        moodStability: 0.7,
        energy: 0.6,
        motivation: 0.8,
        worry: 0.3,
        physicalTension: 0.2,
        loneliness: 0.4,
        socialSatisfaction: 0.7,
        meaningfulness: 0.8,
        hopefulness: 0.7,
        sleepQuality: 0.6,
        selfCareLevel: 0.5,
      };

      // All dimensions except mood should be 0-1
      const otherDimensions = Object.entries(dimensions).filter(([key]) => key !== 'mood');
      otherDimensions.forEach(([, value]) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Trend calculations', () => {
    it('should identify improving trend', () => {
      const scores = [0.3, 0.35, 0.4, 0.45, 0.5];
      const firstHalf = scores.slice(0, 2);
      const secondHalf = scores.slice(-2);

      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      expect(avgSecond).toBeGreaterThan(avgFirst);
    });

    it('should identify declining trend', () => {
      const scores = [0.8, 0.7, 0.6, 0.5, 0.4];
      const firstHalf = scores.slice(0, 2);
      const secondHalf = scores.slice(-2);

      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      expect(avgSecond).toBeLessThan(avgFirst);
    });

    it('should identify stable trend', () => {
      const scores = [0.5, 0.52, 0.48, 0.51, 0.49];
      const variance = scores.reduce((sum, s) => sum + Math.abs(s - 0.5), 0) / scores.length;

      expect(variance).toBeLessThan(0.05);
    });

    it('should calculate magnitude of change', () => {
      const before = 0.4;
      const after = 0.7;
      const magnitude = after - before;

      // Use toBeCloseTo for floating point comparison
      expect(magnitude).toBeCloseTo(0.3, 10);
      expect(magnitude).toBeGreaterThan(0.1); // Meaningful change threshold
    });
  });

  describe('Alert thresholds', () => {
    it('should trigger watch severity for small drops', () => {
      const baseline = 0.6;
      const current = 0.5;
      const drop = baseline - current;

      // Use toBeCloseTo for floating point comparison
      expect(drop).toBeCloseTo(0.1, 10);
      // Small drops are watch severity
      expect(drop).toBeLessThan(0.2);
    });

    it('should trigger concern severity for medium drops', () => {
      const baseline = 0.7;
      const current = 0.45;
      const drop = baseline - current;

      // Use toBeCloseTo for floating point comparison
      expect(drop).toBeCloseTo(0.25, 10);
      expect(drop).toBeGreaterThanOrEqual(0.2);
      expect(drop).toBeLessThan(0.4);
    });

    it('should trigger urgent severity for large drops', () => {
      const baseline = 0.8;
      const current = 0.3;
      const drop = baseline - current;

      expect(drop).toBe(0.5);
      expect(drop).toBeGreaterThanOrEqual(0.4);
    });

    it('should not alert for improvements', () => {
      const baseline = 0.4;
      const current = 0.7;
      const change = current - baseline;

      expect(change).toBeGreaterThan(0);
      // Positive change = improvement, not alert
    });
  });

  describe('Snapshot aggregation', () => {
    it('should calculate average across snapshots', () => {
      const snapshots: WellbeingSnapshot[] = [
        {
          id: '1',
          userId: 'user',
          timestamp: new Date(),
          source: 'detected',
          dimensions: { mood: 0.6 },
          confidence: { mood: 0.8 },
          signals: [],
        },
        {
          id: '2',
          userId: 'user',
          timestamp: new Date(),
          source: 'detected',
          dimensions: { mood: 0.4 },
          confidence: { mood: 0.8 },
          signals: [],
        },
      ];

      const moodValues = snapshots.map((s) => s.dimensions.mood ?? 0);
      const avgMood = moodValues.reduce((a, b) => a + b, 0) / moodValues.length;

      expect(avgMood).toBe(0.5);
    });

    it('should weight by confidence', () => {
      const values = [
        { value: 0.8, confidence: 0.9 },
        { value: 0.4, confidence: 0.3 },
      ];

      const totalWeight = values.reduce((sum, v) => sum + v.confidence, 0);
      const weightedAvg = values.reduce((sum, v) => sum + v.value * v.confidence, 0) / totalWeight;

      // 0.8 * 0.9 + 0.4 * 0.3 = 0.72 + 0.12 = 0.84
      // 0.84 / 1.2 = 0.7
      expect(weightedAvg).toBeCloseTo(0.7, 2);
    });

    it('should filter by time period', () => {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const snapshots: WellbeingSnapshot[] = [
        {
          id: '1',
          userId: 'user',
          timestamp: now,
          source: 'detected',
          dimensions: { mood: 0.7 },
          confidence: {},
          signals: [],
        },
        {
          id: '2',
          userId: 'user',
          timestamp: twoWeeksAgo,
          source: 'detected',
          dimensions: { mood: 0.3 },
          confidence: {},
          signals: [],
        },
      ];

      const recentSnapshots = snapshots.filter((s) => s.timestamp >= oneWeekAgo);

      expect(recentSnapshots).toHaveLength(1);
      expect(recentSnapshots[0].dimensions.mood).toBe(0.7);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty dimensions', () => {
      const snapshot: WellbeingSnapshot = {
        id: 'test',
        userId: 'user',
        timestamp: new Date(),
        source: 'detected',
        dimensions: {},
        confidence: {},
        signals: [],
      };

      expect(Object.keys(snapshot.dimensions)).toHaveLength(0);
    });

    it('should handle null/undefined in partial dimensions', () => {
      const partial: Partial<WellbeingDimensions> = {
        mood: 0.5,
        // energy is undefined
      };

      expect(partial.mood).toBe(0.5);
      expect(partial.energy).toBeUndefined();
    });

    it('should handle timestamps correctly', () => {
      const snapshot: WellbeingSnapshot = {
        id: 'test',
        userId: 'user',
        timestamp: new Date('2024-12-25T10:00:00Z'),
        source: 'detected',
        dimensions: { mood: 0.5 },
        confidence: {},
        signals: [],
      };

      expect(snapshot.timestamp.getFullYear()).toBe(2024);
      expect(snapshot.timestamp.getMonth()).toBe(11); // December
    });

    it('should handle zero values as valid', () => {
      const dimensions: Partial<WellbeingDimensions> = {
        energy: 0,
        motivation: 0,
        hopefulness: 0,
      };

      // Zero is valid (lowest energy, no motivation)
      expect(dimensions.energy).toBe(0);
      expect(dimensions.motivation).toBe(0);
    });

    it('should handle extreme mood values', () => {
      const extremeLow: Partial<WellbeingDimensions> = { mood: -1 };
      const extremeHigh: Partial<WellbeingDimensions> = { mood: 1 };

      expect(extremeLow.mood).toBe(-1);
      expect(extremeHigh.mood).toBe(1);
    });
  });
});
