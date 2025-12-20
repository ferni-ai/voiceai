/**
 * Calendar API Routes
 *
 * Handles calendar status, sync, and disconnect operations.
 * Works with Google Calendar OAuth flow in token-server.js.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { getLogger } from '../utils/safe-logger.js';
import { isCalendarConfigured, deleteUserTokens } from '../services/google-calendar-oauth.js';
import {
  getCalendarBusyProfile,
  syncCalendarToOutreach,
} from '../services/calendar-busy-detection.js';
import { parseBody, sendJSON, sendError, getUserId as getUserIdFromRequest } from './helpers.js';
import {
  isConnected,
  getDayOverview,
  getWeekOverview,
  getEventsForDay,
  type CalendarEvent,
} from '../services/calendar/calendar-service.js';
import {
  generateDailyBriefing,
  detectCalendarAlerts,
} from '../services/calendar/calendar-intelligence.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

// parseBody, sendJSON, sendError, getUserId imported from './helpers.js'

/**
 * Legacy wrapper for sendJSON with (res, data, status) signature.
 */
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  sendJSON(res, data, status);
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/calendar/status - Get calendar connection status
 */
async function handleStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    // Check if Google Calendar is configured at all
    const configured = !!(
      process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET
    );

    if (!configured) {
      sendJson(res, {
        connected: false,
        configured: false,
      });
      return;
    }

    // Check if user has connected their calendar
    const isConnected = await isCalendarConfigured(userId);

    if (!isConnected) {
      sendJson(res, {
        connected: false,
        configured: true,
      });
      return;
    }

    // Get busy profile for stats
    const profile = await getCalendarBusyProfile(userId);

    sendJson(res, {
      connected: true,
      configured: true,
      lastSynced: profile.lastSynced?.toISOString(),
      busySlotsToday: profile.todayBusySlots.length,
      currentlyBusy: profile.currentlyBusy,
      currentEvent: profile.currentEvent,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get calendar status');
    sendError(res, 'Failed to get calendar status', 500);
  }
}

/**
 * POST /api/calendar/sync - Sync calendar to outreach timing
 */
async function handleSync(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const isConnected = await isCalendarConfigured(userId);

    if (!isConnected) {
      sendError(res, 'Calendar not connected', 400);
      return;
    }

    // Sync busy times to outreach timing
    const result = await syncCalendarToOutreach(userId);

    sendJson(res, {
      success: true,
      busyPeriodsAdded: result.busyPeriodsAdded,
      rulesAdded: result.rulesAdded,
    });

    log.info({ userId, ...result }, '📅 Calendar synced to outreach');
  } catch (error) {
    log.error({ error, userId }, 'Failed to sync calendar');
    sendError(res, 'Failed to sync calendar', 500);
  }
}

/**
 * POST /api/calendar/disconnect - Disconnect calendar
 */
async function handleDisconnect(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    // Delete stored tokens
    await deleteUserTokens(userId);

    sendJson(res, { success: true });
    log.info({ userId }, '📅 Calendar disconnected');
  } catch (error) {
    log.error({ error, userId }, 'Failed to disconnect calendar');
    sendError(res, 'Failed to disconnect calendar', 500);
  }
}

// ============================================================================
// TODAY & WEEK HANDLERS
// ============================================================================

/**
 * GET /api/calendar/today - Get today's schedule
 */
async function handleToday(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, {
        connected: false,
        overview: null,
        message: 'Calendar not connected',
      });
      return;
    }

    const today = new Date();
    const overview = await getDayOverview(userId, today);
    const events = await getEventsForDay(userId, today);

    // Format events for JSON
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
 * GET /api/calendar/week - Get this week's schedule
 */
async function handleWeek(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, {
        connected: false,
        overview: null,
        message: 'Calendar not connected',
      });
      return;
    }

    const today = new Date();
    const overview = await getWeekOverview(userId, today);

    // Format events in each day
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
async function handleBriefing(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, {
        connected: false,
        briefing: null,
        message: 'Calendar not connected',
      });
      return;
    }

    const today = new Date();
    const briefing = await generateDailyBriefing(userId, today);

    sendJson(res, {
      connected: true,
      briefing,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to generate briefing');
    sendError(res, 'Failed to generate briefing', 500);
  }
}

/**
 * GET /api/calendar/alerts - Get calendar alerts
 */
async function handleAlerts(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await isConnected(userId);

    if (!connected) {
      sendJson(res, {
        connected: false,
        alerts: [],
        message: 'Calendar not connected',
      });
      return;
    }

    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);

    const alerts = await detectCalendarAlerts(userId, {
      start: today,
      end: endOfWeek,
    });

    sendJson(res, {
      connected: true,
      alerts,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get calendar alerts');
    sendError(res, 'Failed to fetch calendar alerts', 500);
  }
}

/**
 * Format a calendar event for API response
 */
function formatEventForApi(event: CalendarEvent): Record<string, unknown> {
  return {
    id: event.id,
    title: event.summary || 'Untitled',
    startTime: event.startTime instanceof Date ? event.startTime.toISOString() : event.startTime,
    endTime: event.endTime instanceof Date ? event.endTime.toISOString() : event.endTime,
    location: event.location || null,
    isAllDay: event.isAllDay || false,
    status: event.status || 'confirmed',
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleCalendarRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/calendar')) {
    return false;
  }

  // Get userId from request
  let userId: string | null = null;

  if (req.method === 'POST') {
    try {
      const body = await parseBody<Record<string, unknown>>(req);
      userId = (body.userId as string) || getUserIdFromRequest(req, parsedUrl);
    } catch {
      sendError(res, 'Invalid request body');
      return true;
    }
  } else {
    userId = getUserIdFromRequest(req, parsedUrl);
  }

  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }

  // Route to appropriate handler
  if (pathname === '/api/calendar/status' && req.method === 'GET') {
    await handleStatus(req, res, userId);
    return true;
  }

  if (pathname === '/api/calendar/sync' && req.method === 'POST') {
    await handleSync(req, res, userId);
    return true;
  }

  if (pathname === '/api/calendar/disconnect' && req.method === 'POST') {
    await handleDisconnect(req, res, userId);
    return true;
  }

  // New: Today's schedule
  if (pathname === '/api/calendar/today' && req.method === 'GET') {
    await handleToday(req, res, userId);
    return true;
  }

  // New: Week schedule
  if (pathname === '/api/calendar/week' && req.method === 'GET') {
    await handleWeek(req, res, userId);
    return true;
  }

  // New: Daily briefing
  if (pathname === '/api/calendar/briefing' && req.method === 'GET') {
    await handleBriefing(req, res, userId);
    return true;
  }

  // New: Calendar alerts
  if (pathname === '/api/calendar/alerts' && req.method === 'GET') {
    await handleAlerts(req, res, userId);
    return true;
  }

  return false;
}

export default handleCalendarRoutes;
