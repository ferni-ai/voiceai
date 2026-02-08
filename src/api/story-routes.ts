/**
 * Story Routes - Your Story Actions API
 *
 * API for the "Your Story" dashboard to display a holistic narrative of care.
 * Integrates action tracking with superhuman services to show users what
 * Ferni has done for them, not as a transaction log, but as a story of care.
 *
 * Philosophy: "Your best friend forgets. We don't."
 *
 * Endpoints:
 * - GET /api/story/actions - Recent care moments with narrative framing
 * - GET /api/story/summary - Aggregated stats for dashboard cards
 * - GET /api/story/stream - SSE for real-time action updates
 *
 * @module api/story-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getActionTracker } from '../services/action-tracker/tracker.js';
import type { ActionType, FerniAction } from '../services/action-tracker/types.js';
import { loadUserCommitments, type Commitment } from '../services/superhuman/commitment-keeper.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'story-routes' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Care moment types - emphasizing the narrative, not the transaction
 */
export type CareMomentType =
  | 'called_for_you' // Made a call on their behalf
  | 'messaged_for_you' // Sent a text/email
  | 'remembered' // Followed up on something they mentioned
  | 'protected_time' // Created calendar events/reminders
  | 'kept_commitment'; // Tracked and completed a commitment

/**
 * A care moment - a narrative-framed action
 */
export interface CareMoment {
  id: string;
  type: CareMomentType;
  /** Human-readable narrative description */
  narrative: string;
  /** When this happened */
  timestamp: string;
  /** Which persona did this */
  persona: string;
  /** Target of the action (e.g., "Mom", "Dr. Smith") */
  target?: string;
  /** Whether it was successful */
  success: boolean;
  /** Additional context */
  details?: string;
}

/**
 * Story actions response - care narrative, not transaction log
 */
export interface StoryActionsResponse {
  /** Recent care moments */
  recentCare: CareMoment[];
  /** Superhuman context */
  commitmentProgress: {
    kept: number;
    pending: number;
    total: number;
  };
  /** Total actions taken */
  totalActions: number;
  /** Summary stats for dashboard visualization */
  summary: {
    callsMade: number;
    messagesSent: number;
    remindersKept: number;
    commitmentsFulfilled: number;
  };
}

/**
 * Story summary response - stats for dashboard cards
 */
export interface StorySummaryResponse {
  /** Stats by action type */
  callsMade: number;
  messagesSent: number;
  remindersKept: number;
  calendarEventsCreated: number;
  /** Commitment stats */
  commitmentsFulfilled: number;
  commitmentsTracking: number;
  /** Time range */
  since: string;
  /** Total relationship depth indicators */
  totalConversations?: number;
  relationshipDays?: number;
}

// ============================================================================
// ROUTE PREFIX
// ============================================================================

const STORY_PREFIX = '/api/story';

/**
 * Check if pathname is a story route
 */
export function isStoryRoute(pathname: string): boolean {
  return pathname.startsWith(STORY_PREFIX);
}

// ============================================================================
// NARRATIVE HELPERS
// ============================================================================

/**
 * Map action type to care moment type
 */
function actionTypeToCareMomentType(type: ActionType): CareMomentType {
  switch (type) {
    case 'call':
      return 'called_for_you';
    case 'text':
    case 'email':
      return 'messaged_for_you';
    case 'calendar':
      return 'protected_time';
    case 'reminder':
      return 'remembered';
    default:
      return 'remembered';
  }
}

/**
 * Generate a warm, narrative description for an action
 * This is the heart of the "Better than Human" framing
 */
function generateNarrative(action: FerniAction): string {
  const { target } = action.request;
  const success = action.status === 'completed';

  switch (action.type) {
    case 'call':
      if (success) {
        if (target) {
          return `Called ${target} for you${action.execution?.resultSummary ? ` - ${action.execution.resultSummary}` : ''}`;
        }
        return `Made a call on your behalf${action.execution?.resultSummary ? ` - ${action.execution.resultSummary}` : ''}`;
      } else {
        return target
          ? `Tried to reach ${target} - will try again`
          : 'Call attempt - will try again';
      }

    case 'text':
      if (success) {
        if (target) {
          return `Sent a message to ${target} for you`;
        }
        return 'Sent a message on your behalf';
      } else {
        return target ? `Message to ${target} didn't go through` : 'Message pending';
      }

    case 'email':
      if (success) {
        if (target) {
          return `Emailed ${target} for you`;
        }
        return 'Sent an email on your behalf';
      } else {
        return target ? `Email to ${target} pending` : 'Email pending';
      }

    case 'calendar':
      return action.request.description || 'Protected time on your calendar';

    case 'reminder':
      return action.request.description || 'Set a reminder for you';

    default:
      return action.request.description || 'Took care of something for you';
  }
}

/**
 * Convert a FerniAction to a CareMoment
 */
/**
 * Extract the persona ID from action metadata.
 * Falls back to 'ferni' if no persona info is available.
 */
function extractPersonaFromAction(action: FerniAction): string {
  // Check metadata for explicit persona or agentId
  if (action.metadata) {
    const personaId =
      action.metadata.personaId || action.metadata.persona || action.metadata.agentId;
    if (typeof personaId === 'string' && personaId.length > 0) {
      return personaId;
    }
  }

  // Check execution toolId for persona hints (e.g., tools prefixed with persona domains)
  if (action.execution?.toolId) {
    const toolId = action.execution.toolId.toLowerCase();
    if (toolId.includes('habit') || toolId.includes('routine') || toolId.includes('maya'))
      return 'maya';
    if (toolId.includes('calendar') || toolId.includes('email') || toolId.includes('alex'))
      return 'alex';
    if (toolId.includes('research') || toolId.includes('stock') || toolId.includes('peter'))
      return 'peter';
    if (toolId.includes('milestone') || toolId.includes('event') || toolId.includes('jordan'))
      return 'jordan';
    if (toolId.includes('wisdom') || toolId.includes('quote') || toolId.includes('nayan'))
      return 'nayan';
  }

  return 'ferni';
}

function actionToCareMoment(action: FerniAction): CareMoment {
  return {
    id: action.id,
    type: actionTypeToCareMomentType(action.type),
    narrative: generateNarrative(action),
    timestamp: action.createdAt.toISOString(),
    persona: extractPersonaFromAction(action),
    target: action.request.target,
    success: action.status === 'completed',
    details: action.execution?.resultSummary,
  };
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/story/actions
 *
 * Returns recent care moments with narrative framing.
 */
async function handleGetActions(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const tracker = getActionTracker();

    // Parse query params
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
    const since = url.searchParams.get('since');

    // Get user actions
    const filter: { limit: number; since?: Date } = { limit };
    if (since) {
      filter.since = new Date(since);
    }

    const actions = await tracker.getUserActions(userId, filter);

    // Convert to care moments
    const recentCare = actions.map(actionToCareMoment);

    // Get action stats for summary
    const stats = await tracker.getStats(userId);

    // Get commitment stats
    let commitmentProgress = { kept: 0, pending: 0, total: 0 };
    let commitmentsFulfilled = 0;
    try {
      const commitments = await loadUserCommitments(userId);
      const kept = commitments.filter((c: Commitment) => c.status === 'completed').length;
      const pending = commitments.filter((c: Commitment) => c.status === 'active').length;
      commitmentProgress = { kept, pending, total: commitments.length };
      commitmentsFulfilled = kept;
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Failed to load commitments for story');
    }

    const response: StoryActionsResponse = {
      recentCare,
      commitmentProgress,
      totalActions: actions.length,
      // Include summary stats for the frontend visualization
      summary: {
        callsMade: stats.byType.call || 0,
        messagesSent: (stats.byType.text || 0) + (stats.byType.email || 0),
        remindersKept: stats.byType.reminder || 0,
        commitmentsFulfilled,
      },
    };

    sendJSON(res, response, 200);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get story actions');
    sendError(res, 'Failed to load your story', 500);
  }
}

/**
 * GET /api/story/summary
 *
 * Returns aggregated stats for dashboard cards.
 */
async function handleGetSummary(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const tracker = getActionTracker();

    // Get stats from action tracker
    const stats = await tracker.getStats(userId);

    // Get commitment stats
    let commitmentsFulfilled = 0;
    let commitmentsTracking = 0;
    try {
      const commitments = await loadUserCommitments(userId);
      commitmentsFulfilled = commitments.filter((c: Commitment) => c.status === 'completed').length;
      commitmentsTracking = commitments.filter((c: Commitment) => c.status === 'active').length;
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Failed to load commitments for summary');
    }

    // Calculate 30-day window
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const response: StorySummaryResponse = {
      callsMade: stats.byType.call || 0,
      messagesSent: (stats.byType.text || 0) + (stats.byType.email || 0),
      remindersKept: stats.byType.reminder || 0,
      calendarEventsCreated: stats.byType.calendar || 0,
      commitmentsFulfilled,
      commitmentsTracking,
      since: since.toISOString(),
    };

    sendJSON(res, response, 200);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get story summary');
    sendError(res, 'Failed to load your story summary', 500);
  }
}

/**
 * GET /api/story/stream
 *
 * SSE endpoint for real-time action updates.
 */
async function handleStream(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

  // Subscribe to action events
  const tracker = getActionTracker();
  const unsubscribe = tracker.onEvent((event) => {
    // Only send events for this user
    if (event.userId !== userId) return;

    // Convert to care moment
    const careMoment = actionToCareMoment(event.action);

    // Map event type to SSE event name
    let eventName = 'action_updated';
    switch (event.type) {
      case 'action_created':
        eventName = 'action_created';
        break;
      case 'action_completed':
        eventName = 'action_completed';
        break;
      case 'action_failed':
        eventName = 'action_failed';
        break;
    }

    const data = {
      type: eventName,
      action: careMoment,
      timestamp: event.timestamp.toISOString(),
    };

    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // Set up heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Clean up on close
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    log.debug({ userId }, 'Story SSE stream closed');
  });

  log.debug({ userId }, 'Story SSE stream connected');
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Handle story routes
 */
export async function handleStoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Early bailout for non-story routes
  if (!isStoryRoute(pathname)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true;
  }

  const { userId } = auth;
  const method = req.method || 'GET';
  const route = pathname.replace(STORY_PREFIX, '') || '/';

  log.debug({ route, method, userId }, 'Handling story route');

  try {
    // GET /api/story/actions
    if (route === '/actions' && method === 'GET') {
      await handleGetActions(req, res, userId);
      return true;
    }

    // GET /api/story/summary
    if (route === '/summary' && method === 'GET') {
      await handleGetSummary(req, res, userId);
      return true;
    }

    // GET /api/story/stream
    if (route === '/stream' && method === 'GET') {
      await handleStream(req, res, userId);
      return true;
    }

    // Unknown route
    sendError(res, 'Story route not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error), route, userId }, 'Story route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
