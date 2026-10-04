/**
 * Push Notification Routes
 *
 * Web Push notification management.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit, requireAdmin, requireAuth } from '../../../api/auth-middleware.js';
import { parseBody, sendError, sendJSON } from '../../../api/helpers.js';
import { getPushNotificationsService } from '../../../services/push-notifications.js';
import { isWebPushDeliverable } from '../../../services/web-push-loader.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PushRoutes' });

// VAPID configuration
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { auth?: unknown; p256dh?: unknown };
  platform?: unknown;
}

const PLATFORMS = ['web', 'ios', 'android'] as const;

/** Read the JSON body; answers 400 itself and returns null when it isn't JSON. */
async function readJson(req: IncomingMessage, res: ServerResponse): Promise<SubscribeBody | null> {
  try {
    return await parseBody<SubscribeBody>(req);
  } catch {
    sendError(res, 'Invalid JSON body', 400);
    return null;
  }
}

/**
 * Handle push notification routes
 */
export async function handlePushRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // GET /api/push/vapid-key - Get VAPID public key
  if (pathname === '/api/push/vapid-key' && req.method === 'GET') {
    // Don't hand out a key (and let the browser subscribe) when nothing could be delivered.
    if (!VAPID_PUBLIC_KEY || !(await isWebPushDeliverable())) {
      log.warn('Web push not deliverable (VAPID keys or web-push module missing)');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Push notifications not configured',
          message: 'Web push needs VAPID keys and the web-push module.',
        })
      );
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }));
    return true;
  }

  // POST /api/push/subscribe - Register push subscription
  // Stored through the same service (Firestore push_subscriptions) the senders
  // read, keyed by the verified caller, so a subscribed user can actually be reached.
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    const body = await readJson(req, res);
    if (!body) return true;

    const { endpoint, keys } = body;
    const platform = PLATFORMS.find((p) => p === (body.platform ?? 'web'));
    if (
      typeof endpoint !== 'string' ||
      !endpoint ||
      typeof keys?.auth !== 'string' ||
      typeof keys?.p256dh !== 'string' ||
      !platform
    ) {
      sendError(res, 'Invalid subscription format', 400);
      return true;
    }

    try {
      await getPushNotificationsService().registerSubscription({
        endpoint,
        keys: { auth: keys.auth, p256dh: keys.p256dh },
        platform,
        userId: auth.userId,
        createdAt: new Date().toISOString(),
      });
      sendJSON(res, { success: true });
    } catch (err) {
      log.error(
        { error: String(err), userId: auth.userId },
        'Failed to register push subscription'
      );
      sendError(res, 'Failed to register subscription', 500);
    }
    return true;
  }

  // POST /api/push/unsubscribe - Remove push subscription
  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    const body = await readJson(req, res);
    if (!body) return true;
    if (typeof body.endpoint !== 'string' || !body.endpoint) {
      sendError(res, 'endpoint is required', 400);
      return true;
    }

    try {
      await getPushNotificationsService().removeSubscription(auth.userId, body.endpoint);
      sendJSON(res, { success: true });
    } catch (err) {
      log.error({ error: String(err), userId: auth.userId }, 'Failed to unsubscribe');
      sendError(res, 'Failed to unsubscribe', 500);
    }
    return true;
  }

  // POST /api/push/send - Send a push notification (ADMIN ONLY)
  if (pathname === '/api/push/send' && req.method === 'POST') {
    // SECURITY: Require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return true; // 401/403 already sent

    // Rate limit
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return true;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: Add error handler to prevent hanging promises on request errors
    return new Promise((resolve) => {
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in push send');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', async () => {
        try {
          const {
            userId,
            title,
            body: notificationBody,
            type,
          } = JSON.parse(body) as {
            userId?: string;
            title?: string;
            body?: string;
            type?: string;
          };

          // Try to use backend service if available
          try {
            const service = getPushNotificationsService();
            // Valid notification types from the service
            const validTypes = [
              'ritual_reminder',
              'streak_milestone',
              'prediction_result',
              'team_huddle',
              'ferni_checkin',
              'engagement',
              'general',
            ] as const;
            type NotificationType = (typeof validTypes)[number];
            const notificationType: NotificationType = validTypes.includes(type as NotificationType)
              ? (type as NotificationType)
              : 'general';
            const success = await service.sendNotification(userId || 'anonymous', {
              title: title || 'Test Notification',
              body: notificationBody || 'This is a test notification',
              type: notificationType,
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success,
                message: success ? 'Notification sent' : 'No subscriptions found',
              })
            );
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                message: 'Push notification service not available',
              })
            );
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to send notification' }));
        }
        resolve(true);
      });
    });
  }

  return false;
}
