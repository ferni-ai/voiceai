/**
 * Voice Memory Routes
 *
 * Handles conversation memory for voice users:
 * - GET  /api/voice/memory                 - Get user's conversation memory
 * - GET  /api/voice/memory/context         - Get context for new conversation
 * - GET  /api/voice/memory/conversations   - Get recent conversations
 * - POST /api/voice/memory/conversations   - Start recording conversation (deprecated)
 * - PUT  /api/voice/memory/conversations/:id/end - End conversation (deprecated)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getConversationContextForAPI,
  getConversationsWithTurnsForAPI,
  getUserMemoryForAPI,
} from '../../services/memory/realtime-memory.js';
import { sendJson, getUserId } from './helpers.js';

/**
 * Handle voice memory routes.
 * @returns true if route was handled
 */
export async function handleMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string
): Promise<boolean> {
  // GET /api/voice/memory - Get user's conversation memory
  if (route === '/memory' && req.method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const memory = await getUserMemoryForAPI(userId);
    if (!memory) {
      sendJson(res, 200, {
        hasMemory: false,
        totalConversations: 0,
      });
      return true;
    }

    sendJson(res, 200, {
      hasMemory: true,
      totalConversations: memory.totalConversations,
      totalDuration: memory.totalDuration,
      firstConversation: memory.firstConversation,
      lastConversation: memory.lastConversation,
      topTopics: memory.topics.slice(0, 10),
      recentMilestones: memory.relationshipMilestones.slice(-5),
    });
    return true;
  }

  // GET /api/voice/memory/context - Get context for new conversation
  if (route === '/memory/context' && req.method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const context = await getConversationContextForAPI(userId);

    sendJson(res, 200, {
      recentTopics: context.recentTopics,
      unfinishedThreads: context.unfinishedThreads,
      rememberedDetails: context.rememberedDetails,
      suggestedFollowUps: context.suggestedFollowUps,
    });
    return true;
  }

  // GET /api/voice/memory/conversations - Get recent conversations
  if (route === '/memory/conversations' && req.method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const url = new URL(req.url || '', 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const conversations = await getConversationsWithTurnsForAPI(userId, limit);

    sendJson(res, 200, {
      conversations: conversations.map((c) => ({
        id: c.id,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        summary: c.summary,
        topics: c.topics,
        turnCount: c.turnCount,
        voiceVerified: c.voiceVerified,
      })),
    });
    return true;
  }

  // POST /api/voice/memory/conversations - Start recording a conversation
  // NOTE: Deprecated - conversations are now automatically tracked via voice session
  if (route === '/memory/conversations' && req.method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Conversations are now automatically tracked during voice sessions',
      conversationId: `auto_${Date.now()}`,
    });
    return true;
  }

  // PUT /api/voice/memory/conversations/:id/end - End a conversation
  // NOTE: Deprecated - conversations are now automatically ended when sessions disconnect
  if (route.match(/^\/memory\/conversations\/[^/]+\/end$/) && req.method === 'PUT') {
    sendJson(res, 200, {
      success: true,
      message: 'Conversations are now automatically saved when sessions end',
    });
    return true;
  }

  return false;
}
