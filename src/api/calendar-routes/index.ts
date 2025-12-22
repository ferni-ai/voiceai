/**
 * Calendar Routes - Main Handler
 *
 * Modular calendar API routes split into logical handlers.
 *
 * Structure:
 * - status-handlers.ts - Status, sync, disconnect, rate-limit
 * - selection-handlers.ts - Calendar selection per provider
 * - conflict-handlers.ts - Conflict resolution
 * - schedule-handlers.ts - Today, week, briefing, alerts
 * - provider-handlers.ts - Apple, Outlook provider routes
 * - analytics-handlers.ts - Calendar analytics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { parseBody, sendError, getUserId as getUserIdFromRequest } from '../helpers.js';

// Status handlers
import {
  handleStatus,
  handleSyncStatus,
  handleSync,
  handleDisconnect,
  handleRateLimitStatus,
  handleProvidersStatus,
} from './status-handlers.js';

// Selection handlers
import { handleListCalendars, handleSelectCalendars } from './selection-handlers.js';

// Conflict handlers
import {
  handleGetConflicts,
  handleResolveConflict,
  handleDismissConflict,
  handleAutoResolve,
  handleSetPreference,
} from './conflict-handlers.js';

// Schedule handlers
import {
  handleToday,
  handleAmbient,
  handleBlockFocus,
  handleMeetingsWithPerson,
  handleWeek,
  handleBriefing,
  handleAlerts,
} from './schedule-handlers.js';

// Provider handlers
import {
  handleAppleConnect,
  handleAppleDisconnect,
  handleAppleSync,
  handleOutlookCallback,
  handleOutlookDisconnect,
  handleOutlookSync,
} from './provider-handlers.js';

// Analytics handlers
import { handleAnalytics } from './analytics-handlers.js';

/**
 * Main calendar routes handler.
 * Routes requests to appropriate sub-handlers.
 */
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
        (body.userId as string) || (body.user_id as string) || getUserIdFromRequest(req, parsedUrl);
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
  // PROVIDER STATUS
  // ========================================================================

  if (normalizedPath === '/calendar/providers/status' && req.method === 'GET') {
    await handleProvidersStatus(req, res, userId);
    return true;
  }

  // ========================================================================
  // RATE LIMIT STATUS
  // ========================================================================

  if (normalizedPath === '/calendar/rate-limit' && req.method === 'GET') {
    await handleRateLimitStatus(req, res, userId);
    return true;
  }

  // ========================================================================
  // GOOGLE CALENDAR ROUTES
  // ========================================================================

  if (normalizedPath === '/calendar/status' && req.method === 'GET') {
    await handleStatus(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/sync-status' && req.method === 'GET') {
    await handleSyncStatus(req, res, userId);
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
  // CALENDAR SELECTION ROUTES (ALL PROVIDERS)
  // ========================================================================

  // Google calendars
  if (normalizedPath === '/calendar/google/calendars' && req.method === 'GET') {
    await handleListCalendars(req, res, userId, 'google');
    return true;
  }

  if (normalizedPath === '/calendar/google/calendars/select' && req.method === 'POST') {
    await handleSelectCalendars(req, res, userId, 'google');
    return true;
  }

  // Apple calendars
  if (normalizedPath === '/calendar/apple/calendars' && req.method === 'GET') {
    await handleListCalendars(req, res, userId, 'apple');
    return true;
  }

  if (normalizedPath === '/calendar/apple/calendars/select' && req.method === 'POST') {
    await handleSelectCalendars(req, res, userId, 'apple');
    return true;
  }

  // Outlook calendars
  if (normalizedPath === '/calendar/outlook/calendars' && req.method === 'GET') {
    await handleListCalendars(req, res, userId, 'outlook');
    return true;
  }

  if (normalizedPath === '/calendar/outlook/calendars/select' && req.method === 'POST') {
    await handleSelectCalendars(req, res, userId, 'outlook');
    return true;
  }

  // ========================================================================
  // CONFLICT RESOLUTION ROUTES
  // ========================================================================

  if (normalizedPath === '/calendar/conflicts' && req.method === 'GET') {
    await handleGetConflicts(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/conflicts/auto-resolve' && req.method === 'POST') {
    await handleAutoResolve(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/conflicts/preference' && req.method === 'PUT') {
    await handleSetPreference(req, res, userId);
    return true;
  }

  // Dynamic conflict routes (resolve/dismiss)
  const conflictResolveMatch = normalizedPath.match(/^\/calendar\/conflicts\/([^/]+)\/resolve$/);
  if (conflictResolveMatch && req.method === 'POST') {
    await handleResolveConflict(req, res, userId, conflictResolveMatch[1]);
    return true;
  }

  const conflictDismissMatch = normalizedPath.match(/^\/calendar\/conflicts\/([^/]+)$/);
  if (conflictDismissMatch && req.method === 'DELETE') {
    await handleDismissConflict(req, res, userId, conflictDismissMatch[1]);
    return true;
  }

  // ========================================================================
  // CALENDAR DATA ROUTES
  // ========================================================================

  if (normalizedPath === '/calendar/ambient' && req.method === 'GET') {
    await handleAmbient(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/block-focus' && req.method === 'POST') {
    await handleBlockFocus(req, res, userId);
    return true;
  }

  // Meetings with a specific person
  const meetingsWithMatch = normalizedPath.match(/^\/calendar\/with\/([^/]+)$/);
  if (meetingsWithMatch && req.method === 'GET') {
    const personEmail = decodeURIComponent(meetingsWithMatch[1]);
    await handleMeetingsWithPerson(req, res, userId, personEmail);
    return true;
  }

  if (normalizedPath === '/calendar/today' && req.method === 'GET') {
    await handleToday(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/week' && req.method === 'GET') {
    await handleWeek(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/briefing' && req.method === 'GET') {
    await handleBriefing(req, res, userId);
    return true;
  }

  if (normalizedPath === '/calendar/alerts' && req.method === 'GET') {
    await handleAlerts(req, res, userId);
    return true;
  }

  // ========================================================================
  // CALENDAR ANALYTICS
  // ========================================================================

  if (normalizedPath === '/calendar/analytics' && req.method === 'GET') {
    await handleAnalytics(req, res, userId);
    return true;
  }

  return false;
}

// Re-export for backward compatibility
export default handleCalendarRoutes;

