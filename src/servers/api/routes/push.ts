/**
 * Push Notification Routes
 *
 * Web Push notification management.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit, requireAdmin } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PushRoutes' });

// VAPID configuration
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

// In-memory push subscription storage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalWithPush = global as typeof global & { pushSubscriptions?: Map<string, any[]> };
if (!globalWithPush.pushSubscriptions) {
  globalWithPush.pushSubscriptions = new Map();
}

interface PushSubscription {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
  userId?: string;
  createdAt?: string;
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
    if (!VAPID_PUBLIC_KEY) {
      log.warn('VAPID_PUBLIC_KEY not set - push notifications unavailable');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Push notifications not configured',
          message: 'VAPID_PUBLIC_KEY environment variable not set.',
        })
      );
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }));
    return true;
  }

  // POST /api/push/subscribe - Register push subscription
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: Add error handler to prevent hanging promises on request errors
    return new Promise((resolve) => {
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in push subscribe');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', () => {
        try {
          const subscription = JSON.parse(body) as PushSubscription;

          if (!subscription.endpoint || !subscription.keys) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid subscription format' }));
            resolve(true);
            return;
          }

          const userId = subscription.userId || 'anonymous';
          const userSubs = globalWithPush.pushSubscriptions!.get(userId) || [];

          // Avoid duplicates
          const exists = userSubs.some((s) => s.endpoint === subscription.endpoint);
          if (!exists) {
            userSubs.push({
              ...subscription,
              createdAt: new Date().toISOString(),
            });
            globalWithPush.pushSubscriptions!.set(userId, userSubs);
            log.info({ userId }, 'Push subscription registered');
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          log.error({ error: (err as Error).message }, 'Failed to register push subscription');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to register subscription' }));
          }
        }
        resolve(true);
      });
    });
  }

  // POST /api/push/unsubscribe - Remove push subscription
  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: Add error handler to prevent hanging promises on request errors
    return new Promise((resolve) => {
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in push unsubscribe');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', () => {
        try {
          const { endpoint, userId } = JSON.parse(body) as { endpoint: string; userId?: string };
          const userSubs = globalWithPush.pushSubscriptions!.get(userId || 'anonymous') || [];
          const filtered = userSubs.filter((s) => s.endpoint !== endpoint);

          if (filtered.length > 0) {
            globalWithPush.pushSubscriptions!.set(userId || 'anonymous', filtered);
          } else {
            globalWithPush.pushSubscriptions!.delete(userId || 'anonymous');
          }

          log.info({ userId: userId || 'anonymous' }, 'Push subscription removed');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          log.error({ error: (err as Error).message }, 'Failed to unsubscribe');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to unsubscribe' }));
          }
        }
        resolve(true);
      });
    });
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
            const pushModule = await import('../../../services/push-notifications.js');
            const service = pushModule.getPushNotificationsService();
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
