/**
 * User Events HTTP Routes
 *
 * Poll + SSE fallbacks for voice→UI events when WebSocket is unavailable
 * (Firebase Hosting does not proxy WebSockets).
 *
 * - GET /api/user-events/pending?since=<ms>
 * - GET /api/user-events/stream (SSE)
 */

import type { IncomingMessage, ServerResponse } from 'http';

import {
  getPendingUserEvents,
  subscribeUserEventsSSE,
  type UserEvent,
} from '../services/user-events/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'UserEventsRoutes' });

function parseSince(value: string | null): number {
  if (!value) return 0;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber;
  const asDate = Date.parse(value);
  return Number.isNaN(asDate) ? 0 : asDate;
}

function handlePending(req: IncomingMessage, res: ServerResponse, userId: string): void {
  const url = new URL(req.url || '/api/user-events/pending', 'http://localhost');
  const since = parseSince(url.searchParams.get('since'));
  const events = getPendingUserEvents(userId, since);
  sendJSON(res, { events });
}

function handleStream(req: IncomingMessage, res: ServerResponse, userId: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

  const unsubscribe = subscribeUserEventsSSE((event: UserEvent) => {
    if (event.userId !== userId) return;
    res.write(`event: user_event\ndata: ${JSON.stringify(event)}\n\n`);
  });

  let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  const scheduleHeartbeat = (): void => {
    heartbeatTimeout = setTimeout(() => {
      res.write(`: heartbeat\n\n`);
      scheduleHeartbeat();
    }, 30000);
  };
  scheduleHeartbeat();

  req.on('close', () => {
    if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
    unsubscribe();
    log.debug({ userId }, 'User events SSE stream closed');
  });

  log.debug({ userId }, 'User events SSE stream connected');
}

/**
 * Handle /api/user-events/* routes.
 * @returns true if handled
 */
export async function handleUserEventsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/user-events')) {
    return false;
  }

  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return true;

  try {
    if (pathname === '/api/user-events/pending' && req.method === 'GET') {
      handlePending(req, res, auth.userId);
      return true;
    }

    if (pathname === '/api/user-events/stream' && req.method === 'GET') {
      handleStream(req, res, auth.userId);
      return true;
    }

    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err), userId: auth.userId }, 'User events route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
