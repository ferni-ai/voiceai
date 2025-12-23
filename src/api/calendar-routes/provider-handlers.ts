/**
 * Calendar Provider Handlers
 *
 * Handles Apple and Outlook calendar provider routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { getLogger } from '../../utils/safe-logger.js';
import { parseBody, sendError } from '../helpers.js';
import { sendJson, checkRateLimitAndApply } from './helpers.js';
import { appleCalendarProvider } from '../../services/calendar/providers/apple-provider.js';
import { outlookCalendarProvider } from '../../services/calendar/providers/outlook-provider.js';
import {
  registerUser as registerApplePolling,
  unregisterUser as unregisterApplePolling,
  pollUser as pollAppleUser,
} from '../../services/calendar/polling/apple-polling.js';
import {
  createSubscription as createOutlookSubscription,
  stopAllUserSubscriptions as stopOutlookSubscriptions,
} from '../../services/calendar/webhooks/outlook-webhook.js';

const log = getLogger();

// ============================================================================
// APPLE CALENDAR ROUTES
// ============================================================================

/**
 * POST /calendar/apple/connect - Connect Apple Calendar with credentials
 */
export async function handleAppleConnect(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'credential')) return;

  try {
    const body = await parseBody<{ apple_id?: string; app_password?: string }>(req);

    const appleId = body.apple_id;
    const appPassword = body.app_password;

    if (!appleId || !appPassword) {
      sendError(res, 'Apple ID and app-specific password required', 400);
      return;
    }

    const success = await appleCalendarProvider.storeCredentials(userId, appleId, appPassword);

    if (success) {
      await registerApplePolling(userId);
      await pollAppleUser(userId);

      sendJson(res, { success: true, message: 'Apple Calendar connected' });
      log.info({ userId, appleId }, '🍎 Apple Calendar connected and polling registered');
    } else {
      sendJson(res, {
        success: false,
        error: "Invalid credentials. Make sure you're using an app-specific password.",
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
export async function handleAppleDisconnect(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    await unregisterApplePolling(userId);
    await appleCalendarProvider.disconnect(userId);
    sendJson(res, { success: true });
    log.info({ userId }, '🍎 Apple Calendar disconnected and polling unregistered');
  } catch (error) {
    log.error({ error, userId }, 'Failed to disconnect Apple Calendar');
    sendError(res, 'Failed to disconnect Apple Calendar', 500);
  }
}

/**
 * POST /calendar/apple/sync - Sync Apple Calendar events
 */
export async function handleAppleSync(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'sync')) return;

  try {
    const connected = await appleCalendarProvider.isConnected(userId);

    if (!connected) {
      sendError(res, 'Apple Calendar not connected', 400);
      return;
    }

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
export async function handleOutlookCallback(
  _req: IncomingMessage,
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
      const subscription = await createOutlookSubscription(userId);
      if (subscription) {
        log.info(
          { userId, subscriptionId: subscription.subscriptionId },
          '📧 Outlook webhook subscription created'
        );
      } else {
        log.warn({ userId }, '📧 Could not create Outlook webhook (webhooks may not be enabled)');
      }

      res.writeHead(302, { Location: '/settings?calendar=outlook&status=connected' });
      res.end();
      log.info({ userId }, '📧 Outlook Calendar connected');
    } else {
      res.writeHead(302, { Location: '/settings?calendar=outlook&status=error' });
      res.end();
    }
  } catch (error) {
    log.error({ error, userId }, 'Failed to handle Outlook callback');
    res.writeHead(302, { Location: '/settings?calendar=outlook&status=error' });
    res.end();
  }
}

/**
 * POST /calendar/outlook/disconnect - Disconnect Outlook Calendar
 */
export async function handleOutlookDisconnect(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    await stopOutlookSubscriptions(userId);
    await outlookCalendarProvider.disconnect(userId);
    sendJson(res, { success: true });
    log.info({ userId }, '📧 Outlook Calendar disconnected and webhooks stopped');
  } catch (error) {
    log.error({ error, userId }, 'Failed to disconnect Outlook Calendar');
    sendError(res, 'Failed to disconnect Outlook Calendar', 500);
  }
}

/**
 * POST /calendar/outlook/sync - Sync Outlook Calendar events
 */
export async function handleOutlookSync(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'sync')) return;

  try {
    const connected = await outlookCalendarProvider.isConnected(userId);

    if (!connected) {
      sendError(res, 'Outlook Calendar not connected', 400);
      return;
    }

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
