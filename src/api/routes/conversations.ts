/**
 * Conversations Routes
 *
 * GET /api/conversations - Get conversation history
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSONCached, sendError, parsePositiveInt } from '../helpers.js';
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
  return false;
}
