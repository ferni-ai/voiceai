/**
 * Practice-Calendar Bridge Service
 *
 * Integrates custom practices with the calendar system:
 * - Creates recurring calendar events for practices
 * - Suggests optimal times based on free slots
 * - Provides pre-practice briefings
 * - Analyzes patterns to suggest new practices
 *
 * @module calendar/practice-calendar
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  findFreeTimeSlots,
  getEventsForDay,
  type TimeSlot,
} from './calendar-service.js';
import {
  createEvent,
  deleteEvent,
} from './unified-calendar-store.js';
import type { CreateEventInput, CalendarEvent } from './types.js';
import { analyzeCalendarPatterns } from './calendar-intelligence.js';

const log = createLogger({ module: 'PracticeCalendar' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Practice frequency options
 */
export type PracticeFrequency = 'daily' | 'weekday' | 'weekend' | 'weekly';

/**
 * Preferred time of day for practice
 */
export type PracticeTimePreference = 'morning' | 'afternoon' | 'evening' | 'anytime';

/**
 * A practice with calendar integration
 */
export interface CalendarPractice {
  id: string;
  userId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  frequency: PracticeFrequency;
  preferredTime: PracticeTimePreference;

  // Calendar integration
  scheduleInCalendar: boolean;
  specificTime?: { hour: number; minute: number };
  reminderMinutes?: number[];
  calendarEventIds?: string[];

  // Tracking
  streak: number;
  lastCompletedAt?: string;
  completedDates: string[];
  createdAt: string;
  updatedAt: string;

  // Persona association
  personaId?: string;
}

/**
 * Suggested time slot for a practice
 */
export interface PracticeSuggestion {
  time: Date;
  durationMinutes: number;
  confidence: number;
  reasoning: string;
  slot: TimeSlot;
}

/**
 * Pre-practice briefing to prepare user
 */
export interface PrePracticeBriefing {
  practiceId: string;
  practiceName: string;
  startsAt: Date;
  minutesUntil: number;
  briefing: {
    greeting: string;
    lastSession?: string;
    streak: number;
    encouragement: string;
    prepTips?: string[];
  };
}

/**
 * Pattern-based practice suggestion
 */
export interface PracticeSuggestionFromPattern {
  title: string;
  description: string;
  suggestedFrequency: PracticeFrequency;
  suggestedTime: PracticeTimePreference;
  specificTime?: { hour: number; minute: number };
  durationMinutes: number;
  reasoning: string;
  confidence: number;
}

// ============================================================================
// RECURRENCE RULE HELPERS
// ============================================================================

/**
 * Convert practice frequency to iCal RRULE format
 */
export function frequencyToRRule(frequency: PracticeFrequency): string {
  switch (frequency) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekday':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekend':
      return 'FREQ=WEEKLY;BYDAY=SA,SU';
    case 'weekly':
      return 'FREQ=WEEKLY';
    default:
      return 'FREQ=DAILY';
  }
}

/**
 * Get preferred hour range for a time preference
 */
function getTimePreferenceHours(preference: PracticeTimePreference): { start: number; end: number } {
  switch (preference) {
    case 'morning':
      return { start: 6, end: 11 };
    case 'afternoon':
      return { start: 12, end: 17 };
    case 'evening':
      return { start: 18, end: 22 };
    case 'anytime':
    default:
      return { start: 8, end: 20 };
  }
}

// ============================================================================
// SMART TIME SUGGESTIONS
// ============================================================================

/**
 * Suggest optimal times for a practice based on calendar free slots
 *
 * Analyzes the user's calendar to find the best times that match
 * their preferred time of day.
 */
export async function suggestPracticeTimes(
  userId: string,
  options: {
    durationMinutes: number;
    preferredTime: PracticeTimePreference;
    frequency: PracticeFrequency;
    daysToCheck?: number;
  }
): Promise<PracticeSuggestion[]> {
  const { durationMinutes, preferredTime, frequency, daysToCheck = 7 } = options;
  const suggestions: PracticeSuggestion[] = [];

  try {
    const preferredHours = getTimePreferenceHours(preferredTime);

    // Check multiple days to find consistent patterns
    for (let dayOffset = 0; dayOffset < daysToCheck; dayOffset++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() + dayOffset);

      // Skip based on frequency
      const dayOfWeek = checkDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (frequency === 'weekday' && isWeekend) continue;
      if (frequency === 'weekend' && !isWeekend) continue;
      if (frequency === 'weekly' && dayOfWeek !== 1) continue; // Mondays for weekly

      // Find free slots
      const freeSlots = await findFreeTimeSlots(userId, checkDate, {
        minDurationMinutes: durationMinutes,
        workDayOnly: preferredTime !== 'anytime',
      });

      // Filter by preferred time
      for (const slot of freeSlots) {
        const slotHour = slot.start.getHours();

        if (slotHour >= preferredHours.start && slotHour < preferredHours.end) {
          // Calculate confidence based on time match
          const idealHour = (preferredHours.start + preferredHours.end) / 2;
          const hourDiff = Math.abs(slotHour - idealHour);
          const confidence = Math.max(0.5, 1 - hourDiff * 0.1);

          suggestions.push({
            time: slot.start,
            durationMinutes,
            confidence,
            reasoning: generateTimeReasoning(slot, preferredTime, checkDate),
            slot,
          });
        }
      }
    }

    // Sort by confidence and return top suggestions
    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to suggest practice times');
    return [];
  }
}

function generateTimeReasoning(
  slot: TimeSlot,
  preferredTime: PracticeTimePreference,
  date: Date
): string {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const timeStr = slot.start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const freeMinutes = slot.durationMinutes;

  if (freeMinutes >= 60) {
    return `${dayName} at ${timeStr} has ${Math.round(freeMinutes / 60)} hour(s) free – perfect for a ${preferredTime} practice`;
  }
  return `${dayName} at ${timeStr} shows ${freeMinutes} minutes of open time`;
}

// ============================================================================
// CALENDAR EVENT CREATION
// ============================================================================

/**
 * Create calendar events for a practice
 *
 * Creates recurring events in the user's calendar with appropriate
 * reminders and recurrence rules.
 */
export async function createPracticeCalendarEvents(
  userId: string,
  practice: CalendarPractice
): Promise<string[]> {
  if (!practice.scheduleInCalendar) {
    return [];
  }

  try {
    const eventIds: string[] = [];
    const startDate = calculateFirstOccurrence(practice);

    const eventInput: CreateEventInput = {
      title: `${getPracticeEmoji(practice.preferredTime)} ${practice.name}`,
      description: generatePracticeDescription(practice),
      startTime: startDate,
      durationMinutes: practice.durationMinutes,
      reminders:
        practice.reminderMinutes?.map((mins) => ({
          method: 'popup' as const,
          minutesBefore: mins,
        })) || [{ method: 'popup' as const, minutesBefore: 5 }],
      recurrence: frequencyToRRule(practice.frequency),
    };

    const event = await createEvent(userId, eventInput);

    if (event?.id) {
      eventIds.push(event.id);
      log.info(
        { userId, practiceId: practice.id, eventId: event.id },
        'Created calendar event for practice'
      );
    }

    return eventIds;
  } catch (error) {
    log.error({ error: String(error), userId, practiceId: practice.id }, 'Failed to create practice calendar events');
    return [];
  }
}

function getPracticeEmoji(preferredTime: PracticeTimePreference): string {
  switch (preferredTime) {
    case 'morning':
      return '🌅';
    case 'afternoon':
      return '☀️';
    case 'evening':
      return '🌙';
    default:
      return '✨';
  }
}

function generatePracticeDescription(practice: CalendarPractice): string {
  let description = practice.description || 'Time for your practice';
  description += '\n\n';
  description += `⏱️ Duration: ${practice.durationMinutes} minutes\n`;
  description += `📅 Frequency: ${practice.frequency}\n`;
  if (practice.streak > 0) {
    description += `🔥 Current streak: ${practice.streak} days\n`;
  }
  description += '\n— Scheduled with Ferni';
  return description;
}

function calculateFirstOccurrence(practice: CalendarPractice): Date {
  const now = new Date();
  const targetDate = new Date(now);

  // Set to specific time or preferred time slot
  if (practice.specificTime) {
    targetDate.setHours(practice.specificTime.hour, practice.specificTime.minute, 0, 0);
  } else {
    const hours = getTimePreferenceHours(practice.preferredTime);
    targetDate.setHours(hours.start + 1, 0, 0, 0); // Default to start + 1 hour
  }

  // If time already passed today, move to next valid day
  if (targetDate <= now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  // Adjust for frequency
  const dayOfWeek = targetDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (practice.frequency === 'weekday' && isWeekend) {
    // Move to Monday
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    targetDate.setDate(targetDate.getDate() + daysUntilMonday);
  } else if (practice.frequency === 'weekend' && !isWeekend) {
    // Move to Saturday
    const daysUntilSaturday = 6 - dayOfWeek;
    targetDate.setDate(targetDate.getDate() + daysUntilSaturday);
  }

  return targetDate;
}

/**
 * Delete calendar events for a practice
 */
export async function deletePracticeCalendarEvents(
  userId: string,
  eventIds: string[]
): Promise<void> {
  for (const eventId of eventIds) {
    try {
      await deleteEvent(userId, eventId);
      log.debug({ userId, eventId }, 'Deleted practice calendar event');
    } catch (error) {
      log.warn({ error: String(error), eventId }, 'Failed to delete practice event');
    }
  }
}

// ============================================================================
// PRE-PRACTICE BRIEFINGS
// ============================================================================

/**
 * Get pre-practice briefings for upcoming practices
 *
 * Returns briefings for practices starting within the specified window,
 * with encouragement and streak information.
 */
export async function getUpcomingPracticeBriefings(
  userId: string,
  practices: CalendarPractice[],
  windowMinutes = 60
): Promise<PrePracticeBriefing[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);
  const briefings: PrePracticeBriefing[] = [];

  try {
    // Get today's calendar events to find scheduled practices
    const dayEvents = await getEventsForDay(userId, now);

    for (const practice of practices) {
      if (!practice.scheduleInCalendar || !practice.calendarEventIds?.length) {
        continue;
      }

      // Find the matching calendar event
      const practiceEvent = dayEvents.find(
        (e) => practice.calendarEventIds?.includes(e.id) || e.title.includes(practice.name)
      );

      if (!practiceEvent) continue;

      const startTime =
        practiceEvent.startTime instanceof Date
          ? practiceEvent.startTime
          : new Date(practiceEvent.startTime);

      // Check if within window
      if (startTime < now || startTime > windowEnd) continue;

      const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);

      briefings.push({
        practiceId: practice.id,
        practiceName: practice.name,
        startsAt: startTime,
        minutesUntil,
        briefing: generatePracticeBriefing(practice, minutesUntil),
      });
    }

    return briefings.sort((a, b) => a.minutesUntil - b.minutesUntil);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get practice briefings');
    return [];
  }
}

function generatePracticeBriefing(
  practice: CalendarPractice,
  minutesUntil: number
): PrePracticeBriefing['briefing'] {
  const greetings = [
    `${practice.name} starts in ${minutesUntil} minutes`,
    `Getting ready for ${practice.name}?`,
    `${minutesUntil} minutes until your ${practice.name}`,
  ];

  const encouragements: string[] = [];

  if (practice.streak > 0) {
    if (practice.streak >= 30) {
      encouragements.push(
        `Amazing – you've done this for ${practice.streak} days straight. You're building something real.`
      );
    } else if (practice.streak >= 7) {
      encouragements.push(
        `${practice.streak} days in a row! Your consistency is inspiring.`
      );
    } else if (practice.streak >= 3) {
      encouragements.push(`${practice.streak} day streak – keep it going!`);
    } else {
      encouragements.push(`Day ${practice.streak + 1} of your practice. Small steps matter.`);
    }
  } else {
    encouragements.push(
      'Every journey starts with a single step.',
      "You showed up. That's what matters.",
      "Ready when you are."
    );
  }

  const prepTips = getPracticePrepTips(practice);

  return {
    greeting: greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0] ?? '',
    lastSession: practice.lastCompletedAt
      ? formatLastSession(practice.lastCompletedAt)
      : undefined,
    streak: practice.streak,
    encouragement: encouragements[Math.floor(Math.random() * encouragements.length)] ?? '',
    prepTips: prepTips.length > 0 ? prepTips : undefined,
  };
}

function formatLastSession(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Last session: earlier today';
  if (diffDays === 1) return 'Last session: yesterday';
  if (diffDays < 7) return `Last session: ${diffDays} days ago`;
  return `Last session: ${date.toLocaleDateString()}`;
}

function getPracticePrepTips(practice: CalendarPractice): string[] {
  const tips: string[] = [];

  // Time-based tips
  if (practice.preferredTime === 'morning') {
    tips.push('Take a deep breath before starting');
    tips.push('Notice how you feel right now');
  } else if (practice.preferredTime === 'evening') {
    tips.push('Let go of the day');
    tips.push('Find a comfortable spot');
  }

  // Duration-based tips
  if (practice.durationMinutes <= 2) {
    tips.push(`Just ${practice.durationMinutes} minutes – fully doable`);
  } else if (practice.durationMinutes >= 10) {
    tips.push('Put your phone on do not disturb');
    tips.push('Make yourself comfortable');
  }

  return tips.slice(0, 2);
}

// ============================================================================
// PATTERN-BASED SUGGESTIONS
// ============================================================================

/**
 * Analyze calendar patterns to suggest new practices
 *
 * Uses calendar intelligence to identify opportunities for practices
 * based on the user's schedule patterns.
 */
export async function suggestPracticesFromPatterns(
  userId: string
): Promise<PracticeSuggestionFromPattern[]> {
  const suggestions: PracticeSuggestionFromPattern[] = [];

  try {
    const patterns = await analyzeCalendarPatterns(userId);

    // Suggest breathing practice for back-to-back heavy days
    // backToBackFrequency is 0-1 scale (how often back-to-back occurs)
    if (patterns.backToBackFrequency > 0.3) {
      suggestions.push({
        title: 'Meeting Recovery',
        description: 'A quick reset between back-to-back meetings',
        suggestedFrequency: 'weekday',
        suggestedTime: 'afternoon',
        durationMinutes: 2,
        reasoning: `You often have back-to-back meetings. A 2-minute reset can help you transition.`,
        confidence: 0.85,
      });
    }

    // Suggest morning practice for busy days
    if (patterns.averageMeetingsPerDay >= 4) {
      suggestions.push({
        title: 'Morning Intention',
        description: 'Set your intention before the day begins',
        suggestedFrequency: 'weekday',
        suggestedTime: 'morning',
        specificTime: { hour: 7, minute: 30 },
        durationMinutes: 5,
        reasoning: `Your days average ${Math.round(patterns.averageMeetingsPerDay)} meetings. Starting with intention helps.`,
        confidence: 0.9,
      });
    }

    // Suggest evening reflection for everyone with significant calendar activity
    if (patterns.totalMeetingHoursThisWeek > 10) {
      suggestions.push({
        title: 'Evening Reflection',
        description: 'Process the day and prepare for tomorrow',
        suggestedFrequency: 'daily',
        suggestedTime: 'evening',
        specificTime: { hour: 20, minute: 0 },
        durationMinutes: 5,
        reasoning: `A moment of reflection helps consolidate learning from busy days.`,
        confidence: 0.75,
      });
    }

    // Suggest weekly review when focus time is low
    if (patterns.focusTimeRatio < 0.4) {
      suggestions.push({
        title: 'Weekly Planning',
        description: 'Review the week and set priorities',
        suggestedFrequency: 'weekly',
        suggestedTime: 'morning',
        specificTime: { hour: 9, minute: 0 },
        durationMinutes: 15,
        reasoning: `Your focus time is limited. A planning session on Monday can help protect it.`,
        confidence: 0.8,
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to suggest practices from patterns');
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  suggestPracticeTimes,
  createPracticeCalendarEvents,
  deletePracticeCalendarEvents,
  getUpcomingPracticeBriefings,
  suggestPracticesFromPatterns,
  frequencyToRRule,
};

