/**
 * Calendar API Routes
 *
 * Handles calendar status, sync, and disconnect operations.
 * Works with Google Calendar OAuth flow in token-server.js.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { getLogger } from '../utils/safe-logger.js';
import {
  isCalendarConfigured,
  deleteUserTokens,
} from '../services/google-calendar-oauth.js';
import {
  getCalendarBusyProfile,
  syncCalendarToOutreach,
} from '../services/calendar-busy-detection.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function getUserIdFromRequest(req: IncomingMessage, parsedUrl: URL): string | null {
  const headerUserId = req.headers['x-user-id'] as string;
  if (headerUserId) return headerUserId;

  const queryUserId = parsedUrl.searchParams.get('userId');
  if (queryUserId) return queryUserId;

  return null;
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
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
      const body = await parseBody(req);
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

  return false;
}

export default handleCalendarRoutes;

