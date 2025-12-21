/**
 * Temporal Pattern Detector
 *
 * Phase 3: Temporal Intelligence
 *
 * Analyzes historical trigger firings to detect patterns:
 * - Sunday night anxiety
 * - Late night existential mode
 * - Anniversary approach behavior
 * - Seasonal variations
 *
 * "A good friend knows you get anxious on Sunday nights before big weeks.
 * Ferni should know that too."
 *
 * @module TemporalPatternDetector
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  DayOfWeek,
  TimeOfDayBucket,
  TriggerFiringEvent,
  DayOfWeekPattern,
  TimeOfDayPattern,
  RecurringDatePattern,
  TemporalIntelligence,
  SignificantDate,
  UserTriggerProfile,
} from './user-trigger-profile.types.js';
import { DEFAULT_TEMPORAL_INTELLIGENCE } from './user-trigger-profile.types.js';

const log = createLogger({ module: 'temporal-pattern-detector' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TemporalPatternConfig {
  /** Minimum observations before detecting a pattern */
  minObservations: number;
  /** Confidence threshold for including a pattern (0-1) */
  confidenceThreshold: number;
  /** How many days of firing events to keep */
  retentionDays: number;
  /** Minimum multiplier difference to consider a pattern significant */
  minMultiplierDifference: number;
  /** How many days before a date to start detecting approach patterns */
  dateApproachWindowDays: number;
  /** How many days after a date to detect trail patterns */
  dateTrailWindowDays: number;
}

export const DEFAULT_TEMPORAL_CONFIG: TemporalPatternConfig = {
  minObservations: 5,
  confidenceThreshold: 0.6,
  retentionDays: 90,
  minMultiplierDifference: 0.2, // 20% above average
  dateApproachWindowDays: 14,
  dateTrailWindowDays: 7,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get day of week from a date
 */
export function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

/**
 * Get time of day bucket from hour
 */
export function getTimeOfDayBucket(hour: number): TimeOfDayBucket {
  if (hour >= 0 && hour < 5) return 'late_night';
  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Calculate days until a recurring date (handles year wrap)
 */
export function daysUntilRecurringDate(date: SignificantDate, fromDate: Date = new Date()): number {
  // Parse the date string - format is YYYY-MM-DD
  const parts = date.date.split('-');
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  // Normalize fromDate to midnight to avoid time-of-day affecting the calculation
  const normalizedFrom = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const thisYear = normalizedFrom.getFullYear();

  // Try this year (also at midnight)
  let nextOccurrence = new Date(thisYear, month, day);

  // If already passed this year, use next year
  if (nextOccurrence < normalizedFrom) {
    nextOccurrence = new Date(thisYear + 1, month, day);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((nextOccurrence.getTime() - normalizedFrom.getTime()) / msPerDay);
}

/**
 * Calculate days since a recurring date last occurred
 */
export function daysSinceRecurringDate(date: SignificantDate, fromDate: Date = new Date()): number {
  const parts = date.date.split('-');
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  // Normalize fromDate to midnight to avoid time-of-day affecting the calculation
  const normalizedFrom = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const thisYear = normalizedFrom.getFullYear();

  // Try this year (also at midnight)
  let lastOccurrence = new Date(thisYear, month, day);

  // If not yet this year, use last year
  if (lastOccurrence > normalizedFrom) {
    lastOccurrence = new Date(thisYear - 1, month, day);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((normalizedFrom.getTime() - lastOccurrence.getTime()) / msPerDay);
}

/**
 * Calculate statistical confidence using simple frequentist approach
 */
function calculateConfidence(observed: number, total: number, expected: number): number {
  if (total < 3) return 0;

  // Simple binomial confidence
  // Compare observed frequency to expected frequency
  const observedRate = observed / total;
  const expectedRate = expected / total;

  // Use a simplified confidence based on sample size and deviation
  const deviation = Math.abs(observedRate - expectedRate);
  const sampleSizeBonus = Math.min(total / 20, 1); // Max out at 20 observations

  return Math.min(deviation * 2 + sampleSizeBonus * 0.5, 1);
}

// ============================================================================
// TRIGGER FIRING RECORDING
// ============================================================================

/**
 * Create a trigger firing event from current context
 */
export function createTriggerFiringEvent(
  triggerName: string,
  triggerCategory: string,
  outcome: 'engaged' | 'deflected' | 'neutral' | 'unknown' = 'unknown',
  sessionId?: string,
  significantDates?: SignificantDate[]
): TriggerFiringEvent {
  const now = new Date();
  const hour = now.getHours();

  // Find nearest significant date for proximity tracking
  let dateProximity: TriggerFiringEvent['dateProximity'] | undefined;

  if (significantDates && significantDates.length > 0) {
    let nearestDate: SignificantDate | undefined;
    let nearestDistance = Infinity;

    for (const date of significantDates) {
      if (date.isRecurring) {
        const daysUntil = daysUntilRecurringDate(date, now);
        const daysSince = daysSinceRecurringDate(date, now);
        const distance = Math.min(daysUntil, daysSince);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestDate = date;
        }
      }
    }

    if (nearestDate && nearestDistance <= 30) {
      const daysAway = daysUntilRecurringDate(nearestDate, now);
      dateProximity = {
        dateId: nearestDate.id,
        daysAway: daysAway <= 15 ? daysAway : -daysSinceRecurringDate(nearestDate, now),
        dateType: nearestDate.type,
      };
    }
  }

  return {
    timestamp: now,
    triggerName,
    triggerCategory,
    outcome,
    dayOfWeek: getDayOfWeek(now),
    timeOfDay: getTimeOfDayBucket(hour),
    hour,
    sessionId,
    dateProximity,
  };
}

/**
 * Add a firing event to the profile and prune old events
 */
export function recordFiringEvent(
  profile: UserTriggerProfile,
  event: TriggerFiringEvent,
  config: TemporalPatternConfig = DEFAULT_TEMPORAL_CONFIG
): UserTriggerProfile {
  const intelligence = profile.temporalIntelligence ?? { ...DEFAULT_TEMPORAL_INTELLIGENCE };

  // Add new event
  const recentFirings = [...intelligence.recentFirings, event];

  // Prune old events
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  const prunedFirings = recentFirings.filter((e) => e.timestamp >= cutoff);

  log.debug(
    { triggerName: event.triggerName, dayOfWeek: event.dayOfWeek, timeOfDay: event.timeOfDay, totalEvents: prunedFirings.length },
    'Recorded trigger firing event'
  );

  return {
    ...profile,
    temporalIntelligence: {
      ...intelligence,
      recentFirings: prunedFirings,
    },
  };
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze day-of-week patterns from firing events
 */
export function analyzeDayOfWeekPatterns(
  events: TriggerFiringEvent[],
  config: TemporalPatternConfig = DEFAULT_TEMPORAL_CONFIG
): DayOfWeekPattern[] {
  if (events.length < config.minObservations) return [];

  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const patterns: DayOfWeekPattern[] = [];

  // Group events by day
  const eventsByDay = new Map<DayOfWeek, TriggerFiringEvent[]>();
  for (const day of days) {
    eventsByDay.set(day, []);
  }
  for (const event of events) {
    eventsByDay.get(event.dayOfWeek)?.push(event);
  }

  // Calculate average events per day
  const avgEventsPerDay = events.length / 7;

  // Analyze each day
  for (const day of days) {
    const dayEvents = eventsByDay.get(day) || [];
    if (dayEvents.length === 0) continue;

    // Group by category
    const categoryCount = new Map<string, number>();
    const categoryOutcomes = new Map<string, { engaged: number; deflected: number; total: number }>();

    for (const event of dayEvents) {
      categoryCount.set(event.triggerCategory, (categoryCount.get(event.triggerCategory) || 0) + 1);

      const outcomes = categoryOutcomes.get(event.triggerCategory) || { engaged: 0, deflected: 0, total: 0 };
      outcomes.total++;
      if (event.outcome === 'engaged') outcomes.engaged++;
      if (event.outcome === 'deflected') outcomes.deflected++;
      categoryOutcomes.set(event.triggerCategory, outcomes);
    }

    // Calculate elevated categories
    const totalOnThisDay = dayEvents.length;
    const elevatedCategories: DayOfWeekPattern['elevatedCategories'] = [];

    for (const [category, count] of categoryCount) {
      // Calculate how this category compares to average
      const expectedOnThisDay = avgEventsPerDay * (count / events.length);
      const multiplier = count / Math.max(expectedOnThisDay, 1);

      if (multiplier >= 1 + config.minMultiplierDifference) {
        const confidence = calculateConfidence(count, totalOnThisDay, expectedOnThisDay);

        if (confidence >= config.confidenceThreshold) {
          elevatedCategories.push({
            category,
            multiplier: Math.round(multiplier * 100) / 100,
            confidence: Math.round(confidence * 100) / 100,
            observations: count,
          });
        }
      }
    }

    // Find effective and ineffective triggers
    const effectiveTriggers: string[] = [];
    const triggersToAvoid: string[] = [];

    const triggerOutcomes = new Map<string, { engaged: number; deflected: number }>();
    for (const event of dayEvents) {
      const outcomes = triggerOutcomes.get(event.triggerName) || { engaged: 0, deflected: 0 };
      if (event.outcome === 'engaged') outcomes.engaged++;
      if (event.outcome === 'deflected') outcomes.deflected++;
      triggerOutcomes.set(event.triggerName, outcomes);
    }

    for (const [trigger, outcomes] of triggerOutcomes) {
      const total = outcomes.engaged + outcomes.deflected;
      if (total >= 3) {
        const engagementRate = outcomes.engaged / total;
        if (engagementRate >= 0.7) {
          effectiveTriggers.push(trigger);
        } else if (engagementRate <= 0.3) {
          triggersToAvoid.push(trigger);
        }
      }
    }

    // Calculate overall intensity multiplier
    const intensityMultiplier = Math.max(totalOnThisDay / avgEventsPerDay, 0.5);

    patterns.push({
      day,
      elevatedCategories,
      intensityMultiplier: Math.round(intensityMultiplier * 100) / 100,
      effectiveTriggers,
      triggersToAvoid,
    });
  }

  log.debug({ patternCount: patterns.length, eventCount: events.length }, 'Analyzed day-of-week patterns');

  return patterns;
}

/**
 * Analyze time-of-day patterns from firing events
 */
export function analyzeTimeOfDayPatterns(
  events: TriggerFiringEvent[],
  config: TemporalPatternConfig = DEFAULT_TEMPORAL_CONFIG
): TimeOfDayPattern[] {
  if (events.length < config.minObservations) return [];

  const timeBuckets: TimeOfDayBucket[] = ['late_night', 'early_morning', 'morning', 'afternoon', 'evening', 'night'];
  const patterns: TimeOfDayPattern[] = [];

  // Group events by time bucket
  const eventsByTime = new Map<TimeOfDayBucket, TriggerFiringEvent[]>();
  for (const bucket of timeBuckets) {
    eventsByTime.set(bucket, []);
  }
  for (const event of events) {
    eventsByTime.get(event.timeOfDay)?.push(event);
  }

  // Calculate average events per time bucket
  const avgEventsPerBucket = events.length / 6;

  // Analyze each time bucket
  for (const bucket of timeBuckets) {
    const bucketEvents = eventsByTime.get(bucket) || [];
    if (bucketEvents.length === 0) continue;

    // Group by category
    const categoryCount = new Map<string, number>();
    for (const event of bucketEvents) {
      categoryCount.set(event.triggerCategory, (categoryCount.get(event.triggerCategory) || 0) + 1);
    }

    // Calculate elevated categories
    const totalInBucket = bucketEvents.length;
    const elevatedCategories: TimeOfDayPattern['elevatedCategories'] = [];

    for (const [category, count] of categoryCount) {
      const expectedInBucket = avgEventsPerBucket * (count / events.length);
      const multiplier = count / Math.max(expectedInBucket, 1);

      if (multiplier >= 1 + config.minMultiplierDifference) {
        const confidence = calculateConfidence(count, totalInBucket, expectedInBucket);

        if (confidence >= config.confidenceThreshold) {
          elevatedCategories.push({
            category,
            multiplier: Math.round(multiplier * 100) / 100,
            confidence: Math.round(confidence * 100) / 100,
            observations: count,
          });
        }
      }
    }

    // Find effective and ineffective triggers
    const effectiveTriggers: string[] = [];
    const triggersToAvoid: string[] = [];

    const triggerOutcomes = new Map<string, { engaged: number; deflected: number }>();
    for (const event of bucketEvents) {
      const outcomes = triggerOutcomes.get(event.triggerName) || { engaged: 0, deflected: 0 };
      if (event.outcome === 'engaged') outcomes.engaged++;
      if (event.outcome === 'deflected') outcomes.deflected++;
      triggerOutcomes.set(event.triggerName, outcomes);
    }

    for (const [trigger, outcomes] of triggerOutcomes) {
      const total = outcomes.engaged + outcomes.deflected;
      if (total >= 3) {
        const engagementRate = outcomes.engaged / total;
        if (engagementRate >= 0.7) {
          effectiveTriggers.push(trigger);
        } else if (engagementRate <= 0.3) {
          triggersToAvoid.push(trigger);
        }
      }
    }

    // Calculate overall intensity multiplier
    const intensityMultiplier = Math.max(totalInBucket / avgEventsPerBucket, 0.5);

    // Extract common topics (from trigger categories for now)
    const commonTopics = [...categoryCount.keys()].slice(0, 5);

    patterns.push({
      timeBucket: bucket,
      elevatedCategories,
      intensityMultiplier: Math.round(intensityMultiplier * 100) / 100,
      effectiveTriggers,
      triggersToAvoid,
      commonTopics,
    });
  }

  log.debug({ patternCount: patterns.length, eventCount: events.length }, 'Analyzed time-of-day patterns');

  return patterns;
}

/**
 * Analyze recurring date patterns (anniversaries, etc.)
 */
export function analyzeRecurringDatePatterns(
  events: TriggerFiringEvent[],
  significantDates: SignificantDate[],
  config: TemporalPatternConfig = DEFAULT_TEMPORAL_CONFIG
): RecurringDatePattern[] {
  if (events.length < config.minObservations || significantDates.length === 0) return [];

  const patterns: RecurringDatePattern[] = [];

  // For each significant date, analyze events near it
  for (const sigDate of significantDates) {
    if (!sigDate.isRecurring) continue;

    // Find events that have proximity to this date
    const nearbyEvents = events.filter(
      (e) => e.dateProximity && e.dateProximity.dateId === sigDate.id
    );

    if (nearbyEvents.length < config.minObservations) continue;

    // Analyze approach pattern (before the date)
    const approachEvents = nearbyEvents.filter((e) => e.dateProximity && e.dateProximity.daysAway > 0);
    const trailEvents = nearbyEvents.filter((e) => e.dateProximity && e.dateProximity.daysAway < 0);

    // Calculate lead time (earliest days away with elevated activity)
    const leadTimeDays = approachEvents.length > 0
      ? Math.max(...approachEvents.map((e) => e.dateProximity!.daysAway))
      : config.dateApproachWindowDays;

    // Calculate trail time
    const trailTimeDays = trailEvents.length > 0
      ? Math.max(...trailEvents.map((e) => Math.abs(e.dateProximity!.daysAway)))
      : config.dateTrailWindowDays;

    // Analyze category distribution
    const categoryCount = new Map<string, number>();
    for (const event of nearbyEvents) {
      categoryCount.set(event.triggerCategory, (categoryCount.get(event.triggerCategory) || 0) + 1);
    }

    const elevatedCategories: RecurringDatePattern['elevatedCategories'] = [];
    for (const [category, count] of categoryCount) {
      const multiplier = count / nearbyEvents.length;
      if (multiplier >= 0.2) { // At least 20% of events
        elevatedCategories.push({
          category,
          multiplier: Math.round(multiplier * 100) / 100,
          confidence: Math.min(count / 5, 1), // Confidence based on observation count
        });
      }
    }

    // Determine approach behavior
    let approachBehavior: RecurringDatePattern['approachBehavior'] = 'neutral';
    const emotionalCategories = ['emotional', 'grief', 'anxiety'];
    const hasEmotionalSpike = elevatedCategories.some(
      (c) => emotionalCategories.includes(c.category) && c.multiplier > 0.3
    );

    if (sigDate.type === 'loss') {
      approachBehavior = hasEmotionalSpike ? 'increased_anxiety' : 'withdrawal';
    } else if (sigDate.type === 'celebration' || sigDate.type === 'birthday') {
      approachBehavior = hasEmotionalSpike ? 'increased_engagement' : 'neutral';
    } else if (hasEmotionalSpike) {
      approachBehavior = 'increased_anxiety';
    }

    patterns.push({
      dateId: sigDate.id,
      leadTimeDays,
      trailTimeDays,
      elevatedCategories,
      approachBehavior,
    });

    log.debug(
      { dateId: sigDate.id, dateType: sigDate.type, approachBehavior, eventCount: nearbyEvents.length },
      'Analyzed recurring date pattern'
    );
  }

  return patterns;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze all temporal patterns and update the profile
 */
export function analyzeTemporalPatterns(
  profile: UserTriggerProfile,
  config: TemporalPatternConfig = DEFAULT_TEMPORAL_CONFIG
): UserTriggerProfile {
  const intelligence = profile.temporalIntelligence ?? { ...DEFAULT_TEMPORAL_INTELLIGENCE };
  const events = intelligence.recentFirings;

  log.info({ userId: profile.userId, eventCount: events.length }, 'Analyzing temporal patterns');

  // Analyze patterns
  const dayPatterns = analyzeDayOfWeekPatterns(events, config);
  const timePatterns = analyzeTimeOfDayPatterns(events, config);
  const datePatterns = analyzeRecurringDatePatterns(events, profile.significantDates, config);

  // Calculate overall confidence
  const hasPatterns = dayPatterns.length > 0 || timePatterns.length > 0 || datePatterns.length > 0;
  const overallConfidence = hasPatterns
    ? Math.min(events.length / 50, 1) // Confidence grows with data
    : 0;

  const updatedIntelligence: TemporalIntelligence = {
    ...intelligence,
    dayPatterns,
    timePatterns,
    datePatterns,
    lastAnalyzedAt: new Date(),
    minObservationsForPattern: config.minObservations,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };

  log.info(
    {
      userId: profile.userId,
      dayPatternCount: dayPatterns.length,
      timePatternCount: timePatterns.length,
      datePatternCount: datePatterns.length,
      confidence: updatedIntelligence.overallConfidence,
    },
    'Temporal pattern analysis complete'
  );

  return {
    ...profile,
    temporalIntelligence: updatedIntelligence,
    updatedAt: new Date(),
  };
}

// ============================================================================
// TEMPORAL BOOST CALCULATION
// ============================================================================

/**
 * Result of calculating temporal boost
 */
export interface TemporalBoostResult {
  /** Overall multiplier to apply to trigger confidence */
  overallMultiplier: number;
  /** Category-specific boosts */
  categoryBoosts: Record<string, number>;
  /** Specific trigger boosts/suppressions */
  triggerAdjustments: Array<{
    triggerName: string;
    adjustment: number; // Positive = boost, negative = suppress
    reason: string;
  }>;
  /** Contextual notes for the agent */
  contextNotes: string[];
  /** Whether we're in a significant date window */
  nearSignificantDate?: {
    dateId: string;
    dateType: string;
    daysAway: number;
    description: string;
  };
}

/**
 * Calculate temporal boost based on current time and user's patterns
 */
export function calculateTemporalBoost(
  profile: UserTriggerProfile,
  currentTime: Date = new Date()
): TemporalBoostResult {
  const result: TemporalBoostResult = {
    overallMultiplier: 1.0,
    categoryBoosts: {},
    triggerAdjustments: [],
    contextNotes: [],
  };

  const intelligence = profile.temporalIntelligence;
  if (!intelligence || intelligence.overallConfidence < 0.3) {
    return result; // Not enough data for reliable patterns
  }

  const currentDay = getDayOfWeek(currentTime);
  const currentTimeBucket = getTimeOfDayBucket(currentTime.getHours());

  // Apply day-of-week patterns
  const dayPattern = intelligence.dayPatterns.find((p) => p.day === currentDay);
  if (dayPattern) {
    result.overallMultiplier *= dayPattern.intensityMultiplier;

    for (const elevated of dayPattern.elevatedCategories) {
      result.categoryBoosts[elevated.category] = (result.categoryBoosts[elevated.category] || 1.0) * elevated.multiplier;
    }

    for (const trigger of dayPattern.effectiveTriggers) {
      result.triggerAdjustments.push({
        triggerName: trigger,
        adjustment: 0.2,
        reason: `Works well on ${currentDay}s`,
      });
    }

    for (const trigger of dayPattern.triggersToAvoid) {
      result.triggerAdjustments.push({
        triggerName: trigger,
        adjustment: -0.3,
        reason: `Less effective on ${currentDay}s`,
      });
    }
  }

  // Apply time-of-day patterns
  const timePattern = intelligence.timePatterns.find((p) => p.timeBucket === currentTimeBucket);
  if (timePattern) {
    result.overallMultiplier *= timePattern.intensityMultiplier;

    for (const elevated of timePattern.elevatedCategories) {
      result.categoryBoosts[elevated.category] = (result.categoryBoosts[elevated.category] || 1.0) * elevated.multiplier;
    }

    for (const trigger of timePattern.effectiveTriggers) {
      result.triggerAdjustments.push({
        triggerName: trigger,
        adjustment: 0.2,
        reason: `Works well during ${currentTimeBucket.replace('_', ' ')}`,
      });
    }

    for (const trigger of timePattern.triggersToAvoid) {
      result.triggerAdjustments.push({
        triggerName: trigger,
        adjustment: -0.3,
        reason: `Less effective during ${currentTimeBucket.replace('_', ' ')}`,
      });
    }

    if (timePattern.commonTopics.length > 0) {
      result.contextNotes.push(`Common topics at this time: ${timePattern.commonTopics.join(', ')}`);
    }
  }

  // Check for significant date proximity
  for (const datePattern of intelligence.datePatterns) {
    const sigDate = profile.significantDates.find((d) => d.id === datePattern.dateId);
    if (!sigDate || !sigDate.isRecurring) continue;

    const daysUntil = daysUntilRecurringDate(sigDate, currentTime);

    if (daysUntil <= datePattern.leadTimeDays) {
      // We're in the approach window
      result.nearSignificantDate = {
        dateId: sigDate.id,
        dateType: sigDate.type,
        daysAway: daysUntil,
        description: sigDate.description,
      };

      // Apply elevated categories
      for (const elevated of datePattern.elevatedCategories) {
        const proximityBoost = 1 + (1 - daysUntil / datePattern.leadTimeDays) * 0.5; // Stronger as date approaches
        result.categoryBoosts[elevated.category] = (result.categoryBoosts[elevated.category] || 1.0) * elevated.multiplier * proximityBoost;
      }

      // Add context note
      if (daysUntil === 0) {
        result.contextNotes.push(`Today is ${sigDate.description}`);
      } else if (daysUntil === 1) {
        result.contextNotes.push(`Tomorrow is ${sigDate.description}`);
      } else {
        result.contextNotes.push(`${sigDate.description} is in ${daysUntil} days`);
      }

      // Only track the nearest significant date
      break;
    }
  }

  // Cap overall multiplier
  result.overallMultiplier = Math.min(Math.max(result.overallMultiplier, 0.5), 2.0);

  log.debug(
    {
      day: currentDay,
      time: currentTimeBucket,
      overallMultiplier: result.overallMultiplier,
      categoryBoostCount: Object.keys(result.categoryBoosts).length,
      nearDate: result.nearSignificantDate?.description,
    },
    'Calculated temporal boost'
  );

  return result;
}

// ============================================================================
// TEMPORAL ANALYTICS
// ============================================================================

/**
 * Analytics for temporal pattern detection
 */
export interface TemporalAnalytics {
  /** Total number of temporal boosts calculated */
  totalBoostCalculations: number;
  /** Number of boosts near significant dates */
  nearSignificantDateBoosts: number;
  /** Average overall multiplier */
  averageMultiplier: number;
  /** Count by day of week */
  byDayOfWeek: Record<DayOfWeek, number>;
  /** Count by time of day */
  byTimeOfDay: Record<TimeOfDayBucket, number>;
  /** Total trigger firing events recorded */
  totalFiringEvents: number;
  /** Firing event outcomes distribution */
  outcomeDistribution: Record<'engaged' | 'deflected' | 'neutral' | 'unknown', number>;
  /** Average processing time for boost calculation */
  averageProcessingMs: number;
}

// In-memory analytics
let temporalAnalytics: TemporalAnalytics = {
  totalBoostCalculations: 0,
  nearSignificantDateBoosts: 0,
  averageMultiplier: 0,
  byDayOfWeek: {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
  },
  byTimeOfDay: {
    late_night: 0,
    early_morning: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  },
  totalFiringEvents: 0,
  outcomeDistribution: {
    engaged: 0,
    deflected: 0,
    neutral: 0,
    unknown: 0,
  },
  averageProcessingMs: 0,
};

let totalMultiplier = 0;
let totalProcessingTime = 0;

/**
 * Record temporal boost calculation for analytics
 */
export function recordTemporalBoost(
  result: TemporalBoostResult,
  dayOfWeek: DayOfWeek,
  timeOfDay: TimeOfDayBucket,
  processingMs: number
): void {
  temporalAnalytics.totalBoostCalculations++;
  totalMultiplier += result.overallMultiplier;
  temporalAnalytics.averageMultiplier = totalMultiplier / temporalAnalytics.totalBoostCalculations;

  if (result.nearSignificantDate) {
    temporalAnalytics.nearSignificantDateBoosts++;
  }

  temporalAnalytics.byDayOfWeek[dayOfWeek]++;
  temporalAnalytics.byTimeOfDay[timeOfDay]++;

  totalProcessingTime += processingMs;
  temporalAnalytics.averageProcessingMs = totalProcessingTime / temporalAnalytics.totalBoostCalculations;
}

/**
 * Record trigger firing event for analytics
 */
export function recordFiringEventAnalytics(event: TriggerFiringEvent): void {
  temporalAnalytics.totalFiringEvents++;
  temporalAnalytics.outcomeDistribution[event.outcome]++;
}

/**
 * Get temporal analytics summary
 */
export function getTemporalAnalytics(): TemporalAnalytics & {
  byDayOfWeekArray: Array<{ day: DayOfWeek; count: number }>;
  byTimeOfDayArray: Array<{ bucket: TimeOfDayBucket; count: number }>;
} {
  return {
    ...temporalAnalytics,
    byDayOfWeekArray: Object.entries(temporalAnalytics.byDayOfWeek).map(([day, count]) => ({
      day: day as DayOfWeek,
      count,
    })),
    byTimeOfDayArray: Object.entries(temporalAnalytics.byTimeOfDay).map(([bucket, count]) => ({
      bucket: bucket as TimeOfDayBucket,
      count,
    })),
  };
}

/**
 * Reset temporal analytics (for testing)
 */
export function resetTemporalAnalytics(): void {
  temporalAnalytics = {
    totalBoostCalculations: 0,
    nearSignificantDateBoosts: 0,
    averageMultiplier: 0,
    byDayOfWeek: {
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
      sunday: 0,
    },
    byTimeOfDay: {
      late_night: 0,
      early_morning: 0,
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    },
    totalFiringEvents: 0,
    outcomeDistribution: {
      engaged: 0,
      deflected: 0,
      neutral: 0,
      unknown: 0,
    },
    averageProcessingMs: 0,
  };
  totalMultiplier = 0;
  totalProcessingTime = 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Configuration
  DEFAULT_TEMPORAL_CONFIG,

  // Helpers
  getDayOfWeek,
  getTimeOfDayBucket,
  daysUntilRecurringDate,
  daysSinceRecurringDate,

  // Event recording
  createTriggerFiringEvent,
  recordFiringEvent,

  // Pattern analysis
  analyzeDayOfWeekPatterns,
  analyzeTimeOfDayPatterns,
  analyzeRecurringDatePatterns,
  analyzeTemporalPatterns,

  // Boost calculation
  calculateTemporalBoost,

  // Analytics
  recordTemporalBoost,
  recordFiringEventAnalytics,
  getTemporalAnalytics,
  resetTemporalAnalytics,
};
