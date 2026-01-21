/**
 * Calendar Domain Tool Executor
 *
 * Handles calendar-related tools: getCalendarToday, getSchedule, createCalendarEvent,
 * scheduleEvent, sendMeetingInvite
 *
 * @module agents/shared/tool-executors/calendar-executor
 */

import {
  createEvent,
  getEventsForDay,
  getEventsForWeek,
  isTimeSlotAvailable,
} from '../../../services/calendar/calendar-service.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'CalendarExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Domain tool names (camelCase)
  'getcalendartoday',
  'getschedule',
  'createcalendarevent',
  'scheduleevent',
  'sendmeetinginvite',
  'getupcomingappointments',
  'checkavailability',
  // Aliases from function-calling-base.md
  'getcalendar',
  'getevents',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // calendar_create category
  'calendar_create_event',
  'scheduling_find_time',
  // calendar_view category
  'calendar_list_events',
  'calendar_check_availability',
  'scheduling_conflicts',
  // calendar_modify category
  'calendar_update_event',
  'calendar_delete_event',
  'calendar_reschedule',
] as const;

/** Map aliases to canonical tool names */
const TOOL_ALIASES: Record<string, string> = {
  getcalendar: 'getcalendartoday',
  getevents: 'getcalendartoday',
  // FTIS V3 semantic IDs → canonical names
  calendar_create_event: 'createcalendarevent',
  scheduling_find_time: 'checkavailability',
  calendar_list_events: 'getcalendartoday',
  calendar_check_availability: 'checkavailability',
  scheduling_conflicts: 'checkavailability',
  calendar_update_event: 'createcalendarevent', // Re-use create logic with update
  calendar_delete_event: 'deletecalendarevent',
  calendar_reschedule: 'createcalendarevent',
};

/**
 * Execute calendar-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  let fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // Resolve aliases to canonical tool names
  if (TOOL_ALIASES[fnLower]) {
    log.debug({ original: fnLower, resolved: TOOL_ALIASES[fnLower] }, '🔀 Resolving tool alias');
    fnLower = TOOL_ALIASES[fnLower];
  }

  // ========================================
  // GET CALENDAR TODAY
  // ========================================
  if (fnLower === 'getcalendartoday' || fnLower === 'getschedule') {
    log.info({ userId: ctx.userId }, '📅 Getting calendar');

    if (ctx.userId) {
      try {
        // Try to get real calendar data from Google Calendar integration
        const events = await getEventsForDay(ctx.userId, new Date());

        if (events.length === 0) {
          return 'Your calendar is clear today. No scheduled events.';
        }

        const eventList = events
          .map((e) => {
            const time = e.isAllDay
              ? 'All day'
              : new Date(e.startTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                });
            return `${time}: ${e.title || 'Untitled event'}`;
          })
          .join('; ');

        return `Today's schedule: ${eventList}`;
      } catch (err: unknown) {
        log.debug({ error: String(err) }, 'Calendar fetch failed, using fallback');
      }
    }

    // Fallback response
    return "I don't have access to your calendar yet. Would you like to connect it?";
  }

  // ========================================
  // CREATE CALENDAR EVENT
  // ========================================
  if (fnLower === 'createcalendarevent' || fnLower === 'scheduleevent') {
    const title = args.title as string;
    const date = args.date as string;
    const time = args.time as string;
    const durationStr = args.duration as string;

    if (!title) {
      return 'What would you like to schedule?';
    }

    log.info({ title, date, time, userId: ctx.userId }, '📅 Creating calendar event');

    if (ctx.userId) {
      try {
        // Parse duration (default 1 hour = 60 minutes)
        const durationMinutes = durationStr ? parseInt(durationStr, 10) || 60 : 60;

        // Build start date
        const startDate = date && time ? new Date(`${date} ${time}`) : new Date();

        // Build end date
        const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

        const event = await createEvent(ctx.userId, {
          title,
          startTime: startDate,
          endTime: endDate,
        });

        if (event) {
          return `Done! I've added "${title}" to your calendar${date ? ` for ${date}` : ''}${time ? ` at ${time}` : ''}.`;
        }
      } catch (err: unknown) {
        log.debug({ error: String(err) }, 'Calendar create failed, using fallback');
      }
    }

    // Fallback acknowledgment
    return `I've noted "${title}"${date ? ` for ${date}` : ''}${time ? ` at ${time}` : ''}. Connect your calendar to sync it automatically.`;
  }

  // ========================================
  // SEND MEETING INVITE
  // ========================================
  if (fnLower === 'sendmeetinginvite') {
    const attendees = args.attendees as string | string[];
    const title = args.title as string;
    const time = args.time as string;

    if (!title) {
      return 'What should the meeting be about?';
    }

    log.info({ title, attendees, userId: ctx.userId }, '📧 Sending meeting invite');

    // Conversational fallback
    const attendeeList = Array.isArray(attendees) ? attendees.join(', ') : attendees;
    return `I've noted you want to schedule "${title}"${attendeeList ? ` with ${attendeeList}` : ''}${time ? ` at ${time}` : ''}. Calendar integration is needed to send invites automatically.`;
  }

  // ========================================
  // GET UPCOMING APPOINTMENTS
  // ========================================
  if (fnLower === 'getupcomingappointments') {
    const days = (args.days as number) || 7;

    log.info({ days, userId: ctx.userId }, '📅 Getting upcoming appointments');

    if (ctx.userId) {
      try {
        // Get events for the week
        const overview = await getEventsForWeek(ctx.userId, new Date());

        if (overview.length === 0) {
          return `No events scheduled in the next ${days} days.`;
        }

        const summary = overview
          .slice(0, 5)
          .map((e) => {
            const date = new Date(e.startTime).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
            return `${date}: ${e.title || 'Untitled'}`;
          })
          .join('; ');

        return `Upcoming: ${summary}`;
      } catch {
        // Fall through to fallback
      }
    }

    return 'Connect your calendar to see upcoming appointments.';
  }

  // ========================================
  // CHECK AVAILABILITY
  // ========================================
  if (fnLower === 'checkavailability') {
    const date = args.date as string;
    const time = args.time as string;

    log.info({ date, time, userId: ctx.userId }, '📅 Checking availability');

    if (ctx.userId) {
      try {
        // Build time slot from date and time strings
        const startTime = date && time ? new Date(`${date} ${time}`) : new Date();
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour slot

        const isAvailable = await isTimeSlotAvailable(ctx.userId, startTime, endTime);

        return isAvailable
          ? `You're free ${date ? `on ${date}` : ''}${time ? ` at ${time}` : ''}.`
          : `That time slot appears to be busy.`;
      } catch {
        // Fall through to fallback
      }
    }

    return 'Connect your calendar so I can check your availability.';
  }

  return null;
}

export const calendarExecutor: DomainExecutor = {
  domain: 'calendar',
  handles: HANDLED_TOOLS,
  execute,
};

export default calendarExecutor;
