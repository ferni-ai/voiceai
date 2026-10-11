/**
 * Send Window Optimizer
 *
 * Extracted from decision-engine.ts. Handles timing evaluation for outreach:
 * - ML timing integration (Thompson Sampling)
 * - Quiet hours enforcement
 * - Preferred time pattern matching
 * - Next optimal time calculation
 *
 * @module SendWindowOptimizer
 */

import {
  getTimingRecommendation,
  type TimeSlot,
  type DayOfWeek,
} from '../../contacts/optimal-timing.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { UserOutreachState } from '../decision-engine-types.js';
import type { OutreachTrigger } from '../decision-engine-types.js';

const log = getLogger().child({ service: 'send-window-optimizer' });

// ============================================================================
// TIME CONVERSION HELPERS
// ============================================================================

/** Convert hour number to TimeSlot for ML timing */
export function hourToTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** Convert day number (0=Sunday) to DayOfWeek for ML timing */
export function dayNumberToName(day: number): DayOfWeek {
  const days: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[day] || 'monday';
}

/** Convert DayOfWeek back to day number */
export function dayNameToNumber(day: DayOfWeek): number {
  const map: Record<DayOfWeek, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[day];
}

/** Get representative hour for a TimeSlot */
export function timeSlotToHour(slot: TimeSlot): number {
  const map: Record<TimeSlot, number> = {
    early_morning: 7,
    morning: 9,
    midday: 12,
    afternoon: 15,
    evening: 18,
    night: 21,
  };
  return map[slot];
}

// ============================================================================
// TIMING EVALUATION
// ============================================================================

export interface TimingEvaluationResult {
  defer: boolean;
  reason?: string;
  deferUntil?: Date;
}

/**
 * Evaluate whether now is a good time for outreach.
 * Uses ML timing (Thompson Sampling) with fallback to static patterns.
 */
export async function evaluateTiming(
  state: UserOutreachState,
  trigger: OutreachTrigger,
  now: Date
): Promise<TimingEvaluationResult> {
  const hour = now.getHours();
  const day = now.getDay();

  // Check quiet hours
  const quietStart = parseInt(state.preferences.quietHoursStart.split(':')[0]);
  const quietEnd = parseInt(state.preferences.quietHoursEnd.split(':')[0]);

  const inQuietHours =
    (quietStart > quietEnd && (hour >= quietStart || hour < quietEnd)) ||
    (quietStart <= quietEnd && hour >= quietStart && hour < quietEnd);

  if (inQuietHours && trigger.priority !== 'urgent') {
    const deferUntil = new Date(now);
    deferUntil.setHours(quietEnd, 0, 0, 0);
    if (hour >= quietStart) {
      deferUntil.setDate(deferUntil.getDate() + 1);
    }
    return { defer: true, reason: 'Quiet hours', deferUntil };
  }

  // Check timing patterns (unless urgent/high priority)
  if (trigger.priority !== 'urgent' && trigger.priority !== 'high') {
    // Try ML timing first (Thompson Sampling)
    try {
      const mlRecommendation = await getTimingRecommendation(state.userId, 'self', 'user');

      // Use ML if we have enough data (not in 'learning' phase)
      if (mlRecommendation.confidenceLevel !== 'learning') {
        const currentSlot = hourToTimeSlot(hour);
        const currentDayName = dayNumberToName(day);

        const isRecommendedNow =
          mlRecommendation.recommendedTimeSlot === currentSlot &&
          mlRecommendation.recommendedDay === currentDayName;

        if (!isRecommendedNow) {
          log.debug(
            {
              userId: state.userId,
              currentSlot,
              currentDay: currentDayName,
              confidence: mlRecommendation.confidenceLevel,
            },
            '📊 ML timing: deferring to better time'
          );
          return {
            defer: true,
            reason: 'ML timing - not optimal time',
            deferUntil: mlRecommendation.suggestedSendTime,
          };
        }

        log.debug(
          { userId: state.userId, currentSlot, currentDay: currentDayName },
          '📊 ML timing: current time is optimal'
        );
        return { defer: false };
      }
    } catch (mlError) {
      log.debug(
        { error: String(mlError), userId: state.userId },
        'ML timing check failed, using static patterns'
      );
    }

    // Fallback to static patterns
    const isPreferredHour = state.patterns.preferredHours.includes(hour);
    const isPreferredDay = state.patterns.preferredDays.includes(day);

    if (!isPreferredHour || !isPreferredDay) {
      const deferUntil = await findNextOptimalTime(state, now);
      return { defer: true, reason: 'Not optimal time', deferUntil };
    }
  }

  return { defer: false };
}

// ============================================================================
// OPTIMAL TIME CALCULATION
// ============================================================================

/**
 * Find the next optimal time slot for outreach based on ML or static patterns.
 */
export async function findNextOptimalTime(state: UserOutreachState, now: Date): Promise<Date> {
  const result = new Date(now);
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  // Try ML timing first (Thompson Sampling)
  try {
    const mlRecommendation = await getTimingRecommendation(state.userId, 'self', 'user');

    if (mlRecommendation.confidenceLevel !== 'learning') {
      if (mlRecommendation.suggestedSendTime > now) {
        log.debug(
          {
            userId: state.userId,
            day: mlRecommendation.recommendedDay,
            slot: mlRecommendation.recommendedTimeSlot,
            confidence: mlRecommendation.confidenceLevel,
          },
          '📊 ML timing: using learned optimal time'
        );
        return mlRecommendation.suggestedSendTime;
      }

      // If suggested time is in the past, calculate next occurrence
      const mlDay = dayNameToNumber(mlRecommendation.recommendedDay);
      const mlHour = timeSlotToHour(mlRecommendation.recommendedTimeSlot);

      let daysUntil = (mlDay - currentDay + 7) % 7;
      if (daysUntil === 0) {
        daysUntil = 7;
      }

      result.setDate(result.getDate() + daysUntil);
      result.setHours(mlHour, 0, 0, 0);
      log.debug(
        {
          userId: state.userId,
          day: mlRecommendation.recommendedDay,
          slot: mlRecommendation.recommendedTimeSlot,
          confidence: mlRecommendation.confidenceLevel,
        },
        '📊 ML timing: using learned optimal time (next occurrence)'
      );
      return result;
    }
  } catch (mlError) {
    log.debug(
      { error: String(mlError), userId: state.userId },
      'ML timing unavailable, using static patterns'
    );
  }

  // Fallback to static patterns
  const nextGoodHourToday = state.patterns.preferredHours.find((h) => h > currentHour);
  if (nextGoodHourToday !== undefined && state.patterns.preferredDays.includes(currentDay)) {
    result.setHours(nextGoodHourToday, 0, 0, 0);
    return result;
  }

  // Find next good day
  for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
    const futureDay = (currentDay + daysAhead) % 7;
    if (state.patterns.preferredDays.includes(futureDay)) {
      result.setDate(result.getDate() + daysAhead);
      result.setHours(state.patterns.preferredHours[0] || 9, 0, 0, 0);
      return result;
    }
  }

  // Fallback: tomorrow at first preferred hour
  result.setDate(result.getDate() + 1);
  result.setHours(state.patterns.preferredHours[0] || 9, 0, 0, 0);
  return result;
}

// ============================================================================
// SIMPLE TIME HELPERS
// ============================================================================

/** Get 9am tomorrow */
export function getNextDay(now: Date): Date {
  const result = new Date(now);
  result.setDate(result.getDate() + 1);
  result.setHours(9, 0, 0, 0);
  return result;
}

/** Get 9am next week */
export function getNextWeek(now: Date): Date {
  const result = new Date(now);
  result.setDate(result.getDate() + 7);
  result.setHours(9, 0, 0, 0);
  return result;
}
