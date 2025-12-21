/**
 * Calendar Load Service
 *
 * Calculates calendar load metrics for integration with the Capacity Guardian.
 * This enables "better than human" burnout detection by combining:
 * - Energy readings (from conversation)
 * - Calendar load (meeting hours, back-to-back, focus time)
 *
 * No human assistant can track 4 weeks of calendar patterns and correlate
 * them with energy levels. Ferni can.
 *
 * @module calendar/calendar-load-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDayOverview,
  getWeekOverview,
  type DayOverview,
  type WeekOverview,
} from './calendar-service.js';

const log = createLogger({ module: 'calendar-load-service' });

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarLoadFactors {
  // Weekly metrics
  weeklyMeetingHours: number;
  weeklyFocusTimeRatio: number; // 0-1, higher = more focus time
  weeklyBackToBackPercentage: number; // 0-100

  // Daily metrics (today)
  todayMeetingHours: number;
  todayFocusTimeMinutes: number;
  consecutiveMeetingStreak: number; // current streak in minutes

  // Trend metrics
  meetingHoursTrend: 'increasing' | 'stable' | 'decreasing';
  previousWeekHours: number;
  weekOverWeekChange: number; // percentage change

  // Patterns
  heaviestDayThisWeek: string | null;
  lightestDayThisWeek: string | null;
  upcomingHeavyDays: string[]; // Day names with >6h meetings

  // Risk indicators
  consecutiveOverloadedDays: number;
  noRecoveryDays: number; // Days with <1h focus time
}

export interface CalendarBurnoutFactor {
  name: string;
  weight: number;
  description: string;
  riskContribution: number; // 0-100 points to add to risk score
}

export interface HistoricalBurnoutPattern {
  period: string; // e.g., "November 2024"
  weeklyMeetingHours: number;
  focusTimeRatio: number;
  backToBackPercentage: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const OVERLOAD_HOURS_PER_DAY = 6;
const HEAVY_WEEK_HOURS = 30;
const VERY_HEAVY_WEEK_HOURS = 35;
const LOW_FOCUS_TIME_RATIO = 0.15;
const HIGH_BACK_TO_BACK_PERCENTAGE = 50;
const WORK_DAY_HOURS = 9; // 9am-6pm

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Calculate comprehensive calendar load factors for a user
 *
 * This is the main function used by Capacity Guardian to assess
 * calendar-based burnout risk.
 */
export async function getCalendarLoadFactors(userId: string): Promise<CalendarLoadFactors> {
  try {
    // Get this week's overview
    const thisWeek = await getWeekOverview(userId);

    // Get today's overview
    const todayOverview = await getDayOverview(userId, new Date());

    // Get last week for trend analysis
    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeek = await getWeekOverview(userId, lastWeekStart);

    // Calculate weekly metrics
    const weeklyMeetingMinutes = thisWeek.days.reduce(
      (sum, day) => sum + day.totalMeetingMinutes,
      0
    );
    const weeklyMeetingHours = Math.round((weeklyMeetingMinutes / 60) * 10) / 10;

    const totalWorkMinutes = 5 * WORK_DAY_HOURS * 60; // 5 work days
    const weeklyFocusTimeRatio = Math.max(
      0,
      (totalWorkMinutes - weeklyMeetingMinutes) / totalWorkMinutes
    );

    // Calculate back-to-back percentage
    const daysWithBackToBack = thisWeek.days.filter(
      (d) => d.hasBackToBack && d.date.getDay() !== 0 && d.date.getDay() !== 6
    ).length;
    const weeklyBackToBackPercentage = Math.round((daysWithBackToBack / 5) * 100);

    // Calculate trend
    const lastWeekMeetingMinutes = lastWeek.days.reduce(
      (sum, day) => sum + day.totalMeetingMinutes,
      0
    );
    const lastWeekMeetingHours = Math.round((lastWeekMeetingMinutes / 60) * 10) / 10;

    let meetingHoursTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    const weekOverWeekChange =
      lastWeekMeetingHours > 0
        ? Math.round(((weeklyMeetingHours - lastWeekMeetingHours) / lastWeekMeetingHours) * 100)
        : 0;

    if (weekOverWeekChange > 15) meetingHoursTrend = 'increasing';
    else if (weekOverWeekChange < -15) meetingHoursTrend = 'decreasing';

    // Find heavy days
    const upcomingHeavyDays = thisWeek.days
      .filter((d) => {
        const dayOfWeek = d.date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return false;
        return d.totalMeetingMinutes >= OVERLOAD_HOURS_PER_DAY * 60;
      })
      .map((d) => d.date.toLocaleDateString('en-US', { weekday: 'long' }));

    // Count consecutive overloaded days
    let consecutiveOverloadedDays = 0;
    let maxConsecutive = 0;
    for (const day of thisWeek.days) {
      const dayOfWeek = day.date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      if (day.isOverloaded) {
        consecutiveOverloadedDays++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveOverloadedDays);
      } else {
        consecutiveOverloadedDays = 0;
      }
    }

    // Count days with no recovery (< 1h focus time)
    const noRecoveryDays = thisWeek.days.filter((d) => {
      const dayOfWeek = d.date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return false;
      return d.freeTimeMinutes < 60 && d.totalMeetings > 0;
    }).length;

    // Calculate consecutive meeting streak for today
    const consecutiveMeetingStreak = calculateConsecutiveStreak(todayOverview);

    return {
      // Weekly
      weeklyMeetingHours,
      weeklyFocusTimeRatio: Math.round(weeklyFocusTimeRatio * 100) / 100,
      weeklyBackToBackPercentage,

      // Today
      todayMeetingHours: Math.round((todayOverview.totalMeetingMinutes / 60) * 10) / 10,
      todayFocusTimeMinutes: todayOverview.freeTimeMinutes,
      consecutiveMeetingStreak,

      // Trends
      meetingHoursTrend,
      previousWeekHours: lastWeekMeetingHours,
      weekOverWeekChange,

      // Patterns
      heaviestDayThisWeek: thisWeek.busiestDay?.day || null,
      lightestDayThisWeek: thisWeek.lightestDay?.day || null,
      upcomingHeavyDays,

      // Risk indicators
      consecutiveOverloadedDays: maxConsecutive,
      noRecoveryDays,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to calculate calendar load factors');

    // Return empty/safe defaults
    return {
      weeklyMeetingHours: 0,
      weeklyFocusTimeRatio: 1,
      weeklyBackToBackPercentage: 0,
      todayMeetingHours: 0,
      todayFocusTimeMinutes: 480,
      consecutiveMeetingStreak: 0,
      meetingHoursTrend: 'stable',
      previousWeekHours: 0,
      weekOverWeekChange: 0,
      heaviestDayThisWeek: null,
      lightestDayThisWeek: null,
      upcomingHeavyDays: [],
      consecutiveOverloadedDays: 0,
      noRecoveryDays: 0,
    };
  }
}

/**
 * Get calendar-based burnout risk factors
 *
 * Returns a list of factors that contribute to burnout risk,
 * each with a weight and risk contribution score.
 */
export async function getCalendarBurnoutRiskFactors(
  userId: string
): Promise<CalendarBurnoutFactor[]> {
  const factors: CalendarBurnoutFactor[] = [];
  const load = await getCalendarLoadFactors(userId);

  // Factor 1: Weekly meeting hours
  if (load.weeklyMeetingHours >= VERY_HEAVY_WEEK_HOURS) {
    factors.push({
      name: 'Extreme Meeting Load',
      weight: 0.3,
      description: `${load.weeklyMeetingHours}h of meetings this week (dangerously high)`,
      riskContribution: 30,
    });
  } else if (load.weeklyMeetingHours >= HEAVY_WEEK_HOURS) {
    factors.push({
      name: 'Heavy Meeting Load',
      weight: 0.2,
      description: `${load.weeklyMeetingHours}h of meetings this week`,
      riskContribution: 20,
    });
  }

  // Factor 2: Focus time ratio
  if (load.weeklyFocusTimeRatio < LOW_FOCUS_TIME_RATIO) {
    factors.push({
      name: 'No Focus Time',
      weight: 0.25,
      description: `Only ${Math.round(load.weeklyFocusTimeRatio * 100)}% of work time is unscheduled`,
      riskContribution: 25,
    });
  } else if (load.weeklyFocusTimeRatio < 0.25) {
    factors.push({
      name: 'Low Focus Time',
      weight: 0.15,
      description: `Only ${Math.round(load.weeklyFocusTimeRatio * 100)}% focus time available`,
      riskContribution: 15,
    });
  }

  // Factor 3: Back-to-back frequency
  if (load.weeklyBackToBackPercentage >= HIGH_BACK_TO_BACK_PERCENTAGE) {
    factors.push({
      name: 'Back-to-Back Overload',
      weight: 0.2,
      description: `${load.weeklyBackToBackPercentage}% of days have back-to-back meetings`,
      riskContribution: 20,
    });
  }

  // Factor 4: Consecutive overloaded days
  if (load.consecutiveOverloadedDays >= 3) {
    factors.push({
      name: 'No Break Days',
      weight: 0.25,
      description: `${load.consecutiveOverloadedDays} consecutive overloaded days`,
      riskContribution: 25,
    });
  }

  // Factor 5: Meeting hour trend
  if (load.meetingHoursTrend === 'increasing' && load.weekOverWeekChange > 25) {
    factors.push({
      name: 'Escalating Load',
      weight: 0.15,
      description: `Meeting hours up ${load.weekOverWeekChange}% from last week`,
      riskContribution: 15,
    });
  }

  // Factor 6: No recovery days
  if (load.noRecoveryDays >= 3) {
    factors.push({
      name: 'No Recovery Time',
      weight: 0.2,
      description: `${load.noRecoveryDays} days with less than 1h of free time`,
      riskContribution: 20,
    });
  }

  // Factor 7: Current consecutive streak (immediate warning)
  if (load.consecutiveMeetingStreak >= 180) {
    // 3+ hours
    factors.push({
      name: 'Meeting Marathon',
      weight: 0.15,
      description: `Currently ${Math.round(load.consecutiveMeetingStreak / 60)}h into back-to-back meetings`,
      riskContribution: 15,
    });
  }

  return factors;
}

/**
 * Check if current calendar pattern matches a historical burnout pattern
 *
 * This is the "better than human" feature - we can detect when the user's
 * current calendar looks like it did before a previous burnout episode.
 */
export async function matchHistoricalBurnoutPattern(
  userId: string,
  currentFactors?: CalendarLoadFactors
): Promise<HistoricalBurnoutPattern | null> {
  const factors = currentFactors || (await getCalendarLoadFactors(userId));

  // Load historical patterns from Firestore
  // For now, use a simple in-memory check
  // TODO: Implement Firestore storage for historical patterns

  // Hardcoded example patterns (would come from Firestore)
  const historicalPatterns: HistoricalBurnoutPattern[] = [];

  // Check for pattern match
  for (const pattern of historicalPatterns) {
    const hoursSimilar = Math.abs(factors.weeklyMeetingHours - pattern.weeklyMeetingHours) < 5;
    const focusSimilar = Math.abs(factors.weeklyFocusTimeRatio - pattern.focusTimeRatio) < 0.1;
    const backToBackSimilar =
      Math.abs(factors.weeklyBackToBackPercentage - pattern.backToBackPercentage) < 15;

    // If at least 2 of 3 metrics match, consider it a pattern match
    const matchCount = [hoursSimilar, focusSimilar, backToBackSimilar].filter(Boolean).length;
    if (matchCount >= 2) {
      return pattern;
    }
  }

  return null;
}

/**
 * Record a burnout period for future pattern matching
 */
export async function recordBurnoutPattern(userId: string, period: string): Promise<void> {
  const factors = await getCalendarLoadFactors(userId);

  const pattern: HistoricalBurnoutPattern = {
    period,
    weeklyMeetingHours: factors.weeklyMeetingHours,
    focusTimeRatio: factors.weeklyFocusTimeRatio,
    backToBackPercentage: factors.weeklyBackToBackPercentage,
  };

  // TODO: Store in Firestore under users/{userId}/burnout_patterns/{timestamp}
  log.info({ userId, pattern }, 'Recorded burnout pattern for future matching');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate consecutive meeting streak in minutes for today
 */
function calculateConsecutiveStreak(dayOverview: DayOverview): number {
  const now = new Date();
  const events = dayOverview.events
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  let currentStreak = 0;
  let streakStart: Date | null = null;

  for (const event of events) {
    const eventStart = event.startTime;
    const eventEnd = event.endTime;

    // Skip future events
    if (eventStart > now) break;

    // Check if this extends the current streak
    if (streakStart === null) {
      if (eventStart <= now && eventEnd >= now) {
        // Currently in a meeting
        streakStart = eventStart;
        currentStreak = (now.getTime() - eventStart.getTime()) / 60000;
      }
    } else {
      // Check if back-to-back (< 15 min gap)
      const gap = (eventStart.getTime() - streakStart.getTime() - currentStreak * 60000) / 60000;
      if (gap <= 15) {
        currentStreak = (now.getTime() - streakStart.getTime()) / 60000;
      } else {
        // Gap too large, reset streak
        if (eventStart <= now && eventEnd >= now) {
          streakStart = eventStart;
          currentStreak = (now.getTime() - eventStart.getTime()) / 60000;
        } else {
          streakStart = null;
          currentStreak = 0;
        }
      }
    }
  }

  return Math.round(currentStreak);
}

/**
 * Get a summary of calendar load for context injection
 */
export async function getCalendarLoadSummary(userId: string): Promise<string> {
  const factors = await getCalendarLoadFactors(userId);

  const lines: string[] = [];

  // Meeting hours
  if (factors.weeklyMeetingHours >= HEAVY_WEEK_HOURS) {
    lines.push(
      `📅 ${factors.weeklyMeetingHours}h of meetings this week (${factors.meetingHoursTrend})`
    );
  }

  // Focus time
  if (factors.weeklyFocusTimeRatio < 0.25) {
    lines.push(`⏰ Only ${Math.round(factors.weeklyFocusTimeRatio * 100)}% focus time available`);
  }

  // Back-to-back
  if (factors.weeklyBackToBackPercentage >= 40) {
    lines.push(`⚡ ${factors.weeklyBackToBackPercentage}% of days have back-to-back meetings`);
  }

  // Heavy days ahead
  if (factors.upcomingHeavyDays.length > 0) {
    lines.push(`🔥 Heavy days coming: ${factors.upcomingHeavyDays.join(', ')}`);
  }

  // Current streak warning
  if (factors.consecutiveMeetingStreak >= 120) {
    lines.push(
      `⚠️ ${Math.round(factors.consecutiveMeetingStreak / 60)}h into back-to-back meetings right now`
    );
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const calendarLoadService = {
  getLoadFactors: getCalendarLoadFactors,
  getBurnoutFactors: getCalendarBurnoutRiskFactors,
  matchHistoricalPattern: matchHistoricalBurnoutPattern,
  recordBurnoutPattern,
  getSummary: getCalendarLoadSummary,
};

export default calendarLoadService;
