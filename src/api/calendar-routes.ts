/**
 * Calendar API Routes
 *
 * Handles calendar status, sync, and disconnect operations.
 * Supports multiple calendar providers (Google, Apple, Outlook).
 *
 * Provider Architecture:
 * - Each user has a native Ferni calendar (always available)
 * - External providers sync to/from the Ferni calendar
 * - Providers: Google (OAuth), Apple (CalDAV), Outlook (Microsoft Graph)
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
import { appleCalendarProvider } from '../services/calendar/providers/apple-provider.js';
import { outlookCalendarProvider } from '../services/calendar/providers/outlook-provider.js';

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
    title: event.title || 'Untitled',
    startTime: event.startTime instanceof Date ? event.startTime.toISOString() : event.startTime,
    endTime: event.endTime instanceof Date ? event.endTime.toISOString() : event.endTime,
    location: event.location || null,
    isAllDay: event.isAllDay || false,
    status: event.status || 'confirmed',
  };
}

// ============================================================================
// PROVIDERS STATUS
// ============================================================================

/**
 * GET /api/calendar/providers/status - Get all providers' connection status
 */
async function handleProvidersStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    // Check each provider
    const [googleConnected, appleConnected, outlookConnected] = await Promise.all([
      isCalendarConfigured(userId),
      appleCalendarProvider.isConnected(userId),
      outlookCalendarProvider.isConnected(userId),
    ]);

    // Check if Outlook is configured (requires env vars)
    const outlookConfigured = outlookCalendarProvider.isConfigured();

    sendJson(res, {
      success: true,
      providers: {
        google: {
          provider: 'google',
          connected: googleConnected,
          configured: !!(
            process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET
          ),
        },
        apple: {
          provider: 'apple',
          connected: appleConnected,
          configured: true, // Apple uses user credentials, always "configured"
        },
        outlook: {
          provider: 'outlook',
          connected: outlookConnected,
          configured: outlookConfigured,
        },
      },
      outlookConfigured,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get providers status');
    sendError(res, 'Failed to get providers status', 500);
  }
}

// ============================================================================
// APPLE CALENDAR ROUTES
// ============================================================================

/**
 * POST /calendar/apple/connect - Connect Apple Calendar with credentials
 */
async function handleAppleConnect(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<{
      apple_id?: string;
      app_password?: string;
    }>(req);

    const appleId = body.apple_id;
    const appPassword = body.app_password;

    if (!appleId || !appPassword) {
      sendError(res, 'Apple ID and app-specific password required', 400);
      return;
    }

    // Validate and store credentials
    const success = await appleCalendarProvider.storeCredentials(userId, appleId, appPassword);

    if (success) {
      sendJson(res, {
        success: true,
        message: 'Apple Calendar connected',
      });
      log.info({ userId, appleId }, '🍎 Apple Calendar connected');
    } else {
      sendJson(res, {
        success: false,
        error: 'Invalid credentials. Make sure you\'re using an app-specific password.',
      });
    }
  } catch (error) {
    log.error({ error, userId }, 'Failed to connect Apple Calendar');
    sendError(res, 'Failed to connect Apple Calendar', 500);
  }
}

/**
 * POST /calendar/apple/disconnect - Disconnect Apple Calendar
 */
async function handleAppleDisconnect(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    await appleCalendarProvider.disconnect(userId);
    sendJson(res, { success: true });
    log.info({ userId }, '🍎 Apple Calendar disconnected');
  } catch (error) {
    log.error({ error, userId }, 'Failed to disconnect Apple Calendar');
    sendError(res, 'Failed to disconnect Apple Calendar', 500);
  }
}

/**
 * POST /calendar/apple/sync - Sync Apple Calendar events
 */
async function handleAppleSync(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await appleCalendarProvider.isConnected(userId);

    if (!connected) {
      sendError(res, 'Apple Calendar not connected', 400);
      return;
    }

    // Fetch events for the next 30 days
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 30);

    const events = await appleCalendarProvider.fetchEvents(userId, now, endDate);

    sendJson(res, {
      success: true,
      eventCount: events.length,
      message: `Synced ${events.length} events from Apple Calendar`,
    });
    log.info({ userId, eventCount: events.length }, '🍎 Apple Calendar synced');
  } catch (error) {
    log.error({ error, userId }, 'Failed to sync Apple Calendar');
    sendError(res, 'Failed to sync Apple Calendar', 500);
  }
}

// ============================================================================
// OUTLOOK CALENDAR ROUTES
// ============================================================================

/**
 * POST /calendar/outlook/callback - Handle Microsoft OAuth callback
 */
async function handleOutlookCallback(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  parsedUrl: URL
): Promise<void> {
  try {
    const code = parsedUrl.searchParams.get('code');

    if (!code) {
      sendError(res, 'Authorization code required', 400);
      return;
    }

    const redirectUri = `${process.env.PUBLIC_URL || 'https://app.ferni.ai'}/calendar/outlook/callback`;
    const success = await outlookCalendarProvider.handleAuthCallback(userId, code, redirectUri);

    if (success) {
      // Redirect to settings with success message
      res.writeHead(302, {
        Location: '/settings?calendar=outlook&status=connected',
      });
      res.end();
      log.info({ userId }, '📧 Outlook Calendar connected');
    } else {
      res.writeHead(302, {
        Location: '/settings?calendar=outlook&status=error',
      });
      res.end();
    }
  } catch (error) {
    log.error({ error, userId }, 'Failed to handle Outlook callback');
    res.writeHead(302, {
      Location: '/settings?calendar=outlook&status=error',
    });
    res.end();
  }
}

/**
 * POST /calendar/outlook/disconnect - Disconnect Outlook Calendar
 */
async function handleOutlookDisconnect(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    await outlookCalendarProvider.disconnect(userId);
    sendJson(res, { success: true });
    log.info({ userId }, '📧 Outlook Calendar disconnected');
  } catch (error) {
    log.error({ error, userId }, 'Failed to disconnect Outlook Calendar');
    sendError(res, 'Failed to disconnect Outlook Calendar', 500);
  }
}

/**
 * POST /calendar/outlook/sync - Sync Outlook Calendar events
 */
async function handleOutlookSync(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const connected = await outlookCalendarProvider.isConnected(userId);

    if (!connected) {
      sendError(res, 'Outlook Calendar not connected', 400);
      return;
    }

    // Fetch events for the next 30 days
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 30);

    const events = await outlookCalendarProvider.fetchEvents(userId, now, endDate);

    sendJson(res, {
      success: true,
      eventCount: events.length,
      message: `Synced ${events.length} events from Outlook`,
    });
    log.info({ userId, eventCount: events.length }, '📧 Outlook Calendar synced');
  } catch (error) {
    log.error({ error, userId }, 'Failed to sync Outlook Calendar');
    sendError(res, 'Failed to sync Outlook Calendar', 500);
  }
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
  // Handle both /api/calendar and /calendar routes
  if (!pathname.startsWith('/api/calendar') && !pathname.startsWith('/calendar')) {
    return false;
  }

  // Normalize path (remove /api prefix if present)
  const normalizedPath = pathname.startsWith('/api') ? pathname.slice(4) : pathname;

  // Get userId from request
  let userId: string | null = null;

  if (req.method === 'POST') {
    try {
      const body = await parseBody<Record<string, unknown>>(req);
      userId =
        (body.userId as string) ||
        (body.user_id as string) ||
        getUserIdFromRequest(req, parsedUrl);
    } catch {
      sendError(res, 'Invalid request body');
      return true;
    }
  } else {
    userId = getUserIdFromRequest(req, parsedUrl);
  }

  // Special case: Outlook OAuth callback may not have userId in body
  if (normalizedPath === '/calendar/outlook/callback') {
    userId = parsedUrl.searchParams.get('state') || userId;
  }

  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }

  // ========================================================================
  // PROVIDER STATUS (NEW)
  // ========================================================================

  if (normalizedPath === '/calendar/providers/status' && req.method === 'GET') {
    await handleProvidersStatus(req, res, userId);
    return true;
  }

  // ========================================================================
  // GOOGLE CALENDAR ROUTES (original)
  // ========================================================================

  if (normalizedPath === '/calendar/status' && req.method === 'GET') {
    await handleStatus(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/sync' && req.method === 'POST') {
    await handleSync(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/disconnect' && req.method === 'POST') {
    await handleDisconnect(req, res, userId);
    return true;
  }

  // Alias: /calendar/google/disconnect
  if (normalizedPath === '/calendar/google/disconnect' && req.method === 'POST') {
    await handleDisconnect(req, res, userId);
    return true;
  }

  // Alias: /calendar/google/sync
  if (normalizedPath === '/calendar/google/sync' && req.method === 'POST') {
    await handleSync(req, res, userId);
    return true;
  }

  // ========================================================================
  // APPLE CALENDAR ROUTES
  // ========================================================================

  if (normalizedPath === '/calendar/apple/connect' && req.method === 'POST') {
    await handleAppleConnect(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/apple/disconnect' && req.method === 'POST') {
    await handleAppleDisconnect(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/apple/sync' && req.method === 'POST') {
    await handleAppleSync(req, res, userId);
    return true;
  }

  // ========================================================================
  // OUTLOOK CALENDAR ROUTES
  // ========================================================================

  if (normalizedPath === '/calendar/outlook/callback' && req.method === 'GET') {
    await handleOutlookCallback(req, res, userId, parsedUrl);
    return true;
  }

  if (normalizedPath === '/calendar/outlook/disconnect' && req.method === 'POST') {
    await handleOutlookDisconnect(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/outlook/sync' && req.method === 'POST') {
    await handleOutlookSync(req, res, userId);
    return true;
  }

  // ========================================================================
  // CALENDAR DATA ROUTES (original)
  // ========================================================================

  // Today's schedule
  if (normalizedPath === '/calendar/today' && req.method === 'GET') {
    await handleToday(req, res, userId);
    return true;
  }

  // Week schedule
  if (normalizedPath === '/calendar/week' && req.method === 'GET') {
    await handleWeek(req, res, userId);
    return true;
  }

  // Daily briefing
  if (normalizedPath === '/calendar/briefing' && req.method === 'GET') {
    await handleBriefing(req, res, userId);
    return true;
  }

  // Calendar alerts
  if (normalizedPath === '/calendar/alerts' && req.method === 'GET') {
    await handleAlerts(req, res, userId);
    return true;
  }

  return false;
}

export default handleCalendarRoutes;
