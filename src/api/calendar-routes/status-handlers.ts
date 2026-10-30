/**
 * Calendar Status Handlers
 *
 * Handles status, sync, disconnect, and rate limit routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import {
  googleCalendarClientId,
  isGoogleCalendarOAuthConfigured,
} from '../../config/google-calendar-oauth-env.js';
import { sendError } from '../helpers.js';
import { sendJson, checkRateLimitAndApply, getCalendarRateLimitStatus } from './helpers.js';
import { isCalendarConfigured } from '../../services/identity/google-calendar-oauth.js';
import {
  getLinkState,
  isCalendarLinked,
  isLinkStatusV2,
  linkFields,
} from '../../services/identity/link-state.js';
import { disconnectGoogleCalendar } from '../../services/identity/google-calendar-disconnect.js';
import {
  getCalendarBusyProfile,
  syncCalendarToOutreach,
} from '../../services/scheduling/calendar-busy-detection.js';
import { appleCalendarProvider } from '../../services/calendar/providers/apple-provider.js';
import { outlookCalendarProvider } from '../../services/calendar/providers/outlook-provider.js';
import { outlookLinkedOr } from '../../services/calendar/index.js';
import { getConflictSummary } from '../../services/calendar/conflict-resolver.js';
import { stopAllUserChannels as stopGoogleWatchChannels } from '../../services/calendar/webhooks/google-webhook.js';

const log = getLogger();

/**
 * GET /api/calendar/status - Get calendar connection status
 */
export async function handleStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const configured = isGoogleCalendarOAuthConfigured();

    if (!configured) {
      sendJson(res, { connected: false, configured: false });
      return;
    }

    const link = isLinkStatusV2()
      ? linkFields(await getLinkState(userId, 'google_calendar'))
      : null;
    const isConnected = link ? link.linked : await isCalendarConfigured(userId);
    const linkState = link ? { link_state: link.link_state, scopes_ok: link.scopes_ok } : {};

    if (!isConnected) {
      sendJson(res, { connected: false, configured: true, ...linkState });
      return;
    }

    const profile = await getCalendarBusyProfile(userId);

    sendJson(res, {
      connected: true,
      configured: true,
      ...linkState,
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
 * GET /api/calendar/sync-status - Get detailed sync status for all providers
 */
export async function handleSyncStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const [googleConnected, appleConnected, outlookConnected] = await Promise.all([
      isCalendarLinked(userId),
      appleCalendarProvider.isConnected(userId),
      outlookLinkedOr(userId, () => outlookCalendarProvider.isConnected(userId)),
    ]);

    const conflicts = await getConflictSummary(userId);
    const rateLimits = getCalendarRateLimitStatus(userId);

    sendJson(res, {
      success: true,
      nativeCalendar: { active: true, status: 'ready' },
      providers: {
        google: {
          connected: googleConnected,
          status: googleConnected ? 'synced' : 'disconnected',
          configured: googleCalendarClientId() !== '',
          webhooksEnabled: true,
        },
        apple: {
          connected: appleConnected,
          status: appleConnected ? 'synced' : 'disconnected',
          configured: true,
          webhooksEnabled: false,
        },
        outlook: {
          connected: outlookConnected,
          status: outlookConnected ? 'synced' : 'disconnected',
          configured: outlookCalendarProvider.isConfigured(),
          webhooksEnabled: false,
        },
      },
      conflicts: { pending: conflicts.pending, total: conflicts.total },
      rateLimits: {
        sync: { remaining: rateLimits.sync.remaining, limit: 100 },
        credential: { remaining: rateLimits.credential.remaining, limit: 30 },
      },
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get sync status');
    sendError(res, 'Failed to get sync status', 500);
  }
}

/**
 * POST /api/calendar/sync - Sync calendar to outreach timing
 */
export async function handleSync(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'sync')) return;

  try {
    const isConnected = await isCalendarConfigured(userId);

    if (!isConnected) {
      sendError(res, 'Calendar not connected', 400);
      return;
    }

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
export async function handleDisconnect(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'credential')) return;

  try {
    try {
      await stopGoogleWatchChannels(userId);
      log.info({ userId }, '📅 Google Calendar webhooks stopped');
    } catch (watchError) {
      log.warn(
        { error: String(watchError), userId },
        '📅 Error stopping Google webhooks (non-blocking)'
      );
    }

    await disconnectGoogleCalendar(userId);

    sendJson(res, { success: true });
    log.info({ userId }, '📅 Calendar disconnected');
  } catch (error) {
    log.error({ error, userId }, 'Failed to disconnect calendar');
    sendError(res, 'Failed to disconnect calendar', 500);
  }
}

/**
 * GET /api/calendar/rate-limit - Get rate limit status
 */
export async function handleRateLimitStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  const status = getCalendarRateLimitStatus(userId);
  sendJson(res, {
    success: true,
    limits: {
      sync: {
        remaining: status.sync.remaining,
        resetAt: status.sync.resetAt.toISOString(),
        limit: 100,
        windowSeconds: 60,
      },
      credential: {
        remaining: status.credential.remaining,
        resetAt: status.credential.resetAt.toISOString(),
        limit: 30,
        windowSeconds: 60,
      },
      global: {
        remaining: status.global.remaining,
        resetAt: status.global.resetAt.toISOString(),
        limit: 1000,
        windowSeconds: 60,
      },
    },
  });
}

/**
 * GET /api/calendar/providers/status - Get all providers' connection status
 */
export async function handleProvidersStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const [googleConnected, appleConnected, outlookConnected] = await Promise.all([
      isCalendarLinked(userId),
      appleCalendarProvider.isConnected(userId),
      outlookLinkedOr(userId, () => outlookCalendarProvider.isConnected(userId)),
    ]);

    const outlookConfigured = outlookCalendarProvider.isConfigured();

    sendJson(res, {
      success: true,
      providers: {
        google: {
          provider: 'google',
          connected: googleConnected,
          configured: isGoogleCalendarOAuthConfigured(),
        },
        apple: {
          provider: 'apple',
          connected: appleConnected,
          configured: true,
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
