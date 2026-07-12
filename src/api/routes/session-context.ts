/**
 * Session Context API Routes - Voice ↔ App Sync
 *
 * These routes enable cross-channel context awareness:
 * - App tracks what user viewed → Voice knows what they're interested in
 * - Voice stores session summary → App shows insights from conversation
 *
 * SECURITY: All routes require auth; userId is bound to auth.userId.
 *
 * @module api/routes/session-context
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireAuth } from '../auth-middleware.js';
import {
  getActiveUserContext,
  recordAppScreenView,
  recordAppInteraction,
  formatContextForApp,
} from '../../services/session-context/session-summary.js';

const log = createLogger({ module: 'SessionContextRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface ScreenViewRequest {
  userId?: string;
  screenName: string;
  durationSeconds: number;
}

interface InteractionRequest {
  userId?: string;
  interaction: string;
}

interface BrowsingContextRequest {
  userId?: string;
  screens: Array<{ name: string; duration: number }>;
  interactions: string[];
}

function assertOwnUserId(
  authUserId: string,
  isAdmin: boolean,
  requestedUserId: string | undefined | null,
  res: ServerResponse
): boolean {
  if (requestedUserId && requestedUserId !== authUserId && !isAdmin) {
    log.warn(
      { authUserId, requestedUserId },
      'SECURITY: Blocked cross-user session-context access'
    );
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return false;
  }
  return true;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * Record a screen view in the app.
 * POST /api/context/screen-view
 */
export async function handleScreenView(
  _req: IncomingMessage,
  res: ServerResponse,
  body: ScreenViewRequest,
  userId: string
): Promise<void> {
  try {
    const { screenName, durationSeconds } = body;

    if (!screenName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing screenName' }));
      return;
    }

    await recordAppScreenView(userId, screenName, durationSeconds || 0);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record screen view');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Record an interaction in the app.
 * POST /api/context/interaction
 */
export async function handleInteraction(
  _req: IncomingMessage,
  res: ServerResponse,
  body: InteractionRequest,
  userId: string
): Promise<void> {
  try {
    const { interaction } = body;

    if (!interaction) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing interaction' }));
      return;
    }

    await recordAppInteraction(userId, interaction);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record interaction');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Batch record browsing context.
 * POST /api/context/browsing
 */
export async function handleBrowsingContext(
  _req: IncomingMessage,
  res: ServerResponse,
  body: BrowsingContextRequest,
  userId: string
): Promise<void> {
  try {
    const { screens, interactions } = body;

    for (const screen of screens || []) {
      await recordAppScreenView(userId, screen.name, screen.duration);
    }

    for (const interaction of interactions || []) {
      await recordAppInteraction(userId, interaction);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record browsing context');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Get context for displaying in app (after voice call).
 * GET /api/context/for-app
 */
export async function handleGetContextForApp(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const context = await getActiveUserContext(userId);

    if (!context) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          bridgeMessage: null,
          insights: [],
          pendingTopics: [],
          emotionalState: 'neutral',
        })
      );
      return;
    }

    const appContext = formatContextForApp(context);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(appContext));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get context for app');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Get full active context (for debugging/admin).
 * GET /api/context/active
 */
export async function handleGetActiveContext(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const context = await getActiveUserContext(userId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(context || { message: 'No active context' }));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get active context');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// ============================================================================
// ROUTE MATCHER
// ============================================================================

/**
 * Main router for session context endpoints.
 */
export async function handleSessionContextRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  const isContextRoute =
    url.startsWith('/api/context/screen-view') ||
    url.startsWith('/api/context/interaction') ||
    url.startsWith('/api/context/browsing') ||
    url.startsWith('/api/context/for-app') ||
    url.startsWith('/api/context/active');

  if (!isContextRoute) {
    return false;
  }

  // SECURITY: Require auth; bind all operations to auth.userId
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  const parsedUrl = new URL(url, 'http://localhost');
  const queryUserId = parsedUrl.searchParams.get('userId');
  const bodyUserId =
    parsedBody && typeof parsedBody === 'object' && 'userId' in parsedBody
      ? String((parsedBody as { userId?: string }).userId || '')
      : undefined;

  if (!assertOwnUserId(auth.userId, auth.isAdmin, queryUserId || bodyUserId || undefined, res)) {
    return true;
  }

  // Admins may act on another userId when explicitly requested; everyone else uses auth.userId
  const userId =
    auth.isAdmin && (queryUserId || bodyUserId) ? queryUserId || bodyUserId || auth.userId : auth.userId;

  // POST /api/context/screen-view
  if (method === 'POST' && url.startsWith('/api/context/screen-view')) {
    await handleScreenView(req, res, parsedBody as ScreenViewRequest, userId);
    return true;
  }

  // POST /api/context/interaction
  if (method === 'POST' && url.startsWith('/api/context/interaction')) {
    await handleInteraction(req, res, parsedBody as InteractionRequest, userId);
    return true;
  }

  // POST /api/context/browsing
  if (method === 'POST' && url.startsWith('/api/context/browsing')) {
    await handleBrowsingContext(req, res, parsedBody as BrowsingContextRequest, userId);
    return true;
  }

  // GET /api/context/for-app
  if (method === 'GET' && url.startsWith('/api/context/for-app')) {
    await handleGetContextForApp(req, res, userId);
    return true;
  }

  // GET /api/context/active
  if (method === 'GET' && url.startsWith('/api/context/active')) {
    await handleGetActiveContext(req, res, userId);
    return true;
  }

  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  handleScreenView as recordScreenView,
  handleInteraction as recordInteractionApi,
  handleBrowsingContext as recordBrowsingContextApi,
  handleGetContextForApp as getContextForApp,
  handleGetActiveContext as getActiveContext,
};
