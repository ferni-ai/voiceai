/**
 * Calendar Intelligence Service
 *
 * Smart scheduling and calendar analysis for Alex.
 * Provides proactive insights and recommendations.
 *
 * Features:
 * - Detect calendar overload
 * - Suggest optimal meeting times
 * - Identify focus time opportunities
 * - Generate daily briefings
 * - Analyze meeting patterns
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getEventsForDay,
  getEventsForWeek,
  getDayOverview,
  getWeekOverview,
  findFreeTimeSlots,
  type CalendarEvent,
  type DayOverview,
  type TimeSlot,
} from './calendar-service.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarAlert {
  type: 'overload' | 'back_to_back' | 'no_breaks' | 'early_meeting' | 'late_meeting' | 'conflict';
  severity: 'warning' | 'concern' | 'info';
  message: string;
  affectedDate?: Date;
  affectedEvents?: CalendarEvent[];
  suggestion?: string;
}

export interface MeetingSuggestion {
  slot: TimeSlot;
  reason: string;
  score: number; // 0-100, higher is better
  considerations: string[];
}

export interface DailyBriefing {
  date: Date;
  summary: string;
  totalMeetings: number;
  alerts: CalendarAlert[];
  firstMeeting?: CalendarEvent;
  focusTimeAvailable: number; // minutes
  suggestions: string[];
}

export interface CalendarPatterns {
  busiestDayOfWeek: string | null;
  averageMeetingsPerDay: number;
  peakMeetingHours: { start: number; end: number };
  totalMeetingHoursThisWeek: number;
  focusTimeRatio: number; // 0-1, higher = more focus time
  backToBackFrequency: number; // 0-1, how often back-to-back occurs
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const OVERLOAD_HOURS_PER_DAY = 6;
const IDEAL_FOCUS_BLOCK_MINUTES = 120;
const EARLY_MEETING_HOUR = 8;
const LATE_MEETING_HOUR = 18;
const MAX_BACK_TO_BACK_MEETINGS = 3;

// ============================================================================
// ALERT DETECTION
// ============================================================================

/**
 * Analyze calendar for alerts and concerns
 */
export async function detectCalendarAlerts(
  userId: string,
  dateRange?: { start: Date; end: Date }
): Promise<CalendarAlert[]> {
  const alerts: CalendarAlert[] = [];

  const startDate = dateRange?.start || new Date();
  const endDate = dateRange?.end || new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Check each day in range
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // Skip weekends
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const overview = await getDayOverview(userId, new Date(currentDate));
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

      // Check for overload
      if (overview.isOverloaded) {
        alerts.push({
          type: 'overload',
          severity: 'concern',
          message: `${dayName} is packed with ${overview.totalMeetingMinutes / 60} hours of meetings.`,
          affectedDate: new Date(currentDate),
          suggestion: 'Consider rescheduling non-essential meetings.',
        });
      }

      // Check for back-to-back
      if (overview.hasBackToBack) {
        alerts.push({
          type: 'back_to_back',
          severity: 'warning',
          message: `${dayName} has back-to-back meetings with no breaks.`,
          affectedDate: new Date(currentDate),
          suggestion: 'Add buffer time between meetings when possible.',
        });
      }

      // Check for early meetings
      if (overview.firstEvent) {
        const firstHour = overview.firstEvent.startTime.getHours();
        if (firstHour < EARLY_MEETING_HOUR) {
          alerts.push({
            type: 'early_meeting',
            severity: 'info',
            message: `${dayName} starts early at ${overview.firstEvent.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`,
            affectedDate: new Date(currentDate),
            affectedEvents: [overview.firstEvent],
          });
        }
      }

      // Check for late meetings
      if (overview.lastEvent) {
        const lastHour = overview.lastEvent.endTime.getHours();
        if (lastHour >= LATE_MEETING_HOUR) {
          alerts.push({
            type: 'late_meeting',
            severity: 'info',
            message: `${dayName} runs late until ${overview.lastEvent.endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`,
            affectedDate: new Date(currentDate),
            affectedEvents: [overview.lastEvent],
          });
        }
      }

      // Check for no focus time
      if (overview.freeTimeMinutes < IDEAL_FOCUS_BLOCK_MINUTES && overview.totalMeetings > 0) {
        alerts.push({
          type: 'no_breaks',
          severity: 'warning',
          message: `${dayName} has only ${overview.freeTimeMinutes} minutes of free time.`,
          affectedDate: new Date(currentDate),
          suggestion: 'You might struggle to get focused work done.',
        });
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return alerts;
}

// ============================================================================
// SMART SCHEDULING
// ============================================================================

/**
 * Suggest optimal times for a new meeting
 */
export async function suggestMeetingTimes(
  userId: string,
  options: {
    durationMinutes: number;
    withinDays?: number;
    preferMorning?: boolean;
    preferAfternoon?: boolean;
    avoidBackToBack?: boolean;
  }
): Promise<MeetingSuggestion[]> {
  const {
    durationMinutes,
    withinDays = 7,
    preferMorning = false,
    preferAfternoon = false,
    avoidBackToBack = true,
  } = options;

  const suggestions: MeetingSuggestion[] = [];
  const startDate = new Date();

  for (let dayOffset = 0; dayOffset < withinDays; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);

    // Skip weekends
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const freeSlots = await findFreeTimeSlots(userId, checkDate, {
      minDurationMinutes: durationMinutes,
      workDayOnly: true,
    });

    const dayOverview = await getDayOverview(userId, checkDate);

    for (const slot of freeSlots) {
      if (slot.durationMinutes < durationMinutes) continue;

      const slotStartHour = slot.start.getHours();
      let score = 50; // Base score
      const considerations: string[] = [];
      const reasons: string[] = [];

      // Time of day preferences
      if (preferMorning && slotStartHour < 12) {
        score += 15;
        reasons.push('morning slot as preferred');
      } else if (preferAfternoon && slotStartHour >= 12) {
        score += 15;
        reasons.push('afternoon slot as preferred');
      }

      // Avoid early morning
      if (slotStartHour < 9) {
        score -= 10;
        considerations.push('early start time');
      }

      // Avoid late afternoon
      if (slotStartHour >= 16) {
        score -= 5;
        considerations.push('late in the day');
      }

      // Bonus for mid-morning (10-11)
      if (slotStartHour >= 10 && slotStartHour < 12) {
        score += 10;
        reasons.push('prime meeting time');
      }

      // Check back-to-back situation
      if (avoidBackToBack && dayOverview.hasBackToBack) {
        score -= 15;
        considerations.push('day already has back-to-back meetings');
      }

      // Bonus for lighter days
      if (dayOverview.totalMeetings < 3) {
        score += 10;
        reasons.push('lighter day');
      }

      // Penalty for heavy days
      if (dayOverview.isOverloaded) {
        score -= 20;
        considerations.push('day is already heavy');
      }

      // Create the meeting slot
      const meetingSlot: TimeSlot = {
        start: slot.start,
        end: new Date(slot.start.getTime() + durationMinutes * 60 * 1000),
        durationMinutes,
      };

      suggestions.push({
        slot: meetingSlot,
        reason: reasons.length > 0 ? reasons.join(', ') : 'available time',
        score: Math.max(0, Math.min(100, score)),
        considerations,
      });
    }
  }

  // Sort by score descending
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Suggest focus time blocks
 */
export async function suggestFocusBlocks(
  userId: string,
  options: {
    minDurationMinutes?: number;
    withinDays?: number;
  } = {}
): Promise<TimeSlot[]> {
  const { minDurationMinutes = 90, withinDays = 5 } = options;

  const focusBlocks: TimeSlot[] = [];
  const startDate = new Date();

  for (let dayOffset = 0; dayOffset < withinDays; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);

    // Skip weekends
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const freeSlots = await findFreeTimeSlots(userId, checkDate, {
      minDurationMinutes,
      workDayOnly: true,
    });

    // Only include substantial blocks (90+ minutes)
    for (const slot of freeSlots) {
      if (slot.durationMinutes >= minDurationMinutes) {
        focusBlocks.push(slot);
      }
    }
  }

  return focusBlocks;
}

// ============================================================================
// BRIEFINGS
// ============================================================================

/**
 * Generate a daily briefing
 */
export async function generateDailyBriefing(
  userId: string,
  date: Date = new Date()
): Promise<DailyBriefing> {
  const overview = await getDayOverview(userId, date);
  const alerts = await detectCalendarAlerts(userId, { start: date, end: date });
  const suggestions: string[] = [];

  // Generate contextual suggestions
  if (overview.isOverloaded) {
    suggestions.push('Consider declining or rescheduling non-critical meetings.');
  }

  if (overview.hasBackToBack) {
    suggestions.push('Try to grab water or stretch between meetings.');
  }

  if (overview.freeTimeMinutes >= 60 && overview.totalMeetings > 0) {
    suggestions.push(`You have ${Math.floor(overview.freeTimeMinutes / 60)} hours of focus time available.`);
  }

  if (overview.totalMeetings === 0) {
    suggestions.push('Great day for deep work or tackling that project.');
  }

  // Build summary
  let summary: string;
  if (overview.totalMeetings === 0) {
    summary = 'Clear day ahead. No meetings scheduled.';
  } else if (overview.isOverloaded) {
    summary = `Heavy day with ${overview.totalMeetings} meetings totaling ${Math.round(overview.totalMeetingMinutes / 60)} hours.`;
  } else if (overview.totalMeetings <= 2) {
    summary = `Light day with just ${overview.totalMeetings} meeting${overview.totalMeetings !== 1 ? 's' : ''}.`;
  } else {
    summary = `${overview.totalMeetings} meetings today, ${Math.round(overview.freeTimeMinutes / 60)} hours of free time.`;
  }

  return {
    date,
    summary,
    totalMeetings: overview.totalMeetings,
    alerts,
    firstMeeting: overview.firstEvent,
    focusTimeAvailable: overview.freeTimeMinutes,
    suggestions,
  };
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze calendar patterns over the past weeks
 */
export async function analyzeCalendarPatterns(
  userId: string,
  weeksToAnalyze: number = 4
): Promise<CalendarPatterns> {
  const dayMeetingCounts: Record<string, number[]> = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
  };

  const hourMeetingCounts: number[] = new Array(24).fill(0);
  let totalMeetingMinutes = 0;
  let totalWorkMinutes = 0;
  let backToBackDays = 0;
  let totalWorkDays = 0;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeksToAnalyze * 7);

  for (let weekOffset = 0; weekOffset < weeksToAnalyze; weekOffset++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + weekOffset * 7);

    const weekOverview = await getWeekOverview(userId, weekStart);

    for (const day of weekOverview.days) {
      const dayName = day.date.toLocaleDateString('en-US', { weekday: 'long' });
      const dayOfWeek = day.date.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      totalWorkDays++;
      totalMeetingMinutes += day.totalMeetingMinutes;
      totalWorkMinutes += 9 * 60; // Assume 9-hour work day

      if (day.hasBackToBack) {
        backToBackDays++;
      }

      if (dayMeetingCounts[dayName]) {
        dayMeetingCounts[dayName].push(day.totalMeetings);
      }

      // Track meeting hours
      for (const event of day.events) {
        if (!event.isAllDay) {
          const startHour = event.startTime.getHours();
          hourMeetingCounts[startHour]++;
        }
      }
    }
  }

  // Find busiest day
  let busiestDay: string | null = null;
  let highestAverage = 0;
  for (const [day, counts] of Object.entries(dayMeetingCounts)) {
    if (counts.length > 0) {
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      if (avg > highestAverage) {
        highestAverage = avg;
        busiestDay = day;
      }
    }
  }

  // Find peak hours
  let peakStart = 9;
  let peakEnd = 17;
  let maxMeetings = 0;
  for (let h = 8; h <= 17; h++) {
    if (hourMeetingCounts[h] > maxMeetings) {
      maxMeetings = hourMeetingCounts[h];
      peakStart = h;
      peakEnd = h + 1;
    }
  }

  return {
    busiestDayOfWeek: busiestDay,
    averageMeetingsPerDay: totalWorkDays > 0 ? Math.round(totalMeetingMinutes / 60 / totalWorkDays * 10) / 10 : 0,
    peakMeetingHours: { start: peakStart, end: peakEnd },
    totalMeetingHoursThisWeek: Math.round(totalMeetingMinutes / 60),
    focusTimeRatio: totalWorkMinutes > 0 ? (totalWorkMinutes - totalMeetingMinutes) / totalWorkMinutes : 1,
    backToBackFrequency: totalWorkDays > 0 ? backToBackDays / totalWorkDays : 0,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectCalendarAlerts,
  suggestMeetingTimes,
  suggestFocusBlocks,
  generateDailyBriefing,
  analyzeCalendarPatterns,
};

