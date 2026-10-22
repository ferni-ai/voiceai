/**
 * Push Notification Routes
 *
 * Browsers subscribe with web-push keys (/api/push/subscribe); the iPhone app
 * registers its APNs device token (/api/push/devices), which has no such keys.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  rateLimit,
  requireAdmin,
  requireAuth,
  type AuthContext,
} from '../../../api/auth-middleware.js';
import { parseBody, sendError, sendJSON } from '../../../api/helpers.js';
import { EndpointOwnedError } from '../../../services/push-endpoint-owners.js';
import {
  parseDeviceRegistration,
  registerDevice,
  unregisterDevice,
} from '../../../services/push-devices.js';
import { recipientTag } from '../../../services/ios-push.js';
import { getPushNotificationsService } from '../../../services/push-notifications.js';
import { isAllowedWebPushEndpoint } from '../../../services/web-push-endpoint.js';
import { isWebPushDeliverable } from '../../../services/web-push-loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { onBodyEnd } from '../request-failure.js';

const log = createLogger({ module: 'PushRoutes' });

// VAPID configuration
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { auth?: unknown; p256dh?: unknown };
  platform?: unknown;
}

/** Read the JSON body; answers 400 itself and returns null when it isn't JSON. */
async function readJson<T = SubscribeBody>(
  req: IncomingMessage,
  res: ServerResponse
): Promise<T | null> {
  try {
    return await parseBody<T>(req);
  } catch {
    sendError(res, 'Invalid JSON body', 400);
    return null;
  }
}

/** A signed-in person (anonymous Firebase users count), never a service API key. */
async function requirePerson(
  req: IncomingMessage,
  res: ServerResponse
): Promise<AuthContext | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!auth.firebaseUid && !auth.isDevMode) {
    sendError(res, 'Device registration needs a signed-in user', 403);
    return null;
  }
  return auth;
}

/** POST registers the app's APNs token for the caller; DELETE forgets it. */
async function handleDevices(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = await requirePerson(req, res);
  if (!auth) return;
  if (rateLimit(req, res, { maxRequests: 20, windowMs: 60_000, keyPrefix: 'push-devices' })) return;

  const body = await readJson<unknown>(req, res);
  if (body === null) return;

  if (req.method === 'POST') {
    const parsed = parseDeviceRegistration(body);
    if (!parsed.ok) return sendError(res, parsed.error, 400);
    try {
      await registerDevice(auth.userId, parsed.device);
      log.info(
        { userId: auth.userId, environment: parsed.device.environment },
        'Push device registered'
      );
      // The app keeps its tag and drops a push whose `r` names someone else (ios-push.ts).
      sendJSON(res, { success: true, recipientTag: recipientTag(auth.userId) });
    } catch (err) {
      log.error({ error: String(err), userId: auth.userId }, 'Failed to register push device');
      sendError(res, 'Failed to register device', 500);
    }
    return;
  }

  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || !token) return sendError(res, 'token is required', 400);
  try {
    const removed = await unregisterDevice(auth.userId, token);
    sendJSON(res, { success: true, removed });
  } catch (err) {
    log.error({ error: String(err), userId: auth.userId }, 'Failed to unregister push device');
    sendError(res, 'Failed to unregister device', 500);
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

  // POST|DELETE /api/push/devices - the native app's device token
  if (pathname === '/api/push/devices' && (req.method === 'POST' || req.method === 'DELETE')) {
    await handleDevices(req, res);
    return true;
  }

  // POST /api/push/subscribe - Register a browser's push subscription
  // Stored through the same service (Firestore push_subscriptions) the senders
  // read, keyed by the verified caller, so a subscribed user can actually be reached.
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    const body = await readJson(req, res);
    if (!body) return true;

    const { endpoint, keys } = body;
    // A native app has a device token, not web-push keys: it registers at /api/push/devices.
    if ((body.platform ?? 'web') !== 'web') {
      sendError(res, 'Native apps register their device token at POST /api/push/devices', 400);
      return true;
    }
    if (
      typeof endpoint !== 'string' ||
      !endpoint ||
      typeof keys?.auth !== 'string' ||
      typeof keys?.p256dh !== 'string' ||
      !isAllowedWebPushEndpoint(endpoint)
    ) {
      sendError(res, 'Invalid subscription format', 400);
      return true;
    }

    try {
      await getPushNotificationsService().registerSubscription({
        endpoint,
        keys: { auth: keys.auth, p256dh: keys.p256dh },
        platform: 'web',
        userId: auth.userId,
        createdAt: new Date().toISOString(),
      });
      sendJSON(res, { success: true });
    } catch (err) {
      if (err instanceof EndpointOwnedError) {
        log.warn({ userId: auth.userId }, 'Refused push endpoint claim without matching keys');
        sendError(res, 'This subscription belongs to another account', 403);
        return true;
      }
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
    const auth = await requireAdmin(req, res);
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

      onBodyEnd(req, res, resolve, async () => {
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
