/**
 * Session Context API Routes - Voice ↔ App Sync
 *
 * These routes enable cross-channel context awareness:
 * - App tracks what user viewed → Voice knows what they're interested in
 * - Voice stores session summary → App shows insights from conversation
 *
 * @module api/routes/session-context
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getActiveUserContext,
  recordAppScreenView,
  recordAppInteraction,
  formatContextForApp,
  type AppBrowsingContext,
} from '../../services/session-context/session-summary.js';

const log = createLogger({ module: 'SessionContextRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface ScreenViewRequest {
  userId: string;
  screenName: string;
  durationSeconds: number;
}

interface InteractionRequest {
  userId: string;
  interaction: string;
}

interface BrowsingContextRequest {
  userId: string;
  screens: Array<{ name: string; duration: number }>;
  interactions: string[];
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * Record a screen view in the app.
 * POST /api/context/screen-view
 */
export async function handleScreenView(
  req: IncomingMessage,
  res: ServerResponse,
  body: ScreenViewRequest
): Promise<void> {
  try {
    const { userId, screenName, durationSeconds } = body;

    if (!userId || !screenName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing userId or screenName' }));
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
  req: IncomingMessage,
  res: ServerResponse,
  body: InteractionRequest
): Promise<void> {
  try {
    const { userId, interaction } = body;

    if (!userId || !interaction) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing userId or interaction' }));
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
  req: IncomingMessage,
  res: ServerResponse,
  body: BrowsingContextRequest
): Promise<void> {
  try {
    const { userId, screens, interactions } = body;

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing userId' }));
      return;
    }

    // Record screens
    for (const screen of screens || []) {
      await recordAppScreenView(userId, screen.name, screen.duration);
    }

    // Record interactions
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
 * GET /api/context/for-app?userId=xxx
 */
export async function handleGetContextForApp(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const userId = url.searchParams.get('userId');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing userId' }));
      return;
    }

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
 * GET /api/context/active?userId=xxx
 */
export async function handleGetActiveContext(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const userId = url.searchParams.get('userId');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing userId' }));
      return;
    }

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

  // POST /api/context/screen-view
  if (method === 'POST' && url.startsWith('/api/context/screen-view')) {
    await handleScreenView(req, res, parsedBody as ScreenViewRequest);
    return true;
  }

  // POST /api/context/interaction
  if (method === 'POST' && url.startsWith('/api/context/interaction')) {
    await handleInteraction(req, res, parsedBody as InteractionRequest);
    return true;
  }

  // POST /api/context/browsing
  if (method === 'POST' && url.startsWith('/api/context/browsing')) {
    await handleBrowsingContext(req, res, parsedBody as BrowsingContextRequest);
    return true;
  }

  // GET /api/context/for-app
  if (method === 'GET' && url.startsWith('/api/context/for-app')) {
    await handleGetContextForApp(req, res);
    return true;
  }

  // GET /api/context/active
  if (method === 'GET' && url.startsWith('/api/context/active')) {
    await handleGetActiveContext(req, res);
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
