/**
 * Action Tracker API Routes
 *
 * Endpoints for the unified action tracking system:
 * - GET /api/actions - Get user's recent actions
 * - GET /api/actions/pending - Get in-progress actions
 * - GET /api/actions/stats - Summary statistics
 * - GET /api/actions/:id - Get single action by ID
 *
 * @module api/action-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';

import {
  getActionTracker,
  type ActionFilter,
  type ActionType,
  type ActionStatus,
  type FerniAction,
} from '../services/action-tracker/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import {
  handleCorsPreflightIfNeeded,
  sendError,
  sendJSON,
  sendJSONCached,
} from './helpers.js';

const log = createLogger({ module: 'ActionRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleActionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl?: URL
): Promise<boolean> {
  // Only handle /api/actions/* routes
  if (!pathname.startsWith('/api/actions')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require authentication for all action routes
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  // Parse URL if not provided
  const url = parsedUrl || new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

  try {
    // GET /api/actions/pending - Get in-progress actions
    if (pathname === '/api/actions/pending' && req.method === 'GET') {
      return await handlePendingActions(req, res, auth.userId);
    }

    // GET /api/actions/stats - Get action statistics
    if (pathname === '/api/actions/stats' && req.method === 'GET') {
      return await handleActionStats(req, res, auth.userId);
    }

    // GET /api/actions/:id - Get single action
    if (pathname.match(/^\/api\/actions\/act_[a-z0-9_]+$/) && req.method === 'GET') {
      const actionId = pathname.split('/')[3];
      return await handleGetAction(req, res, auth.userId, actionId);
    }

    // GET /api/actions - Get user's recent actions (with optional filters)
    if (pathname === '/api/actions' && req.method === 'GET') {
      return await handleListActions(req, res, auth.userId, url);
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error), pathname, userId: auth.userId }, 'Action route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/actions
 * Returns user's recent actions with optional filtering
 *
 * Query params:
 * - type: ActionType (call, text, email, calendar, reminder)
 * - status: ActionStatus (requested, in_progress, completed, failed, cancelled)
 * - since: ISO date string
 * - until: ISO date string
 * - limit: number (default 20, max 100)
 * - offset: number (for pagination)
 */
async function handleListActions(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  parsedUrl: URL
): Promise<boolean> {
  const filter = buildFilterFromSearchParams(parsedUrl.searchParams);

  try {
    const tracker = getActionTracker();
    const actions = await tracker.getUserActions(userId, filter);

    // Convert dates to ISO strings for JSON response
    const serializedActions = actions.map(serializeAction);

    sendJSON(res, {
      actions: serializedActions,
      count: serializedActions.length,
      filter: {
        type: filter.type,
        status: filter.status,
        limit: filter.limit || 20,
        offset: filter.offset || 0,
      },
    });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to list actions');
    sendError(res, "Couldn't load your activity", 500);
    return true;
  }
}

/**
 * GET /api/actions/pending
 * Returns actions currently in progress
 */
async function handlePendingActions(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    const tracker = getActionTracker();
    const actions = await tracker.getUserActions(userId, {
      status: ['requested', 'in_progress'],
      limit: 50,
    });

    const serializedActions = actions.map(serializeAction);

    sendJSON(res, {
      actions: serializedActions,
      count: serializedActions.length,
    });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pending actions');
    sendError(res, "Couldn't load pending activity", 500);
    return true;
  }
}

/**
 * GET /api/actions/stats
 * Returns summary statistics for user's actions
 */
async function handleActionStats(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    const tracker = getActionTracker();
    const stats = await tracker.getStats(userId);

    // Cache stats for 30 seconds (they don't change rapidly)
    sendJSONCached(res, { stats }, 30);
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get action stats');
    sendError(res, "Couldn't load activity stats", 500);
    return true;
  }
}

/**
 * GET /api/actions/:id
 * Returns a single action by ID
 */
async function handleGetAction(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  actionId: string
): Promise<boolean> {
  try {
    const tracker = getActionTracker();
    const action = await tracker.getAction(actionId);

    if (!action) {
      sendError(res, "Couldn't find that action", 404);
      return true;
    }

    // Security: Ensure user owns this action
    if (action.userId !== userId) {
      sendError(res, "Couldn't find that action", 404);
      return true;
    }

    sendJSON(res, { action: serializeAction(action) });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, actionId }, 'Failed to get action');
    sendError(res, "Couldn't load that action", 500);
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build ActionFilter from URL search parameters
 */
function buildFilterFromSearchParams(searchParams: URLSearchParams): ActionFilter {
  const filter: ActionFilter = {};

  // Type filter (single or comma-separated)
  const typeParam = searchParams.get('type');
  if (typeParam) {
    const types = typeParam.split(',').filter(isValidActionType);
    if (types.length === 1) {
      filter.type = types[0] as ActionType;
    } else if (types.length > 1) {
      filter.type = types as ActionType[];
    }
  }

  // Status filter (single or comma-separated)
  const statusParam = searchParams.get('status');
  if (statusParam) {
    const statuses = statusParam.split(',').filter(isValidActionStatus);
    if (statuses.length === 1) {
      filter.status = statuses[0] as ActionStatus;
    } else if (statuses.length > 1) {
      filter.status = statuses as ActionStatus[];
    }
  }

  // Date filters
  const sinceParam = searchParams.get('since');
  if (sinceParam) {
    const sinceDate = new Date(sinceParam);
    if (!isNaN(sinceDate.getTime())) {
      filter.since = sinceDate;
    }
  }

  const untilParam = searchParams.get('until');
  if (untilParam) {
    const untilDate = new Date(untilParam);
    if (!isNaN(untilDate.getTime())) {
      filter.until = untilDate;
    }
  }

  // Pagination
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  filter.limit = Math.min(Math.max(1, limit), 100); // Clamp between 1 and 100

  const offset = parseInt(searchParams.get('offset') || '0', 10);
  filter.offset = Math.max(0, offset);

  return filter;
}

/**
 * Type guard for ActionType
 */
function isValidActionType(type: string): type is ActionType {
  return ['call', 'text', 'email', 'calendar', 'reminder'].includes(type);
}

/**
 * Type guard for ActionStatus
 */
function isValidActionStatus(status: string): status is ActionStatus {
  return ['requested', 'in_progress', 'completed', 'failed', 'cancelled'].includes(status);
}

/**
 * Serialize action for JSON response (convert Dates to ISO strings)
 */
function serializeAction(action: FerniAction): Record<string, unknown> {
  return {
    ...action,
    createdAt: action.createdAt instanceof Date ? action.createdAt.toISOString() : action.createdAt,
    updatedAt: action.updatedAt instanceof Date ? action.updatedAt.toISOString() : action.updatedAt,
    completedAt: action.completedAt instanceof Date ? action.completedAt.toISOString() : action.completedAt,
    request: {
      ...action.request,
      requestedAt: action.request.requestedAt instanceof Date
        ? action.request.requestedAt.toISOString()
        : action.request.requestedAt,
    },
    execution: action.execution ? {
      ...action.execution,
      startedAt: action.execution.startedAt instanceof Date
        ? action.execution.startedAt.toISOString()
        : action.execution.startedAt,
      completedAt: action.execution.completedAt instanceof Date
        ? action.execution.completedAt.toISOString()
        : action.execution.completedAt,
    } : undefined,
    events: action.events.map(event => ({
      ...event,
      timestamp: event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : event.timestamp,
    })),
  };
}
