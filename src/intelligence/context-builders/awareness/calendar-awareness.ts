/**
 * Calendar Awareness Context Builder
 *
 * Injects calendar context into conversations for ALL personas.
 * Each persona gets a tailored level of detail based on their specialty:
 *
 * PERSONA DETAIL LEVELS:
 * - alex-chen:    'full'      - Full calendar management (primary calendar persona)
 * - jordan-taylor: 'events'   - Event planning and celebration focus
 * - ferni:        'awareness' - General awareness for life coaching context
 * - maya-patel:   'habits'    - Habit-related schedule awareness
 * - peter-john:   'research'  - Research and focus time scheduling
 * - nayan-kumar:  'wisdom'    - Life rhythm and balance awareness
 *
 * ENHANCED WITH "BETTER THAN HUMAN" CAPABILITIES:
 * - Ambient calendar awareness (meeting starting soon, just ended)
 * - Calendar load factors (burnout detection)
 * - Recovery protection (proactive rest suggestions)
 *
 * Alex gets full BTH features, other personas get tiered awareness.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  isConnected,
  getDayOverview,
  type DayOverview,
} from '../../../services/calendar/calendar-service.js';
import {
  detectCalendarAlerts,
  type CalendarAlert,
} from '../../../services/calendar/calendar-intelligence.js';
// Better Than Human calendar services
import {
  getAmbientCalendarContext,
  generateAmbientContextInjection,
  shouldInterruptForCalendar,
  type AmbientCalendarContext,
} from '../../../services/calendar/ambient-calendar-awareness.js';
import {
  getCalendarLoadFactors,
  getCalendarLoadSummary,
  type CalendarLoadFactors,
} from '../../../services/calendar/calendar-load-service.js';
import {
  detectRecoveryNeeds,
  buildRecoveryContext,
  type RecoveryRecommendation,
} from '../../../services/calendar/recovery-protection.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHighInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';

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
  // Better Than Human additions
  ambientContext?: AmbientCalendarContext;
  loadFactors?: CalendarLoadFactors;
  recoveryNeeds?: RecoveryRecommendation[];
  betterThanHumanInjection?: string | null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Detail levels for each persona
type CalendarDetailLevel = 'full' | 'events' | 'awareness' | 'habits' | 'research' | 'wisdom';

const CALENDAR_DETAIL_LEVELS: Record<string, CalendarDetailLevel> = {
  'alex-chen': 'full', // Full calendar management (primary)
  'jordan-taylor': 'events', // Event planning and celebration focus
  ferni: 'awareness', // General awareness for life coaching
  'maya-patel': 'habits', // Habit-related schedule awareness
  'peter-john': 'research', // Research and focus time scheduling
  'nayan-kumar': 'wisdom', // Life rhythm and balance awareness
};

// All personas get calendar awareness now
const CALENDAR_AWARE_PERSONAS = Object.keys(CALENDAR_DETAIL_LEVELS);
const ALEX_PERSONA_ID = 'alex-chen';
const UPCOMING_MEETING_THRESHOLD_MINUTES = 60; // Alert if meeting within 60 min

// Personas that get full "Better Than Human" features
const BTH_FULL_PERSONAS = ['alex-chen'] as const;
// Personas that get lite BTH features (load factors, recovery suggestions)
const BTH_LITE_PERSONAS = ['ferni', 'maya-patel', 'nayan-kumar'] as const;

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build calendar awareness context for ALL personas
 *
 * Returns null context if:
 * - Calendar not connected
 * - No relevant context to inject
 *
 * Different personas get different levels of detail:
 * - Alex: Full detail + full BTH (primary calendar manager)
 * - Jordan: Event planning focus (for milestone scheduling)
 * - Ferni: Light awareness + lite BTH (for life coaching)
 * - Maya: Habit schedule context + lite BTH (for routines)
 * - Peter: Research/focus time context (for deep work)
 * - Nayan: Life rhythm context + lite BTH (for wisdom)
 */
export async function buildCalendarAwarenessContext(
  userId: string | undefined,
  personaId: string | undefined
): Promise<CalendarAwarenessContext> {
  // All personas get calendar awareness now - just check if persona exists
  if (!personaId || !CALENDAR_DETAIL_LEVELS[personaId]) {
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
        contextInjection:
          '[CALENDAR: Not connected. If user asks about calendar, suggest connecting.]',
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

    // =========================================================================
    // BETTER THAN HUMAN: Enhanced calendar awareness
    // Full BTH for Alex, lite BTH for Ferni, Maya, Nayan
    // =========================================================================
    let ambientContext: AmbientCalendarContext | undefined;
    let loadFactors: CalendarLoadFactors | undefined;
    let recoveryNeeds: RecoveryRecommendation[] | undefined;
    let betterThanHumanInjection: string | null = null;

    const isFullBTH = BTH_FULL_PERSONAS.includes(personaId as (typeof BTH_FULL_PERSONAS)[number]);
    const isLiteBTH = BTH_LITE_PERSONAS.includes(personaId as (typeof BTH_LITE_PERSONAS)[number]);

    if (isFullBTH || isLiteBTH) {
      // Get real-time ambient context (meeting starting soon, just ended, etc.)
      ambientContext = await getAmbientCalendarContext(userId);

      const sections: string[] = [];

      if (isFullBTH) {
        // Full BTH: Alex gets everything
        loadFactors = await getCalendarLoadFactors(userId);
        recoveryNeeds = await detectRecoveryNeeds(userId);

        // Ambient awareness (high priority - affects conversation flow)
        const ambientInjection = generateAmbientContextInjection(ambientContext);
        if (ambientInjection) {
          sections.push(ambientInjection);
        }

        // Calendar load summary
        const loadSummary = await getCalendarLoadSummary(userId);
        if (loadSummary) {
          sections.push(loadSummary);
        }

        // Recovery context (proactive wellbeing)
        const recoveryContext = await buildRecoveryContext(userId);
        if (recoveryContext) {
          sections.push(recoveryContext);
        }
      } else {
        // Lite BTH: Core awareness for Ferni, Maya, Nayan
        // These personas care about wellbeing but aren't calendar specialists

        // Meeting starting soon? All lite BTH personas should know
        if (
          ambientContext.nextMeeting.event &&
          ambientContext.nextMeeting.minutesUntil !== null &&
          ambientContext.nextMeeting.minutesUntil <= 15
        ) {
          sections.push(
            `[TIMING: User has a meeting in ${ambientContext.nextMeeting.minutesUntil} minutes - be mindful of time]`
          );
        }

        // Just ended a meeting? Good context for check-ins
        if (ambientContext.justEndedMeeting.event) {
          sections.push('[CONTEXT: User just finished a meeting - may need transition time]');
        }

        // Load awareness for wellbeing-focused personas
        loadFactors = await getCalendarLoadFactors(userId);
        if (loadFactors && loadFactors.weeklyMeetingHours > 30) {
          sections.push('[WELLBEING: Very high calendar load this week - burnout risk]');
        } else if (loadFactors && loadFactors.weeklyMeetingHours > 20) {
          sections.push('[WELLBEING: Moderately heavy schedule - encourage breaks]');
        }

        // Recovery needs (simplified)
        recoveryNeeds = await detectRecoveryNeeds(userId);
        if (recoveryNeeds && recoveryNeeds.length > 0) {
          const topNeed = recoveryNeeds[0];
          sections.push(`[RECOVERY OPPORTUNITY: ${topNeed.type} - ${topNeed.reason}]`);
        }
      }

      if (sections.length > 0) {
        betterThanHumanInjection = sections.join('\n\n');
      }
    }

    log.debug(
      { userId, personaId, hasContext: !!contextInjection, hasBTH: !!betterThanHumanInjection },
      'Calendar awareness context built'
    );

    return {
      isConnected: true,
      todayOverview,
      alerts,
      nextMeetingIn,
      contextInjection,
      // Better Than Human additions
      ambientContext,
      loadFactors,
      recoveryNeeds,
      betterThanHumanInjection,
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
  const detailLevel = CALENDAR_DETAIL_LEVELS[personaId];

  switch (detailLevel) {
    case 'full':
      // Alex gets full calendar detail - they're the Chief of Staff
      return buildContextInjectionText(overview, alerts, nextMeetingIn);

    case 'events':
      // Jordan gets event-planning focused context
      return buildJordanCalendarContext(overview, alerts);

    case 'awareness':
      // Ferni gets light awareness for conversation context
      return buildFerniCalendarContext(overview, nextMeetingIn);

    case 'habits':
      // Maya gets habit-schedule context
      return buildMayaCalendarContext(overview, nextMeetingIn);

    case 'research':
      // Peter gets focus-time context
      return buildPeterCalendarContext(overview, nextMeetingIn);

    case 'wisdom':
      // Nayan gets life-rhythm context
      return buildNayanCalendarContext(overview, alerts);

    default:
      return null;
  }
}

/**
 * Build Jordan's calendar context (event planning focus)
 */
function buildJordanCalendarContext(overview: DayOverview, alerts: CalendarAlert[]): string | null {
  const parts: string[] = [];

  // Jordan cares about free time for planning new events
  if (overview.totalMeetings === 0) {
    parts.push('[SCHEDULE: Clear day - great time to plan celebrations or events]');
  } else {
    const freeHours = Math.round(overview.freeTimeMinutes / 60);
    if (freeHours >= 2) {
      parts.push(
        `[SCHEDULE: ${overview.totalMeetings} meetings but ${freeHours}h free for planning]`
      );
    } else if (overview.isOverloaded) {
      parts.push('[SCHEDULE: Packed day - if planning events, suggest another day]');
    }
  }

  // Jordan cares about upcoming milestones/events in alerts
  const eventAlerts = alerts.filter(
    (a) =>
      a.message.toLowerCase().includes('birthday') ||
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
function buildFerniCalendarContext(overview: DayOverview, nextMeetingIn?: number): string | null {
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
 * Build Maya's calendar context (habit-related schedule)
 */
function buildMayaCalendarContext(overview: DayOverview, nextMeetingIn?: number): string | null {
  const parts: string[] = [];

  // Maya cares about routine disruption and habit windows
  if (overview.totalMeetings === 0) {
    parts.push('[SCHEDULE: Clear day - great conditions for habit practice and routine building]');
  } else if (overview.isOverloaded) {
    parts.push(
      '[SCHEDULE: Packed day - habits may be harder. Suggest micro-practices or habit stacking]'
    );
  } else {
    const freeHours = Math.round(overview.freeTimeMinutes / 60);
    if (freeHours >= 2) {
      parts.push(`[SCHEDULE: ${freeHours}h free today - good opportunity for habit windows]`);
    }
  }

  // Early morning check (before 9am) - morning routine context
  const hour = new Date().getHours();
  if (hour < 9 && overview.firstEvent) {
    const firstTime = overview.firstEvent.startTime.getHours();
    if (firstTime >= 10) {
      parts.push('[MORNING: No early meetings - morning routine window available]');
    }
  }

  // Evening routine context
  if (hour >= 17 && overview.totalMeetings > 0) {
    parts.push('[EVENING: Consider winding down rituals if day was meeting-heavy]');
  }

  // Meeting soon - habit stacking opportunity
  if (nextMeetingIn !== undefined && nextMeetingIn > 15 && nextMeetingIn <= 30) {
    parts.push('[TIMING: 15-30 min before meeting - perfect for a micro-habit]');
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Build Peter's calendar context (research and focus time)
 */
function buildPeterCalendarContext(overview: DayOverview, nextMeetingIn?: number): string | null {
  const parts: string[] = [];

  // Peter cares about focus time and deep work
  if (overview.totalMeetings === 0) {
    parts.push('[FOCUS: Clear calendar - ideal for deep research and analysis work]');
  } else if (overview.hasBackToBack) {
    parts.push('[FOCUS: Back-to-back meetings fragmenting the day - research may need to wait]');
  } else {
    const freeHours = Math.round(overview.freeTimeMinutes / 60);
    if (freeHours >= 3) {
      parts.push(`[FOCUS: ${freeHours}h uninterrupted time available for deep work]`);
    } else if (freeHours >= 1) {
      parts.push(`[FOCUS: ${freeHours}h free - enough for focused reading or quick analysis]`);
    }
  }

  // Context about meeting load vs. research needs
  if (overview.isOverloaded) {
    parts.push('[NOTE: Heavy meeting load today - may need to deprioritize non-urgent research]');
  }

  // Timing context for research discussions
  if (nextMeetingIn !== undefined && nextMeetingIn <= 20) {
    parts.push('[TIMING: Meeting soon - keep research explanations concise]');
  } else if (nextMeetingIn === undefined || nextMeetingIn > 60) {
    parts.push('[TIMING: No imminent meetings - can go deeper on analysis if needed]');
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Build Nayan's calendar context (life rhythm and wisdom)
 */
function buildNayanCalendarContext(overview: DayOverview, alerts: CalendarAlert[]): string | null {
  const parts: string[] = [];

  // Nayan cares about balance and life rhythm
  if (overview.isOverloaded) {
    parts.push('[LIFE RHYTHM: Very full day - may be disconnected from inner peace]');
  } else if (overview.totalMeetings === 0) {
    parts.push('[LIFE RHYTHM: Empty calendar - space for reflection and being present]');
  } else {
    const freePercent = Math.round((overview.freeTimeMinutes / (8 * 60)) * 100);
    if (freePercent < 30) {
      parts.push(`[LIFE RHYTHM: ${100 - freePercent}% of day scheduled - limited spaciousness]`);
    } else if (freePercent > 60) {
      parts.push('[LIFE RHYTHM: Balanced schedule with room for spontaneity]');
    }
  }

  // Back-to-back is anti-wisdom
  if (overview.hasBackToBack) {
    parts.push('[BALANCE: No breathing room between commitments - rushing energy likely]');
  }

  // Check for meaningful patterns in alerts
  const stressAlerts = alerts.filter(
    (a) =>
      a.severity === 'warning' ||
      a.message.toLowerCase().includes('stress') ||
      a.message.toLowerCase().includes('overload')
  );
  if (stressAlerts.length > 0) {
    parts.push('[WISDOM NOTE: Calendar signals potential overwhelm - may need grounding]');
  }

  // Time of day wisdom
  const hour = new Date().getHours();
  if (hour >= 21) {
    parts.push('[EVENING WISDOM: Day is winding down - good time for reflection]');
  } else if (hour < 7) {
    parts.push('[MORNING WISDOM: Early hours - sacred time for contemplation]');
  }

  return parts.length > 0 ? parts.join('\n') : null;
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
    parts.push(
      `[CALENDAR: ${overview.totalMeetings} meeting${overview.totalMeetings !== 1 ? 's' : ''} today`
    );

    if (overview.firstEvent) {
      const time = overview.firstEvent.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      parts[parts.length - 1] += `. First: ${overview.firstEvent.title} at ${time}`;
    }

    if (overview.freeTimeMinutes > 0) {
      const freeHours = Math.round((overview.freeTimeMinutes / 60) * 10) / 10;
      parts[parts.length - 1] += `. ${freeHours}h free time`;
    }

    parts[parts.length - 1] += ']';
  } else {
    parts.push('[CALENDAR: Clear day, no meetings scheduled]');
  }

  // Immediate alert if meeting coming up soon
  if (
    nextMeetingIn !== undefined &&
    nextMeetingIn <= UPCOMING_MEETING_THRESHOLD_MINUTES &&
    nextMeetingIn > 0
  ) {
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
    parts.push(
      `You have ${todayOverview.totalMeetings} meeting${todayOverview.totalMeetings !== 1 ? 's' : ''} today.`
    );

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
 * Injects calendar context for ALL personas with tiered detail:
 * - Alex: Full detail + full BTH (primary calendar manager)
 * - Jordan: Event planning focus
 * - Ferni: Light awareness + lite BTH
 * - Maya: Habit schedule context + lite BTH
 * - Peter: Research/focus time context
 * - Nayan: Life rhythm context + lite BTH
 */
export const calendarAwarenessBuilder: ContextBuilder = {
  name: 'calendar-awareness',
  description: 'Provides calendar context for all personas with tiered detail',
  priority: 55, // Mid-priority - runs after safety/emotional but before humanizing
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, services } = input;

    const personaId = persona?.identity?.id;

    // All personas get calendar awareness now
    if (!personaId || !CALENDAR_DETAIL_LEVELS[personaId]) {
      return [];
    }

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    const context = await buildCalendarAwarenessContext(userId, personaId);

    const injections: ContextInjection[] = [];

    // Standard calendar context
    if (context.contextInjection) {
      injections.push(
        createStandardInjection('calendar_awareness', context.contextInjection, {
          category: 'calendar',
        })
      );
    }

    // Better Than Human calendar context (Alex only)
    if (context.betterThanHumanInjection) {
      // Check if we need to interrupt for urgent calendar events
      if (context.ambientContext && shouldInterruptForCalendar(context.ambientContext)) {
        injections.push(
          createHighInjection('calendar_urgent', context.betterThanHumanInjection, {
            category: 'calendar-urgent',
          })
        );
      } else {
        injections.push(
          createStandardInjection('calendar_bth', context.betterThanHumanInjection, {
            category: 'calendar-better-than-human',
          })
        );
      }
    }

    if (injections.length > 0) {
      log.debug(
        { userId, personaId, connected: context.isConnected, injectionCount: injections.length },
        'Calendar awareness context injected'
      );
    }

    return injections;
  },
};

// Self-register on module load
registerContextBuilder(calendarAwarenessBuilder);

export default buildCalendarAwarenessContext;
