/**
 * Conversations Routes
 *
 * GET /api/conversations - Get conversation history
 * POST /api/conversations - Record a finished conversation (sent by the web app on hang-up)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { optionalAuthAsync } from '../auth-middleware.js';
import {
  parseBody,
  parsePositiveInt,
  requireUserId,
  sendError,
  sendJSON,
  sendJSONCached,
} from '../helpers.js';
import { API_ERRORS } from '../error-messages.js';

const log = createLogger({ module: 'ConversationsAPI' });

/**
 * GET /api/conversations - Get conversation history
 */
export async function handleGetConversations(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 50, 500);

    const { getConversationHistoryService } =
      await import('../../services/stores/conversation-history.js');
    const historyService = getConversationHistoryService();
    const data = await historyService.getHistory(userId, limit);

    sendJSONCached(res, data, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get conversations');
    sendError(res, API_ERRORS.CONVERSATIONS_FETCH_FAILED, 500);
  }
}

/** The session summary the web app's conversation tracker sends on hang-up. */
export interface RecordConversationBody {
  session: {
    personaId: string;
    personaName: string;
    duration: number;
    messageCount: number;
    insights?: string[];
    topicsDiscussed?: string[];
  };
}

const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 500;

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => item.slice(0, MAX_ITEM_LENGTH));
}

/** Validate the client body; returns null when it isn't a usable session summary. */
export function parseRecordConversationBody(
  body: unknown
): RecordConversationBody['session'] | null {
  const session = (body as { session?: unknown } | null)?.session as
    | Record<string, unknown>
    | undefined;
  if (!session || typeof session !== 'object') return null;
  const { personaId, personaName, duration, messageCount } = session;
  if (typeof personaId !== 'string' || !personaId) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return null;
  if (typeof messageCount !== 'number' || !Number.isFinite(messageCount) || messageCount < 0) {
    return null;
  }
  return {
    personaId,
    personaName: typeof personaName === 'string' ? personaName : personaId,
    duration: Math.round(duration),
    messageCount: Math.round(messageCount),
    insights: toStringList(session['insights']),
    topicsDiscussed: toStringList(session['topicsDiscussed']),
  };
}

/**
 * POST /api/conversations - Record a finished conversation in the history that
 * GET /api/conversations, the relationship routes and the recall tool read.
 *
 * Writes require verified auth: the query-param / header user ID fallback that
 * reads accept would let anyone write into another user's history.
 */
export async function handleRecordConversation(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const auth = await optionalAuthAsync(req);
  if (!auth) {
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return;
  }

  let session: RecordConversationBody['session'] | null;
  try {
    session = parseRecordConversationBody(await parseBody(req));
  } catch {
    session = null;
  }
  if (!session) {
    sendError(res, API_ERRORS.INVALID_REQUEST, 400);
    return;
  }

  try {
    const { getConversationHistoryService } =
      await import('../../services/stores/conversation-history.js');
    const id = await getConversationHistoryService().recordSession(auth.userId, {
      ...session,
      insights: session.insights ?? [],
      topicsDiscussed: session.topicsDiscussed ?? [],
      highlights: [],
    });
    sendJSON(res, { id }, 201);
  } catch (err) {
    log.error({ error: String(err), userId: auth.userId }, 'Failed to record conversation');
    sendError(res, API_ERRORS.CONVERSATION_SAVE_FAILED, 500);
  }
}

/**
 * Route handler for conversation endpoints
 */
export async function handleConversationsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/conversations' && req.method === 'GET') {
    await handleGetConversations(req, res, parsedUrl);
    return true;
  }
  if (pathname === '/api/conversations' && req.method === 'POST') {
    await handleRecordConversation(req, res);
    return true;
  }
  return false;
}
