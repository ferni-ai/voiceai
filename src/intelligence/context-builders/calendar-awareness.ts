/**
 * Calendar Awareness Context Builder
 *
 * Injects calendar context into conversations when Alex is active.
 * Provides proactive awareness of:
 * - Today's schedule at a glance
 * - Upcoming meetings
 * - Overload warnings
 * - Time-sensitive context
 *
 * Only activates for Alex (Communication Specialist).
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  isConnected,
  getDayOverview,
  type DayOverview,
} from '../../services/calendar/calendar-service.js';
import {
  detectCalendarAlerts,
  type CalendarAlert,
} from '../../services/calendar/calendar-intelligence.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { BuilderCategory } from './categories.js';

const log = createLogger({ module: 'context:calendar-awareness' });

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarAwarenessContext {
  isConnected: boolean;
  todayOverview?: DayOverview;
  alerts?: CalendarAlert[];
  nextMeetingIn?: number; // minutes
  contextInjection: string | null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Personas with calendar awareness (Alex is primary, others get context)
const CALENDAR_AWARE_PERSONAS = ['alex-chen', 'ferni', 'jordan-taylor'] as const;
const ALEX_PERSONA_ID = 'alex-chen';
const UPCOMING_MEETING_THRESHOLD_MINUTES = 60; // Alert if meeting within 60 min

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build calendar awareness context for calendar-aware personas
 *
 * Returns null if:
 * - Not a calendar-aware persona
 * - Calendar not connected
 * - No relevant context to inject
 *
 * Different personas get different levels of detail:
 * - Alex: Full detail (primary calendar manager)
 * - Jordan: Event planning focus (for milestone scheduling)
 * - Ferni: Light awareness (for conversation context)
 */
export async function buildCalendarAwarenessContext(
  userId: string | undefined,
  personaId: string | undefined
): Promise<CalendarAwarenessContext> {
  // Check if this persona should have calendar awareness
  if (!personaId || !CALENDAR_AWARE_PERSONAS.includes(personaId as typeof CALENDAR_AWARE_PERSONAS[number])) {
    return { isConnected: false, contextInjection: null };
  }

  if (!userId) {
    return { isConnected: false, contextInjection: null };
  }

  // Check calendar connection
  const connected = await isConnected(userId);
  if (!connected) {
    // Only Alex suggests connecting
    if (personaId === ALEX_PERSONA_ID) {
      return {
        isConnected: false,
        contextInjection: '[CALENDAR: Not connected. If user asks about calendar, suggest connecting.]',
      };
    }
    return { isConnected: false, contextInjection: null };
  }

  try {
    // Get today's overview
    const todayOverview = await getDayOverview(userId, new Date());

    // Get any alerts for today
    const today = new Date();
    const alerts = await detectCalendarAlerts(userId, { start: today, end: today });

    // Calculate next meeting time
    let nextMeetingIn: number | undefined;
    if (todayOverview.firstEvent) {
      const now = new Date();
      const firstEventStart = todayOverview.firstEvent.startTime;
      if (firstEventStart > now) {
        nextMeetingIn = Math.round((firstEventStart.getTime() - now.getTime()) / 60000);
      }
    }

    // Build contextual injection based on persona
    const contextInjection = buildContextInjectionForPersona(
      personaId,
      todayOverview,
      alerts,
      nextMeetingIn
    );

    log.debug({ userId, personaId, hasContext: !!contextInjection }, 'Calendar awareness context built');

    return {
      isConnected: true,
      todayOverview,
      alerts,
      nextMeetingIn,
      contextInjection,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to build calendar awareness context');
    return {
      isConnected: true,
      contextInjection: null,
    };
  }
}

/**
 * Build context injection tailored to each persona's needs
 */
function buildContextInjectionForPersona(
  personaId: string,
  overview: DayOverview,
  alerts: CalendarAlert[],
  nextMeetingIn?: number
): string | null {
  switch (personaId) {
    case 'alex-chen':
      // Alex gets full calendar detail - she's the Chief of Staff
      return buildContextInjectionText(overview, alerts, nextMeetingIn);

    case 'jordan-taylor':
      // Jordan gets event-planning focused context
      return buildJordanCalendarContext(overview, alerts);

    case 'ferni':
      // Ferni gets light awareness for conversation context
      return buildFerniCalendarContext(overview, nextMeetingIn);

    default:
      return null;
  }
}

/**
 * Build Jordan's calendar context (event planning focus)
 */
function buildJordanCalendarContext(
  overview: DayOverview,
  alerts: CalendarAlert[]
): string | null {
  const parts: string[] = [];

  // Jordan cares about free time for planning new events
  if (overview.totalMeetings === 0) {
    parts.push('[SCHEDULE: Clear day - great time to plan celebrations or events]');
  } else {
    const freeHours = Math.round(overview.freeTimeMinutes / 60);
    if (freeHours >= 2) {
      parts.push(`[SCHEDULE: ${overview.totalMeetings} meetings but ${freeHours}h free for planning]`);
    } else if (overview.isOverloaded) {
      parts.push('[SCHEDULE: Packed day - if planning events, suggest another day]');
    }
  }

  // Jordan cares about upcoming milestones/events in alerts
  const eventAlerts = alerts.filter(
    (a) => a.message.toLowerCase().includes('birthday') ||
           a.message.toLowerCase().includes('anniversary') ||
           a.message.toLowerCase().includes('event')
  );
  if (eventAlerts.length > 0) {
    parts.push(`[EVENT ALERT: ${eventAlerts[0].message}]`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Build Ferni's calendar context (light awareness)
 */
function buildFerniCalendarContext(
  overview: DayOverview,
  nextMeetingIn?: number
): string | null {
  // Ferni just needs to know if user is busy/stressed or has time to chat

  if (overview.isOverloaded) {
    return '[USER CONTEXT: Heavy schedule today - may be stressed about time]';
  }

  if (nextMeetingIn !== undefined && nextMeetingIn > 0 && nextMeetingIn <= 15) {
    return '[USER CONTEXT: Meeting starting soon - keep this brief]';
  }

  if (overview.totalMeetings === 0) {
    return '[USER CONTEXT: Calendar is clear today - good time for deeper conversation]';
  }

  return null; // Normal day, no special context needed
}

/**
 * Build the actual text to inject into the context
 */
function buildContextInjectionText(
  overview: DayOverview,
  alerts: CalendarAlert[],
  nextMeetingIn?: number
): string | null {
  const parts: string[] = [];

  // Calendar snapshot
  if (overview.totalMeetings > 0) {
    parts.push(`[CALENDAR: ${overview.totalMeetings} meeting${overview.totalMeetings !== 1 ? 's' : ''} today`);

    if (overview.firstEvent) {
      const time = overview.firstEvent.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      parts[parts.length - 1] += `. First: ${overview.firstEvent.title} at ${time}`;
    }

    if (overview.freeTimeMinutes > 0) {
      const freeHours = Math.round(overview.freeTimeMinutes / 60 * 10) / 10;
      parts[parts.length - 1] += `. ${freeHours}h free time`;
    }

    parts[parts.length - 1] += ']';
  } else {
    parts.push('[CALENDAR: Clear day, no meetings scheduled]');
  }

  // Immediate alert if meeting coming up soon
  if (nextMeetingIn !== undefined && nextMeetingIn <= UPCOMING_MEETING_THRESHOLD_MINUTES && nextMeetingIn > 0) {
    const eventTitle = overview.firstEvent?.title || 'meeting';
    parts.push(`[HEADS UP: ${eventTitle} starts in ${nextMeetingIn} minutes]`);
  }

  // Priority alerts
  const priorityAlerts = alerts.filter((a) => a.severity === 'concern' || a.severity === 'warning');
  if (priorityAlerts.length > 0) {
    const alertTexts = priorityAlerts.map((a) => a.message).slice(0, 2); // Max 2 alerts
    parts.push(`[ALERT: ${alertTexts.join('. ')}]`);
  }

  // Overload warning
  if (overview.isOverloaded) {
    parts.push('[WARNING: Heavy day - user may be stressed about time]');
  }

  // Back-to-back warning
  if (overview.hasBackToBack && !overview.isOverloaded) {
    parts.push('[NOTE: Back-to-back meetings today - breaks limited]');
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join('\n');
}

/**
 * Format calendar context for speech output (used by tools)
 */
export function formatCalendarContextForSpeech(context: CalendarAwarenessContext): string {
  if (!context.isConnected) {
    return 'Calendar not connected.';
  }

  if (!context.todayOverview) {
    return 'Calendar connected but no data available.';
  }

  const { todayOverview, nextMeetingIn } = context;
  const parts: string[] = [];

  if (todayOverview.totalMeetings === 0) {
    parts.push('Your calendar is clear today.');
  } else {
    parts.push(`You have ${todayOverview.totalMeetings} meeting${todayOverview.totalMeetings !== 1 ? 's' : ''} today.`);

    if (nextMeetingIn !== undefined && nextMeetingIn > 0 && nextMeetingIn <= 60) {
      const eventTitle = todayOverview.firstEvent?.title || 'Your next meeting';
      parts.push(`${eventTitle} starts in ${nextMeetingIn} minutes.`);
    }
  }

  if (todayOverview.isOverloaded) {
    parts.push('It looks like a packed day.');
  }

  return parts.join(' ');
}

// ============================================================================
// CONTEXT BUILDER REGISTRATION
// ============================================================================

/**
 * Calendar Awareness Context Builder
 *
 * Injects calendar snapshot for calendar-aware personas:
 * - Alex: Full detail (primary)
 * - Jordan: Event planning focus
 * - Ferni: Light awareness
 */
export const calendarAwarenessBuilder: ContextBuilder = {
  name: 'calendar-awareness',
  description: 'Provides calendar context for Alex, Jordan, and Ferni',
  priority: 55, // Mid-priority - runs after safety/emotional but before humanizing
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, services } = input;

    const personaId = persona?.identity?.id;

    // Check if this persona should have calendar awareness
    if (!personaId || !CALENDAR_AWARE_PERSONAS.includes(personaId as typeof CALENDAR_AWARE_PERSONAS[number])) {
      return [];
    }

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    const context = await buildCalendarAwarenessContext(userId, personaId);

    if (!context.contextInjection) {
      return [];
    }

    log.debug({ userId, personaId, connected: context.isConnected }, 'Calendar awareness context injected');

    return [
      createStandardInjection('calendar_awareness', context.contextInjection, {
        category: 'calendar',
      }),
    ];
  },
};

// Self-register on module load
registerContextBuilder(calendarAwarenessBuilder);

export default buildCalendarAwarenessContext;

