/**
 * Temporal Pattern Detector Tests
 *
 * Phase 3: Temporal Intelligence
 *
 * Tests for detecting day-of-week, time-of-day, and date proximity patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDayOfWeek,
  getTimeOfDayBucket,
  daysUntilRecurringDate,
  daysSinceRecurringDate,
  createTriggerFiringEvent,
  recordFiringEvent,
  analyzeDayOfWeekPatterns,
  analyzeTimeOfDayPatterns,
  analyzeRecurringDatePatterns,
  analyzeTemporalPatterns,
  calculateTemporalBoost,
  DEFAULT_TEMPORAL_CONFIG,
  // Analytics
  recordTemporalBoost,
  recordFiringEventAnalytics,
  getTemporalAnalytics,
  resetTemporalAnalytics,
  type TemporalBoostResult,
} from '../temporal-pattern-detector.js';
import type {
  TriggerFiringEvent,
  SignificantDate,
  UserTriggerProfile,
} from '../user-trigger-profile.types.js';
import {
  DEFAULT_USER_TRIGGER_PROFILE,
  DEFAULT_TEMPORAL_INTELLIGENCE,
} from '../user-trigger-profile.types.js';

describe('Temporal Pattern Detector', () => {
  describe('Helper Functions', () => {
    describe('getDayOfWeek', () => {
      it('should return correct day of week', () => {
        // Use local time to avoid timezone issues
        // January 6, 2025 is a Monday
        expect(getDayOfWeek(new Date(2025, 0, 6, 12, 0, 0))).toBe('monday');
        // January 7, 2025 is a Tuesday
        expect(getDayOfWeek(new Date(2025, 0, 7, 12, 0, 0))).toBe('tuesday');
        // January 11, 2025 is a Saturday
        expect(getDayOfWeek(new Date(2025, 0, 11, 12, 0, 0))).toBe('saturday');
        // January 12, 2025 is a Sunday
        expect(getDayOfWeek(new Date(2025, 0, 12, 12, 0, 0))).toBe('sunday');
      });
    });

    describe('getTimeOfDayBucket', () => {
      it('should return late_night for 12am-5am', () => {
        expect(getTimeOfDayBucket(0)).toBe('late_night');
        expect(getTimeOfDayBucket(2)).toBe('late_night');
        expect(getTimeOfDayBucket(4)).toBe('late_night');
      });

      it('should return early_morning for 5am-8am', () => {
        expect(getTimeOfDayBucket(5)).toBe('early_morning');
        expect(getTimeOfDayBucket(7)).toBe('early_morning');
      });

      it('should return morning for 8am-12pm', () => {
        expect(getTimeOfDayBucket(8)).toBe('morning');
        expect(getTimeOfDayBucket(11)).toBe('morning');
      });

      it('should return afternoon for 12pm-5pm', () => {
        expect(getTimeOfDayBucket(12)).toBe('afternoon');
        expect(getTimeOfDayBucket(16)).toBe('afternoon');
      });

      it('should return evening for 5pm-9pm', () => {
        expect(getTimeOfDayBucket(17)).toBe('evening');
        expect(getTimeOfDayBucket(20)).toBe('evening');
      });

      it('should return night for 9pm-12am', () => {
        expect(getTimeOfDayBucket(21)).toBe('night');
        expect(getTimeOfDayBucket(23)).toBe('night');
      });
    });

    describe('daysUntilRecurringDate', () => {
      it('should calculate days until upcoming date', () => {
        const date: SignificantDate = {
          id: 'test_1',
          date: 'YYYY-01-15', // January 15
          type: 'birthday',
          description: 'Test birthday',
          isRecurring: true,
          emotionalWeight: 0.7,
          triggerCategories: ['celebration'],
          extractedAt: new Date(),
          confidence: 0.9,
          source: 'explicit',
        };

        // From January 10, 2025 should be 5 days until January 15
        // Use local time constructor to avoid UTC timezone issues
        const fromDate = new Date(2025, 0, 10, 12, 0, 0);
        expect(daysUntilRecurringDate(date, fromDate)).toBe(5);
      });

      it('should wrap to next year if date passed', () => {
        const date: SignificantDate = {
          id: 'test_2',
          date: 'YYYY-01-01', // January 1
          type: 'anniversary',
          description: 'Test anniversary',
          isRecurring: true,
          emotionalWeight: 0.8,
          triggerCategories: ['celebration'],
          extractedAt: new Date(),
          confidence: 0.9,
          source: 'explicit',
        };

        // From December 15, 2025 should be 17 days until January 1, 2026
        // Use local time constructor to avoid UTC timezone issues
        const fromDate = new Date(2025, 11, 15, 12, 0, 0);
        expect(daysUntilRecurringDate(date, fromDate)).toBe(17);
      });

      it('should return 0 for today', () => {
        const today = new Date();
        const date: SignificantDate = {
          id: 'test_3',
          date: `YYYY-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
          type: 'birthday',
          description: 'Today',
          isRecurring: true,
          emotionalWeight: 0.7,
          triggerCategories: [],
          extractedAt: new Date(),
          confidence: 0.9,
          source: 'explicit',
        };

        expect(daysUntilRecurringDate(date, today)).toBe(0);
      });
    });

    describe('daysSinceRecurringDate', () => {
      it('should calculate days since past date', () => {
        const date: SignificantDate = {
          id: 'test_4',
          date: 'YYYY-01-01', // January 1
          type: 'anniversary',
          description: 'Test',
          isRecurring: true,
          emotionalWeight: 0.7,
          triggerCategories: [],
          extractedAt: new Date(),
          confidence: 0.9,
          source: 'explicit',
        };

        // From January 10, 2025 should be 9 days since January 1
        // Use local time constructor to avoid UTC timezone issues
        const fromDate = new Date(2025, 0, 10, 12, 0, 0);
        expect(daysSinceRecurringDate(date, fromDate)).toBe(9);
      });
    });
  });

  describe('Event Recording', () => {
    describe('createTriggerFiringEvent', () => {
      it('should create event with correct time fields', () => {
        const event = createTriggerFiringEvent('test_trigger', 'emotional', 'engaged');

        expect(event.triggerName).toBe('test_trigger');
        expect(event.triggerCategory).toBe('emotional');
        expect(event.outcome).toBe('engaged');
        expect(event.timestamp).toBeInstanceOf(Date);
        expect([
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ]).toContain(event.dayOfWeek);
        expect([
          'late_night',
          'early_morning',
          'morning',
          'afternoon',
          'evening',
          'night',
        ]).toContain(event.timeOfDay);
        expect(event.hour).toBeGreaterThanOrEqual(0);
        expect(event.hour).toBeLessThanOrEqual(23);
      });

      it('should detect date proximity when significant dates provided', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const significantDates: SignificantDate[] = [
          {
            id: 'upcoming_bday',
            date: `YYYY-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`,
            type: 'birthday',
            description: "Mom's birthday",
            isRecurring: true,
            emotionalWeight: 0.8,
            triggerCategories: ['celebration'],
            extractedAt: new Date(),
            confidence: 0.9,
            source: 'explicit',
          },
        ];

        const event = createTriggerFiringEvent(
          'celebration_prompt',
          'emotional',
          'engaged',
          'session_1',
          significantDates
        );

        expect(event.dateProximity).toBeDefined();
        expect(event.dateProximity?.dateId).toBe('upcoming_bday');
        expect(event.dateProximity?.daysAway).toBe(1);
        expect(event.dateProximity?.dateType).toBe('birthday');
      });
    });

    describe('recordFiringEvent', () => {
      it('should add event to profile', () => {
        const profile: UserTriggerProfile = {
          ...DEFAULT_USER_TRIGGER_PROFILE,
          userId: 'test_user',
          temporalIntelligence: { ...DEFAULT_TEMPORAL_INTELLIGENCE },
        };

        const event = createTriggerFiringEvent('test_trigger', 'emotional');
        const updated = recordFiringEvent(profile, event);

        expect(updated.temporalIntelligence?.recentFirings).toHaveLength(1);
        expect(updated.temporalIntelligence?.recentFirings[0].triggerName).toBe('test_trigger');
      });

      it('should prune old events beyond retention period', () => {
        const profile: UserTriggerProfile = {
          ...DEFAULT_USER_TRIGGER_PROFILE,
          userId: 'test_user',
          temporalIntelligence: {
            ...DEFAULT_TEMPORAL_INTELLIGENCE,
            recentFirings: [
              {
                timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
                triggerName: 'old_trigger',
                triggerCategory: 'emotional',
                outcome: 'engaged',
                dayOfWeek: 'monday',
                timeOfDay: 'morning',
                hour: 9,
              },
            ],
          },
        };

        const event = createTriggerFiringEvent('new_trigger', 'emotional');
        const updated = recordFiringEvent(profile, event, {
          ...DEFAULT_TEMPORAL_CONFIG,
          retentionDays: 90,
        });

        // Old event should be pruned
        expect(updated.temporalIntelligence?.recentFirings).toHaveLength(1);
        expect(updated.temporalIntelligence?.recentFirings[0].triggerName).toBe('new_trigger');
      });
    });
  });

  describe('Pattern Analysis', () => {
    const generateEvents = (
      count: number,
      overrides: Partial<TriggerFiringEvent> = {}
    ): TriggerFiringEvent[] => {
      return Array.from({ length: count }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        triggerName: `trigger_${i % 3}`,
        triggerCategory: i % 2 === 0 ? 'emotional' : 'behavioral',
        outcome: i % 3 === 0 ? 'engaged' : 'deflected',
        dayOfWeek: (
          ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
        )[i % 7],
        timeOfDay: (
          ['morning', 'afternoon', 'evening', 'night', 'late_night', 'early_morning'] as const
        )[i % 6],
        hour: (9 + i) % 24,
        ...overrides,
      }));
    };

    describe('analyzeDayOfWeekPatterns', () => {
      it('should return empty array for insufficient data', () => {
        const events: TriggerFiringEvent[] = generateEvents(3);
        const patterns = analyzeDayOfWeekPatterns(events);
        expect(patterns).toHaveLength(0);
      });

      it('should detect patterns with sufficient data', () => {
        // Generate 50 events heavily skewed toward Monday
        const events: TriggerFiringEvent[] = [
          ...generateEvents(30, { dayOfWeek: 'monday', triggerCategory: 'emotional' }),
          ...generateEvents(5, { dayOfWeek: 'tuesday' }),
          ...generateEvents(5, { dayOfWeek: 'wednesday' }),
          ...generateEvents(5, { dayOfWeek: 'thursday' }),
          ...generateEvents(5, { dayOfWeek: 'friday' }),
        ];

        const patterns = analyzeDayOfWeekPatterns(events);

        expect(patterns.length).toBeGreaterThan(0);
        const mondayPattern = patterns.find((p) => p.day === 'monday');
        expect(mondayPattern).toBeDefined();
        expect(mondayPattern?.intensityMultiplier).toBeGreaterThan(1.0);
      });

      it('should identify effective triggers on specific days', () => {
        // Generate events where trigger_1 always works on Sunday
        const events: TriggerFiringEvent[] = [
          ...Array.from({ length: 10 }, () => ({
            timestamp: new Date(),
            triggerName: 'trigger_1',
            triggerCategory: 'emotional',
            outcome: 'engaged' as const,
            dayOfWeek: 'sunday' as const,
            timeOfDay: 'evening' as const,
            hour: 19,
          })),
          ...Array.from({ length: 10 }, () => ({
            timestamp: new Date(),
            triggerName: 'trigger_2',
            triggerCategory: 'emotional',
            outcome: 'deflected' as const,
            dayOfWeek: 'sunday' as const,
            timeOfDay: 'evening' as const,
            hour: 19,
          })),
        ];

        const patterns = analyzeDayOfWeekPatterns(events);
        const sundayPattern = patterns.find((p) => p.day === 'sunday');

        expect(sundayPattern?.effectiveTriggers).toContain('trigger_1');
        expect(sundayPattern?.triggersToAvoid).toContain('trigger_2');
      });
    });

    describe('analyzeTimeOfDayPatterns', () => {
      it('should detect late night patterns', () => {
        // Generate events skewed toward late night
        const events: TriggerFiringEvent[] = [
          ...generateEvents(30, { timeOfDay: 'late_night', triggerCategory: 'emotional' }),
          ...generateEvents(10, { timeOfDay: 'morning' }),
        ];

        const patterns = analyzeTimeOfDayPatterns(events);

        const lateNightPattern = patterns.find((p) => p.timeBucket === 'late_night');
        expect(lateNightPattern).toBeDefined();
        expect(lateNightPattern?.intensityMultiplier).toBeGreaterThan(1.0);
      });
    });

    describe('analyzeRecurringDatePatterns', () => {
      it('should detect patterns around significant dates', () => {
        const significantDates: SignificantDate[] = [
          {
            id: 'loss_anniversary',
            date: 'YYYY-06-15',
            type: 'loss',
            description: "Dad's passing",
            isRecurring: true,
            emotionalWeight: 0.95,
            triggerCategories: ['grief'],
            extractedAt: new Date(),
            confidence: 0.95,
            source: 'explicit',
          },
        ];

        // Generate events with date proximity to the loss anniversary
        const events: TriggerFiringEvent[] = Array.from({ length: 15 }, (_, i) => ({
          timestamp: new Date(),
          triggerName: 'grief_support',
          triggerCategory: 'emotional',
          outcome: 'engaged' as const,
          dayOfWeek: 'monday' as const,
          timeOfDay: 'evening' as const,
          hour: 20,
          dateProximity: {
            dateId: 'loss_anniversary',
            daysAway: 10 - i, // Approaching the date
            dateType: 'loss' as const,
          },
        }));

        const patterns = analyzeRecurringDatePatterns(events, significantDates);

        expect(patterns).toHaveLength(1);
        expect(patterns[0].dateId).toBe('loss_anniversary');
        expect(patterns[0].approachBehavior).toBe('increased_anxiety');
      });
    });
  });

  describe('Temporal Boost Calculation', () => {
    let baseProfile: UserTriggerProfile;

    beforeEach(() => {
      baseProfile = {
        ...DEFAULT_USER_TRIGGER_PROFILE,
        userId: 'test_user',
        significantDates: [],
        temporalIntelligence: {
          ...DEFAULT_TEMPORAL_INTELLIGENCE,
          overallConfidence: 0.7,
          dayPatterns: [
            {
              day: 'sunday',
              elevatedCategories: [
                { category: 'emotional', multiplier: 1.5, confidence: 0.8, observations: 20 },
              ],
              intensityMultiplier: 1.3,
              effectiveTriggers: ['gentle_check_in'],
              triggersToAvoid: ['productivity_push'],
            },
          ],
          timePatterns: [
            {
              timeBucket: 'late_night',
              elevatedCategories: [
                { category: 'existential', multiplier: 1.8, confidence: 0.7, observations: 15 },
              ],
              intensityMultiplier: 1.4,
              effectiveTriggers: ['presence_holding'],
              triggersToAvoid: ['action_prompt'],
              commonTopics: ['meaning', 'life', 'purpose'],
            },
          ],
          datePatterns: [],
          recentFirings: [],
          lastAnalyzedAt: new Date(),
          minObservationsForPattern: 5,
        },
      };
    });

    it('should return neutral boost for low confidence profile', () => {
      baseProfile.temporalIntelligence!.overallConfidence = 0.1;

      const boost = calculateTemporalBoost(baseProfile);

      expect(boost.overallMultiplier).toBe(1.0);
      expect(Object.keys(boost.categoryBoosts)).toHaveLength(0);
    });

    it('should apply day-of-week patterns', () => {
      // Create a Sunday date
      const sunday = new Date('2025-01-12T14:00:00'); // January 12, 2025 is a Sunday

      const boost = calculateTemporalBoost(baseProfile, sunday);

      expect(boost.overallMultiplier).toBeGreaterThan(1.0);
      expect(boost.categoryBoosts['emotional']).toBeDefined();
      expect(
        boost.triggerAdjustments.find((a) => a.triggerName === 'gentle_check_in')?.adjustment
      ).toBeGreaterThan(0);
      expect(
        boost.triggerAdjustments.find((a) => a.triggerName === 'productivity_push')?.adjustment
      ).toBeLessThan(0);
    });

    it('should apply time-of-day patterns', () => {
      // Create a late night time (2 AM)
      const lateNight = new Date();
      lateNight.setHours(2, 0, 0, 0);

      const boost = calculateTemporalBoost(baseProfile, lateNight);

      expect(boost.categoryBoosts['existential']).toBeDefined();
      expect(boost.contextNotes.some((n) => n.includes('meaning'))).toBe(true);
    });

    it('should detect significant date proximity', () => {
      // Add a birthday 3 days from now
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      baseProfile.significantDates = [
        {
          id: 'mom_bday',
          date: `YYYY-${String(threeDaysFromNow.getMonth() + 1).padStart(2, '0')}-${String(threeDaysFromNow.getDate()).padStart(2, '0')}`,
          type: 'birthday',
          description: "Mom's birthday",
          isRecurring: true,
          emotionalWeight: 0.8,
          triggerCategories: ['celebration'],
          extractedAt: new Date(),
          confidence: 0.9,
          source: 'explicit',
        },
      ];

      baseProfile.temporalIntelligence!.datePatterns = [
        {
          dateId: 'mom_bday',
          leadTimeDays: 7,
          trailTimeDays: 2,
          elevatedCategories: [{ category: 'celebration', multiplier: 1.5, confidence: 0.8 }],
          approachBehavior: 'increased_engagement',
        },
      ];

      const boost = calculateTemporalBoost(baseProfile);

      expect(boost.nearSignificantDate).toBeDefined();
      expect(boost.nearSignificantDate?.dateId).toBe('mom_bday');
      expect(boost.nearSignificantDate?.daysAway).toBe(3);
      expect(boost.contextNotes.some((n) => n.includes("Mom's birthday"))).toBe(true);
    });

    it('should cap overall multiplier', () => {
      // Add extreme patterns
      baseProfile.temporalIntelligence!.dayPatterns[0].intensityMultiplier = 3.0;
      baseProfile.temporalIntelligence!.timePatterns[0].intensityMultiplier = 3.0;

      const lateNightSunday = new Date('2025-01-12T02:00:00'); // Sunday at 2 AM

      const boost = calculateTemporalBoost(baseProfile, lateNightSunday);

      expect(boost.overallMultiplier).toBeLessThanOrEqual(2.0);
      expect(boost.overallMultiplier).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Full Analysis Pipeline', () => {
    it('should analyze all patterns and update profile', () => {
      const profile: UserTriggerProfile = {
        ...DEFAULT_USER_TRIGGER_PROFILE,
        userId: 'test_user',
        significantDates: [
          {
            id: 'loss_date',
            date: 'YYYY-06-15',
            type: 'loss',
            description: "Dad's passing",
            isRecurring: true,
            emotionalWeight: 0.95,
            triggerCategories: ['grief'],
            extractedAt: new Date(),
            confidence: 0.95,
            source: 'explicit',
          },
        ],
        temporalIntelligence: {
          ...DEFAULT_TEMPORAL_INTELLIGENCE,
          // Add 50 varied events
          recentFirings: Array.from({ length: 50 }, (_, i) => ({
            timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
            triggerName: `trigger_${i % 5}`,
            triggerCategory: ['emotional', 'behavioral', 'temporal'][i % 3],
            outcome: (['engaged', 'deflected', 'neutral'] as const)[i % 3],
            dayOfWeek: (
              [
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday',
                'saturday',
                'sunday',
              ] as const
            )[i % 7],
            timeOfDay: (
              ['morning', 'afternoon', 'evening', 'night', 'late_night', 'early_morning'] as const
            )[i % 6],
            hour: (9 + i) % 24,
          })),
        },
      };

      const analyzed = analyzeTemporalPatterns(profile);

      expect(analyzed.temporalIntelligence).toBeDefined();
      expect(analyzed.temporalIntelligence!.lastAnalyzedAt).toBeInstanceOf(Date);
      expect(analyzed.temporalIntelligence!.overallConfidence).toBeGreaterThan(0);
      expect(analyzed.temporalIntelligence!.dayPatterns.length).toBeGreaterThan(0);
      expect(analyzed.temporalIntelligence!.timePatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Temporal Analytics', () => {
    beforeEach(() => {
      // Reset analytics before each test
      resetTemporalAnalytics();
    });

    it('should record temporal boost calculations', () => {
      const result: TemporalBoostResult = {
        overallMultiplier: 1.5,
        categoryBoosts: { emotional: 1.3 },
        triggerAdjustments: [],
        contextNotes: [],
      };

      recordTemporalBoost(result, 'monday', 'morning', 10);
      recordTemporalBoost(result, 'tuesday', 'afternoon', 15);

      const stats = getTemporalAnalytics();
      expect(stats.totalBoostCalculations).toBe(2);
      expect(stats.averageMultiplier).toBe(1.5);
      expect(stats.byDayOfWeek.monday).toBe(1);
      expect(stats.byDayOfWeek.tuesday).toBe(1);
      expect(stats.byTimeOfDay.morning).toBe(1);
      expect(stats.byTimeOfDay.afternoon).toBe(1);
      expect(stats.averageProcessingMs).toBe(12.5);
    });

    it('should track near significant date boosts', () => {
      const result: TemporalBoostResult = {
        overallMultiplier: 1.3,
        categoryBoosts: {},
        triggerAdjustments: [],
        contextNotes: [],
        nearSignificantDate: {
          dateId: 'mom_bday',
          dateType: 'birthday',
          daysAway: 3,
          description: "Mom's birthday",
        },
      };

      recordTemporalBoost(result, 'sunday', 'evening', 5);

      const stats = getTemporalAnalytics();
      expect(stats.nearSignificantDateBoosts).toBe(1);
    });

    it('should record firing event analytics', () => {
      const event: TriggerFiringEvent = {
        timestamp: new Date(),
        triggerName: 'test_trigger',
        triggerCategory: 'emotional',
        outcome: 'engaged',
        dayOfWeek: 'monday',
        timeOfDay: 'morning',
        hour: 9,
      };

      recordFiringEventAnalytics(event);
      recordFiringEventAnalytics({ ...event, outcome: 'deflected' });
      recordFiringEventAnalytics({ ...event, outcome: 'engaged' });

      const stats = getTemporalAnalytics();
      expect(stats.totalFiringEvents).toBe(3);
      expect(stats.outcomeDistribution.engaged).toBe(2);
      expect(stats.outcomeDistribution.deflected).toBe(1);
      expect(stats.outcomeDistribution.neutral).toBe(0);
    });

    it('should provide array formats for day and time distributions', () => {
      const result: TemporalBoostResult = {
        overallMultiplier: 1.0,
        categoryBoosts: {},
        triggerAdjustments: [],
        contextNotes: [],
      };

      recordTemporalBoost(result, 'sunday', 'late_night', 5);
      recordTemporalBoost(result, 'sunday', 'late_night', 5);
      recordTemporalBoost(result, 'monday', 'morning', 5);

      const stats = getTemporalAnalytics();

      expect(stats.byDayOfWeekArray).toHaveLength(7);
      const sundayEntry = stats.byDayOfWeekArray.find((d) => d.day === 'sunday');
      expect(sundayEntry?.count).toBe(2);

      expect(stats.byTimeOfDayArray).toHaveLength(6);
      const lateNightEntry = stats.byTimeOfDayArray.find((t) => t.bucket === 'late_night');
      expect(lateNightEntry?.count).toBe(2);
    });

    it('should reset analytics', () => {
      const result: TemporalBoostResult = {
        overallMultiplier: 1.5,
        categoryBoosts: {},
        triggerAdjustments: [],
        contextNotes: [],
      };

      recordTemporalBoost(result, 'monday', 'morning', 10);

      let stats = getTemporalAnalytics();
      expect(stats.totalBoostCalculations).toBe(1);

      resetTemporalAnalytics();

      stats = getTemporalAnalytics();
      expect(stats.totalBoostCalculations).toBe(0);
      expect(stats.averageMultiplier).toBe(0);
      expect(stats.byDayOfWeek.monday).toBe(0);
    });
  });
});
