/**
 * Calendar Schedule Handlers
 *
 * Handles today, week, briefing, alerts, and ambient context routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { parseBody, sendError } from '../helpers.js';
import { sendJson, formatEventForApi } from './helpers.js';
import {
  isConnected,
  getDayOverview,
  getWeekOverview,
  getEventsForDay,
  findFreeTimeSlots,
  createEvent,
} from '../../services/calendar/calendar-service.js';
import {
  generateDailyBriefing,
  detectCalendarAlerts,
} from '../../services/calendar/calendar-intelligence.js';
import { getAmbientCalendarContext } from '../../services/calendar/ambient-calendar-awareness.js';

const log = getLogger();

/**
 * GET /api/calendar/today - Get today's schedule
 */
export async function handleToday(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, { connected: false, overview: null, message: 'Calendar not connected' });
      return;
    }

    const today = new Date();
    const overview = await getDayOverview(userId, today);
    const events = await getEventsForDay(userId, today);

    const formattedEvents = events.map(formatEventForApi);

    sendJson(res, {
      connected: true,
      overview: {
        date: overview.date,
        totalMeetings: overview.totalMeetings,
        totalMeetingMinutes: overview.totalMeetingMinutes,
        freeTimeMinutes: overview.freeTimeMinutes,
        isOverloaded: overview.isOverloaded,
        hasBackToBack: overview.hasBackToBack,
        events: formattedEvents,
      },
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get today calendar');
    sendError(res, 'Failed to fetch calendar data', 500);
  }
}

/**
 * GET /api/calendar/ambient - Get ambient calendar context (real-time awareness)
 */
export async function handleAmbient(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const ambient = await getAmbientCalendarContext(userId);

    const response = {
      isCalendarConnected: ambient.isCalendarConnected,
      currentlyInMeeting: ambient.currentlyInMeeting,
      currentMeeting: ambient.currentMeeting
        ? {
            id: ambient.currentMeeting.id,
            title: ambient.currentMeeting.title,
            startTime: ambient.currentMeeting.startTime.toISOString(),
            endTime: ambient.currentMeeting.endTime.toISOString(),
            location: ambient.currentMeeting.location,
            attendees: ambient.currentMeeting.attendees,
          }
        : null,
      nextMeeting: ambient.nextMeeting.event
        ? {
            event: {
              id: ambient.nextMeeting.event.id,
              title: ambient.nextMeeting.event.title,
              startTime: ambient.nextMeeting.event.startTime.toISOString(),
              endTime: ambient.nextMeeting.event.endTime.toISOString(),
              location: ambient.nextMeeting.event.location,
              attendees: ambient.nextMeeting.event.attendees,
            },
            minutesUntil: ambient.nextMeeting.minutesUntil,
            shouldWarnUser: ambient.nextMeeting.shouldWarnUser,
            wrapUpSuggestion: ambient.nextMeeting.wrapUpSuggestion,
          }
        : null,
      justEndedMeeting: ambient.justEndedMeeting.event
        ? {
            event: {
              id: ambient.justEndedMeeting.event.id,
              title: ambient.justEndedMeeting.event.title,
            },
            minutesSince: ambient.justEndedMeeting.minutesSince,
            followUpPrompt: ambient.justEndedMeeting.followUpPrompt,
          }
        : null,
      remainingMeetingsToday: ambient.remainingMeetingsToday,
      nextBreakDuration: ambient.nextBreakDuration,
      totalRemainingMeetingMinutes: ambient.totalRemainingMeetingMinutes,
    };

    sendJson(res, response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get ambient calendar context');
    sendError(res, 'Failed to fetch ambient context', 500);
  }
}

/**
 * POST /api/calendar/block-focus - Block focus time on calendar
 */
export async function handleBlockFocus(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<{ durationMinutes?: number }>(req);
    const durationMinutes = body?.durationMinutes || 60;

    const today = new Date();
    const freeSlots = await findFreeTimeSlots(userId, today, {
      minDurationMinutes: durationMinutes,
    });

    if (!freeSlots || freeSlots.length === 0) {
      sendJson(
        res,
        { success: false, message: 'No available time slots for focus time today' },
        400
      );
      return;
    }

    const slot = freeSlots[0];
    const startTime = slot.start;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const event = await createEvent(userId, {
      title: 'Focus Time',
      description: 'Protected focus time blocked by Ferni',
      startTime,
      endTime,
    });

    if (!event) {
      sendError(res, 'Failed to create focus time event', 500);
      return;
    }

    const startStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endStr = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    sendJson(res, {
      success: true,
      eventId: event.id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      message: `Focus time blocked from ${startStr} to ${endStr}`,
    });

    log.info({ userId, eventId: event.id, startTime, durationMinutes }, 'Focus time blocked');
  } catch (error) {
    log.error({ error, userId }, 'Failed to block focus time');
    sendError(res, 'Failed to block focus time', 500);
  }
}

/**
 * GET /api/calendar/with/:email - Get meetings with a specific person
 */
export async function handleMeetingsWithPerson(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  personEmail: string
): Promise<void> {
  try {
    const today = new Date();
    const weekOverview = await getWeekOverview(userId, today);
    const allWeekEvents = weekOverview.days.flatMap((day) => day.events);

    const eventsWithPerson = allWeekEvents.filter((event) =>
      event.attendees.some(
        (attendee) =>
          attendee.toLowerCase() === personEmail.toLowerCase() ||
          attendee.toLowerCase().includes(personEmail.toLowerCase())
      )
    );

    const upcoming = eventsWithPerson
      .filter((e) => e.startTime > today)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const past = eventsWithPerson
      .filter((e) => e.startTime <= today)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    sendJson(res, {
      success: true,
      personEmail,
      upcoming: upcoming.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        location: e.location,
        attendees: e.attendees,
      })),
      past: past.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        location: e.location,
        attendees: e.attendees,
      })),
      totalCount: eventsWithPerson.length,
    });
  } catch (error) {
    log.error({ error, userId, personEmail }, 'Failed to get meetings with person');
    sendError(res, 'Failed to fetch meetings', 500);
  }
}

/**
 * GET /api/calendar/week - Get this week's schedule
 */
export async function handleWeek(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, { connected: false, overview: null, message: 'Calendar not connected' });
      return;
    }

    const today = new Date();
    const overview = await getWeekOverview(userId, today);

    const formattedDays = overview.days.map((day) => ({
      date: day.date,
      totalMeetings: day.totalMeetings,
      totalMeetingMinutes: day.totalMeetingMinutes,
      freeTimeMinutes: day.freeTimeMinutes,
      isOverloaded: day.isOverloaded,
      hasBackToBack: day.hasBackToBack,
      events: day.events.map(formatEventForApi),
    }));

    sendJson(res, {
      connected: true,
      overview: {
        days: formattedDays,
        totalMeetings: overview.totalMeetings,
        busiestDay: overview.busiestDay,
        lightestDay: overview.lightestDay,
      },
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get week calendar');
    sendError(res, 'Failed to fetch calendar data', 500);
  }
}

/**
 * GET /api/calendar/briefing - Get daily briefing
 */
export async function handleBriefing(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, { connected: false, briefing: null, message: 'Calendar not connected' });
      return;
    }

    const today = new Date();
    const briefing = await generateDailyBriefing(userId, today);

    sendJson(res, { connected: true, briefing });
  } catch (error) {
    log.error({ error, userId }, 'Failed to generate briefing');
    sendError(res, 'Failed to generate briefing', 500);
  }
}

/**
 * GET /api/calendar/alerts - Get calendar alerts
 */
export async function handleAlerts(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, { connected: false, alerts: [], message: 'Calendar not connected' });
      return;
    }

    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);

    const alerts = await detectCalendarAlerts(userId, { start: today, end: endOfWeek });

    sendJson(res, { connected: true, alerts });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get calendar alerts');
    sendError(res, 'Failed to fetch calendar alerts', 500);
  }
}
