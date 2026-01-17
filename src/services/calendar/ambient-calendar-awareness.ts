/**
 * Ambient Calendar Awareness
 *
 * Provides real-time awareness of calendar context during conversations.
 * This enables "better than human" presence - knowing when:
 * - A meeting is coming up (so conversations can wrap up naturally)
 * - A meeting just ended (so we can ask how it went)
 * - The user is currently in a meeting (rare but possible)
 *
 * No human friend tracks your calendar this closely. Ferni does.
 *
 * @module calendar/ambient-calendar-awareness
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getEventsForDay,
  getDayOverview,
  isConnected,
  type CalendarEvent,
} from './calendar-service.js';

const log = createLogger({ module: 'ambient-calendar' });

// ============================================================================
// TYPES
// ============================================================================

export interface AmbientCalendarContext {
  // Connection status
  isCalendarConnected: boolean;

  // Upcoming meeting awareness
  nextMeeting: {
    event: CalendarEvent | null;
    minutesUntil: number | null;
    shouldWarnUser: boolean;
    wrapUpSuggestion: string | null;
  };

  // Recent meeting awareness
  justEndedMeeting: {
    event: CalendarEvent | null;
    minutesSince: number | null;
    followUpPrompt: string | null;
  };

  // Current state
  currentlyInMeeting: boolean;
  currentMeeting: CalendarEvent | null;

  // Day context
  remainingMeetingsToday: number;
  nextBreakDuration: number | null; // minutes until next free period
  totalRemainingMeetingMinutes: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const WARN_MINUTES_BEFORE = 10; // Warn when meeting is within 10 minutes
const WRAP_UP_MINUTES = 5; // Suggest wrapping up at 5 minutes
const POST_MEETING_WINDOW = 15; // Ask about meetings ended within 15 min
const HIGH_PRIORITY_KEYWORDS = [
  'interview',
  'review',
  'presentation',
  'board',
  'client',
  'important',
  '1:1',
  'one-on-one',
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get ambient calendar context for the current moment
 *
 * Called at the start of each conversation turn to inject
 * calendar awareness into the agent's context.
 */
export async function getAmbientCalendarContext(userId: string): Promise<AmbientCalendarContext> {
  // Check if calendar is connected
  const connected = await isConnected(userId);

  const emptyContext: AmbientCalendarContext = {
    isCalendarConnected: connected,
    nextMeeting: {
      event: null,
      minutesUntil: null,
      shouldWarnUser: false,
      wrapUpSuggestion: null,
    },
    justEndedMeeting: {
      event: null,
      minutesSince: null,
      followUpPrompt: null,
    },
    currentlyInMeeting: false,
    currentMeeting: null,
    remainingMeetingsToday: 0,
    nextBreakDuration: null,
    totalRemainingMeetingMinutes: 0,
  };

  if (!connected) {
    return emptyContext;
  }

  try {
    const now = new Date();
    const events = await getEventsForDay(userId, now);

    // Filter out all-day events and sort by start time
    const timedEvents = events
      .filter((e) => !e.isAllDay)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Find current meeting (if any)
    const currentMeeting = timedEvents.find((e) => e.startTime <= now && e.endTime > now);

    // Find next upcoming meeting
    const upcomingEvents = timedEvents.filter((e) => e.startTime > now);
    const nextEvent = upcomingEvents[0] || null;

    // Find just-ended meeting
    const recentEvents = timedEvents.filter((e) => {
      const minutesSince = (now.getTime() - e.endTime.getTime()) / 60000;
      return minutesSince >= 0 && minutesSince <= POST_MEETING_WINDOW;
    });
    const justEndedEvent = recentEvents[recentEvents.length - 1] || null;

    // Calculate metrics
    let minutesUntilNext: number | null = null;
    let shouldWarnUser = false;
    let wrapUpSuggestion: string | null = null;

    if (nextEvent) {
      minutesUntilNext = Math.round((nextEvent.startTime.getTime() - now.getTime()) / 60000);
      shouldWarnUser = minutesUntilNext <= WARN_MINUTES_BEFORE;

      if (minutesUntilNext <= WRAP_UP_MINUTES) {
        wrapUpSuggestion = generateWrapUpSuggestion(nextEvent, minutesUntilNext);
      }
    }

    // Calculate minutes since last meeting ended
    let minutesSinceEnded: number | null = null;
    let followUpPrompt: string | null = null;

    if (justEndedEvent && !currentMeeting) {
      minutesSinceEnded = Math.round((now.getTime() - justEndedEvent.endTime.getTime()) / 60000);
      followUpPrompt = generateFollowUpPrompt(justEndedEvent);
    }

    // Calculate remaining meetings
    const remainingMeetings = upcomingEvents.length;
    const totalRemainingMinutes = upcomingEvents.reduce((sum, e) => {
      return sum + (e.endTime.getTime() - e.startTime.getTime()) / 60000;
    }, 0);

    // Calculate next break duration
    let nextBreakDuration: number | null = null;
    if (currentMeeting && upcomingEvents.length > 0) {
      const breakStart = currentMeeting.endTime;
      const breakEnd = upcomingEvents[0].startTime;
      nextBreakDuration = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);
    }

    return {
      isCalendarConnected: true,
      nextMeeting: {
        event: nextEvent,
        minutesUntil: minutesUntilNext,
        shouldWarnUser,
        wrapUpSuggestion,
      },
      justEndedMeeting: {
        event: justEndedEvent,
        minutesSince: minutesSinceEnded,
        followUpPrompt,
      },
      currentlyInMeeting: !!currentMeeting,
      currentMeeting: currentMeeting || null,
      remainingMeetingsToday: remainingMeetings,
      nextBreakDuration,
      totalRemainingMeetingMinutes: Math.round(totalRemainingMinutes),
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get ambient calendar context');
    return emptyContext;
  }
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

/**
 * Generate context injection string for the LLM
 *
 * Returns null if there's nothing noteworthy to inject.
 */
export function generateAmbientContextInjection(context: AmbientCalendarContext): string | null {
  if (!context.isCalendarConnected) {
    return null;
  }

  const lines: string[] = [];

  // Immediate priority: meeting very soon
  if (context.nextMeeting.shouldWarnUser && context.nextMeeting.minutesUntil !== null) {
    const mins = context.nextMeeting.minutesUntil;
    const title = context.nextMeeting.event?.title || 'a meeting';

    if (mins <= 2) {
      lines.push(
        `⚠️ USER HAS "${title}" STARTING IN ${mins} MINUTE${mins !== 1 ? 'S' : ''}. ` +
          'Wrap up NOW or offer to continue after.'
      );
    } else if (mins <= 5) {
      lines.push(
        `⏰ User has "${title}" in ${mins} minutes. ` +
          'Be concise. Offer to continue later if needed.'
      );
    } else {
      lines.push(
        `📅 User has "${title}" in ${mins} minutes. ` + 'Keep this in mind for conversation pacing.'
      );
    }
  }

  // Currently in a meeting
  if (context.currentlyInMeeting && context.currentMeeting) {
    lines.push(
      `📍 User is currently in "${context.currentMeeting.title}". ` +
        'They might be multitasking - be extra concise.'
    );
  }

  // Just finished a meeting worth asking about
  if (context.justEndedMeeting.event && context.justEndedMeeting.followUpPrompt) {
    const { title } = context.justEndedMeeting.event;
    const mins = context.justEndedMeeting.minutesSince;

    if (isHighPriorityMeeting(context.justEndedMeeting.event)) {
      lines.push(
        `💬 User just finished "${title}" ${mins} minutes ago. ` +
          `Consider asking: "${context.justEndedMeeting.followUpPrompt}"`
      );
    }
  }

  // Heavy remaining day
  if (context.remainingMeetingsToday >= 4 && context.totalRemainingMeetingMinutes > 180) {
    lines.push(
      `📊 User has ${context.remainingMeetingsToday} more meetings today ` +
        `(${Math.round(context.totalRemainingMeetingMinutes / 60)}h). Consider their energy.`
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Generate a human-readable summary for the user
 */
export function generateAmbientSummaryForUser(context: AmbientCalendarContext): string | null {
  if (!context.isCalendarConnected) {
    return null;
  }

  if (context.nextMeeting.event && context.nextMeeting.minutesUntil !== null) {
    const mins = context.nextMeeting.minutesUntil;
    if (mins <= 5) {
      return `You have ${context.nextMeeting.event.title} in ${mins} minute${mins !== 1 ? 's' : ''}.`;
    }
  }

  return null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate wrap-up suggestion based on meeting type
 */
function generateWrapUpSuggestion(event: CalendarEvent, minutesUntil: number): string {
  const title = event.title.toLowerCase();

  if (title.includes('interview')) {
    return `Time to get ready for your interview in ${minutesUntil} minutes. Good luck!`;
  }
  if (title.includes('presentation') || title.includes('demo')) {
    return `Your presentation is in ${minutesUntil} minutes. Take a moment to center yourself.`;
  }
  if (title.includes('client') || title.includes('customer')) {
    return `Client meeting in ${minutesUntil} minutes. Let me know if you want to continue after.`;
  }

  return `You have "${event.title}" in ${minutesUntil} minutes. Want to wrap up or continue after?`;
}

/**
 * Generate follow-up prompt based on meeting type
 */
function generateFollowUpPrompt(event: CalendarEvent): string {
  const title = event.title.toLowerCase();

  if (title.includes('interview')) {
    return 'How did the interview go?';
  }
  if (title.includes('review') || title.includes('performance')) {
    return 'How did your review go?';
  }
  if (title.includes('presentation') || title.includes('demo')) {
    return 'How did your presentation go?';
  }
  if (title.includes('1:1') || title.includes('one-on-one')) {
    return 'How was your 1:1?';
  }
  if (title.includes('client') || title.includes('customer')) {
    return 'How did the client meeting go?';
  }

  // Default - only ask for longer meetings
  const durationMinutes = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
  if (durationMinutes >= 60) {
    return 'How was your meeting?';
  }

  return 'Everything go okay with your meeting?';
}

/**
 * Check if a meeting is high priority (worth asking about)
 */
function isHighPriorityMeeting(event: CalendarEvent): boolean {
  const title = event.title.toLowerCase();
  const description = (event.description || '').toLowerCase();

  for (const keyword of HIGH_PRIORITY_KEYWORDS) {
    if (title.includes(keyword) || description.includes(keyword)) {
      return true;
    }
  }

  // Also consider long meetings high priority
  const durationMinutes = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
  return durationMinutes >= 60;
}

/**
 * Check if we should interrupt/notify about calendar
 */
export function shouldInterruptForCalendar(context: AmbientCalendarContext): boolean {
  // Only interrupt for imminent meetings
  return (
    context.nextMeeting.shouldWarnUser &&
    context.nextMeeting.minutesUntil !== null &&
    context.nextMeeting.minutesUntil <= 3
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ambientCalendarAwareness = {
  getContext: getAmbientCalendarContext,
  generateInjection: generateAmbientContextInjection,
  generateSummary: generateAmbientSummaryForUser,
  shouldInterrupt: shouldInterruptForCalendar,
};

export default ambientCalendarAwareness;
