/**
 * Habit-Calendar Integration
 *
 * Correlates habits with calendar patterns for Maya's coaching.
 * This is "better than human" because no coach can:
 * - Track that you skip workouts on busy days
 * - Suggest shorter habits when calendar is packed
 * - Celebrate completing habits on overloaded days
 *
 * @module habits/habit-calendar-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getDayOverview, getWeekOverview, type DayOverview } from '../calendar/calendar-service.js';
import { getCalendarLoadFactors } from '../calendar/calendar-load-service.js';

const log = createLogger({ module: 'habit-calendar' });

// ============================================================================
// TYPES
// ============================================================================

export interface HabitCalendarInsight {
  habitId: string;
  habitName: string;

  // Calendar correlation
  missedOnHeavyDays: boolean;
  completionRateOnHeavyDays: number; // 0-1
  completionRateOnLightDays: number; // 0-1
  calendarCorrelation: 'strong' | 'moderate' | 'weak' | 'none';

  // Suggestions
  suggestedAdaptation: {
    type: 'shorter_version' | 'different_time' | 'reschedule' | 'none';
    description: string;
    alternativeDuration?: number;
    alternativeTime?: string;
  };

  // Celebration context (for today)
  celebrationContext: {
    wasOnBusyDay: boolean;
    meetingsAroundHabit: number;
    extraPraiseDeserved: boolean;
    celebrationMessage: string | null;
  } | null;
}

export interface HabitRecommendation {
  habitId: string;
  habitName: string;
  suggestion: string;
  reason: string;
  adaptationType: 'shorter' | 'reschedule' | 'skip_ok' | 'normal';
  suggestedDuration?: number;
  suggestedTime?: string;
}

export interface HabitCompletionWithContext {
  habitId: string;
  completedAt: Date;
  calendarContext: {
    dayMeetingHours: number;
    wasOverloaded: boolean;
    hadBackToBack: boolean;
  };
}

// Simplified habit type for this service
interface HabitData {
  id: string;
  name: string;
  duration?: number;
  completedDates?: string[]; // ISO date strings
  frequency?: 'daily' | 'weekly' | 'weekdays';
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get calendar-aware insights for a habit
 */
export async function getHabitCalendarInsights(
  userId: string,
  habit: HabitData,
  completionHistory?: Array<{ date: Date; completed: boolean }>
): Promise<HabitCalendarInsight> {
  try {
    // Get recent calendar data
    const weekOverview = await getWeekOverview(userId);

    // Analyze correlation between calendar load and habit completion
    const { heavyDayCompletions, lightDayCompletions, missedOnHeavyDays } =
      await analyzeCompletionCorrelation(userId, habit, completionHistory, weekOverview);

    // Calculate completion rates
    const completionRateOnHeavyDays =
      heavyDayCompletions.total > 0 ? heavyDayCompletions.completed / heavyDayCompletions.total : 0;
    const completionRateOnLightDays =
      lightDayCompletions.total > 0 ? lightDayCompletions.completed / lightDayCompletions.total : 1;

    // Determine correlation strength
    let correlation: 'strong' | 'moderate' | 'weak' | 'none' = 'none';
    const rateDifference = completionRateOnLightDays - completionRateOnHeavyDays;

    if (rateDifference > 0.5) correlation = 'strong';
    else if (rateDifference > 0.3) correlation = 'moderate';
    else if (rateDifference > 0.1) correlation = 'weak';

    // Generate adaptation suggestion
    const suggestedAdaptation = generateAdaptationSuggestion(
      habit,
      correlation,
      completionRateOnHeavyDays
    );

    // Get celebration context for today
    const celebrationContext = await getCelebrationContext(userId, habit);

    return {
      habitId: habit.id,
      habitName: habit.name,
      missedOnHeavyDays,
      completionRateOnHeavyDays,
      completionRateOnLightDays,
      calendarCorrelation: correlation,
      suggestedAdaptation,
      celebrationContext,
    };
  } catch (error) {
    log.error({ error: String(error), userId, habitId: habit.id }, 'Failed to get habit insights');

    return {
      habitId: habit.id,
      habitName: habit.name,
      missedOnHeavyDays: false,
      completionRateOnHeavyDays: 0,
      completionRateOnLightDays: 0,
      calendarCorrelation: 'none',
      suggestedAdaptation: { type: 'none', description: '' },
      celebrationContext: null,
    };
  }
}

/**
 * Get recommendations for tomorrow's habits based on calendar
 */
export async function getTomorrowHabitRecommendations(
  userId: string,
  habits: HabitData[]
): Promise<HabitRecommendation[]> {
  const recommendations: HabitRecommendation[] = [];

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const tomorrowOverview = await getDayOverview(userId, tomorrow);
    const isHeavyDay = tomorrowOverview.isOverloaded || tomorrowOverview.totalMeetingMinutes > 300;
    const { hasBackToBack } = tomorrowOverview;

    for (const habit of habits) {
      const recommendation = generateHabitRecommendation(
        habit,
        tomorrowOverview,
        isHeavyDay,
        hasBackToBack
      );

      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get tomorrow recommendations');
    return [];
  }
}

/**
 * Check if today is a good day for extra celebration
 */
async function getCelebrationContext(
  userId: string,
  habit: HabitData
): Promise<HabitCalendarInsight['celebrationContext'] | null> {
  try {
    const todayOverview = await getDayOverview(userId, new Date());

    // Check if habit was completed today
    const today = new Date().toISOString().split('T')[0];
    const completedToday = habit.completedDates?.includes(today);

    if (!completedToday) {
      return null;
    }

    const wasOnBusyDay = todayOverview.isOverloaded || todayOverview.totalMeetingMinutes > 240;
    const hadBackToBack = todayOverview.hasBackToBack;
    const meetingHours = Math.round(todayOverview.totalMeetingMinutes / 60);

    // Determine if extra praise is deserved
    const extraPraiseDeserved = wasOnBusyDay || (hadBackToBack && meetingHours >= 4);

    // Generate celebration message
    let celebrationMessage: string | null = null;

    if (extraPraiseDeserved) {
      if (todayOverview.totalMeetings >= 6) {
        celebrationMessage = `You did ${habit.name} on a day with ${todayOverview.totalMeetings} meetings. That's serious commitment.`;
      } else if (wasOnBusyDay) {
        celebrationMessage = `${habit.name} on an overloaded day? That's the definition of showing up for yourself.`;
      } else if (hadBackToBack) {
        celebrationMessage = `Finding time for ${habit.name} between back-to-back meetings shows real dedication.`;
      }
    }

    return {
      wasOnBusyDay,
      meetingsAroundHabit: todayOverview.totalMeetings,
      extraPraiseDeserved,
      celebrationMessage,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get celebration context');
    return null;
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build Maya coaching context with calendar awareness
 */
export async function buildHabitCalendarContext(
  userId: string,
  habits: HabitData[]
): Promise<string> {
  const sections: string[] = ['[HABIT-CALENDAR CORRELATION - Better Than Human Pattern Detection]'];

  try {
    // Check tomorrow's load
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowOverview = await getDayOverview(userId, tomorrow);

    if (tomorrowOverview.isOverloaded) {
      sections.push(
        `\n⚠️ Tomorrow is PACKED (${tomorrowOverview.totalMeetings} meetings, ${Math.round(tomorrowOverview.totalMeetingMinutes / 60)}h). Consider suggesting:`
      );

      for (const habit of habits.slice(0, 3)) {
        const duration = habit.duration || 30;
        if (duration > 20) {
          const shortVersion = Math.round(duration * 0.4);
          sections.push(`• ${habit.name}: ${shortVersion}-minute version instead of ${duration}`);
        }
      }
    }

    // Check for celebration opportunity
    const todayOverview = await getDayOverview(userId, new Date());
    const today = new Date().toISOString().split('T')[0];
    const completedToday = habits.filter((h) => h.completedDates?.includes(today));

    if (completedToday.length > 0 && todayOverview.isOverloaded) {
      sections.push(
        `\n🎉 CELEBRATE EXTRA: User completed ${completedToday.length} habit(s) on a day with ${todayOverview.totalMeetings} meetings!`
      );
    }

    // Check for patterns
    const loadFactors = await getCalendarLoadFactors(userId);
    if (loadFactors.weeklyMeetingHours >= 25) {
      sections.push(
        `\n📊 This week has ${loadFactors.weeklyMeetingHours}h of meetings. Be gentle with habit expectations.`
      );
    }

    return sections.length > 1 ? sections.join('\n') : '';
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to build habit calendar context');
    return '';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function analyzeCompletionCorrelation(
  userId: string,
  habit: HabitData,
  completionHistory: Array<{ date: Date; completed: boolean }> | undefined,
  weekOverview: { days: DayOverview[] }
): Promise<{
  heavyDayCompletions: { total: number; completed: number };
  lightDayCompletions: { total: number; completed: number };
  missedOnHeavyDays: boolean;
}> {
  const heavyDayCompletions = { total: 0, completed: 0 };
  const lightDayCompletions = { total: 0, completed: 0 };
  let missedOnHeavyDays = false;

  // Use completion history if provided, otherwise use completedDates
  const completions = completionHistory || [];

  // If no history, create from completedDates
  if (completions.length === 0 && habit.completedDates) {
    for (const dateStr of habit.completedDates.slice(-14)) {
      completions.push({ date: new Date(dateStr), completed: true });
    }
  }

  // Analyze each day
  for (const dayOverview of weekOverview.days) {
    const dayOfWeek = dayOverview.date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const isHeavyDay = dayOverview.isOverloaded || dayOverview.totalMeetingMinutes > 300;
    const dateStr = dayOverview.date.toISOString().split('T')[0];

    // Check if habit was completed on this day
    const wasCompleted =
      habit.completedDates?.includes(dateStr) ||
      completions.some((c) => c.date.toISOString().split('T')[0] === dateStr && c.completed);

    if (isHeavyDay) {
      heavyDayCompletions.total++;
      if (wasCompleted) heavyDayCompletions.completed++;
      else missedOnHeavyDays = true;
    } else {
      lightDayCompletions.total++;
      if (wasCompleted) lightDayCompletions.completed++;
    }
  }

  return { heavyDayCompletions, lightDayCompletions, missedOnHeavyDays };
}

function generateAdaptationSuggestion(
  habit: HabitData,
  correlation: 'strong' | 'moderate' | 'weak' | 'none',
  heavyDayRate: number
): HabitCalendarInsight['suggestedAdaptation'] {
  if (correlation === 'none' || correlation === 'weak') {
    return { type: 'none', description: '' };
  }

  const duration = habit.duration || 30;

  if (correlation === 'strong' && heavyDayRate < 0.3) {
    // Strong correlation with poor heavy-day completion
    const shortDuration = Math.max(10, Math.round(duration * 0.3));
    return {
      type: 'shorter_version',
      description: `On busy days, try a ${shortDuration}-minute version of ${habit.name}`,
      alternativeDuration: shortDuration,
    };
  }

  if (correlation === 'moderate') {
    // Moderate correlation - suggest time shift
    return {
      type: 'different_time',
      description: `Try ${habit.name} before your first meeting on busy days`,
      alternativeTime: 'early morning',
    };
  }

  return { type: 'none', description: '' };
}

function generateHabitRecommendation(
  habit: HabitData,
  dayOverview: DayOverview,
  isHeavyDay: boolean,
  hasBackToBack: boolean
): HabitRecommendation | null {
  const duration = habit.duration || 30;

  if (isHeavyDay && duration > 20) {
    // Heavy day + long habit = suggest shorter version
    const shortDuration = Math.max(10, Math.round(duration * 0.4));
    return {
      habitId: habit.id,
      habitName: habit.name,
      suggestion: `${shortDuration}-minute ${habit.name} instead of ${duration} minutes`,
      reason: `Tomorrow has ${dayOverview.totalMeetings} meetings`,
      adaptationType: 'shorter',
      suggestedDuration: shortDuration,
    };
  }

  if (hasBackToBack && dayOverview.freeTimeMinutes < 60) {
    // No gaps + limited free time
    return {
      habitId: habit.id,
      habitName: habit.name,
      suggestion: `Do ${habit.name} first thing, before meetings start`,
      reason: 'Back-to-back meetings leave little room during the day',
      adaptationType: 'reschedule',
      suggestedTime: 'before 8am',
    };
  }

  if (isHeavyDay) {
    // Heavy but manageable
    return {
      habitId: habit.id,
      habitName: habit.name,
      suggestion: `${habit.name} - busy day, but you've got this`,
      reason: 'Packed day but not impossible',
      adaptationType: 'normal',
    };
  }

  return null; // No special recommendation needed
}

// ============================================================================
// CONVENIENCE FUNCTION: Get Context for Context Builders
// ============================================================================

/**
 * Convenience function for context builders that need habit-calendar context.
 * Automatically fetches user habits and builds the context.
 */
export async function getHabitCalendarContextForBuilder(userId: string): Promise<string | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getProductivityStore } = await import('../productivity-store.js');
    const store = getProductivityStore();
    const userHabits = store.getUserHabits(userId);
    const habitLogs = store.getUserHabitLogs(userId);

    if (!userHabits || userHabits.length === 0) {
      return null;
    }

    // Get completed dates from habit logs
    const getCompletedDates = (habitId: string): string[] => {
      return habitLogs
        .filter((log) => log.habitId === habitId && log.completed)
        .map((log) => log.date);
    };

    // Convert to the format expected by buildHabitCalendarContext
    const habits: HabitData[] = userHabits.map((h) => ({
      id: h.id,
      name: h.name,
      duration: undefined, // Not available in productivity store
      completedDates: getCompletedDates(h.id),
      frequency: h.frequency as 'daily' | 'weekly' | 'weekdays' | undefined,
    }));

    return await buildHabitCalendarContext(userId, habits);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get habit calendar context for builder');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const habitCalendarIntegration = {
  getInsights: getHabitCalendarInsights,
  getTomorrowRecommendations: getTomorrowHabitRecommendations,
  buildContext: buildHabitCalendarContext,
  getContextForBuilder: getHabitCalendarContextForBuilder,
};

export default habitCalendarIntegration;
