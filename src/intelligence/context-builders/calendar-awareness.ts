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

const ALEX_PERSONA_ID = 'alex-chen';
const UPCOMING_MEETING_THRESHOLD_MINUTES = 60; // Alert if meeting within 60 min

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build calendar awareness context for Alex
 *
 * Returns null if:
 * - Not Alex persona
 * - Calendar not connected
 * - No relevant context to inject
 */
export async function buildCalendarAwarenessContext(
  userId: string | undefined,
  personaId: string | undefined
): Promise<CalendarAwarenessContext> {
  // Only activate for Alex
  if (personaId !== ALEX_PERSONA_ID) {
    return { isConnected: false, contextInjection: null };
  }

  if (!userId) {
    return { isConnected: false, contextInjection: null };
  }

  // Check calendar connection
  const connected = await isConnected(userId);
  if (!connected) {
    return {
      isConnected: false,
      contextInjection: '[CALENDAR: Not connected. If user asks about calendar, suggest connecting.]',
    };
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

    // Build contextual injection
    const contextInjection = buildContextInjectionText(todayOverview, alerts, nextMeetingIn);

    log.debug({ userId, hasContext: !!contextInjection }, 'Calendar awareness context built');

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
 * Injects calendar snapshot when Alex is active and calendar is connected.
 */
export const calendarAwarenessBuilder: ContextBuilder = {
  name: 'calendar-awareness',
  description: 'Provides calendar context for Alex (schedule, meetings, alerts)',
  priority: 55, // Mid-priority - runs after safety/emotional but before humanizing
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, services } = input;

    // Only activate for Alex
    if (persona?.identity?.id !== ALEX_PERSONA_ID) {
      return [];
    }

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    const context = await buildCalendarAwarenessContext(userId, persona.identity.id);

    if (!context.contextInjection) {
      return [];
    }

    log.debug({ userId, connected: context.isConnected }, 'Calendar awareness context injected');

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

