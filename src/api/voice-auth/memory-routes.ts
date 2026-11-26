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

interface ForgetView {
  keep: <T>(items: T[], textOf: (item: T) => string) => T[];
  about: (text: string | undefined) => boolean;
}

/**
 * What these routes show, less anything about a topic the caller asked Ferni to forget
 * (FORGET_EVERY_READER on; off, everything as read). Every field here is cut from a call's
 * summary or turns, so it reads as a passage (forgottenPassageCheck), as recall reads summaries.
 */
async function forgottenFor(userId: string): Promise<ForgetView> {
  const { forgottenPassageCheck, remembered } = await import('../../memory/index.js');
  const forgotten = await forgottenPassageCheck(userId, 'voice-memory');
  return {
    keep: <T>(items: T[], textOf: (item: T) => string): T[] => remembered(items, forgotten, textOf),
    about: (text: string | undefined): boolean => Boolean(text && forgotten?.(text)),
  };
}
const asIs = (text: string): string => text;

type Conversation = Awaited<ReturnType<typeof getConversationsWithTurnsForAPI>>[number];

/**
 * A call as listed: one about a forgotten topic stays (it happened), without its summary or the
 * words cut from it.
 */
function listed(c: Conversation, forget: ForgetView): Omit<Conversation, 'turns'> {
  const hidden = forget.about(c.summary);
  return {
    id: c.id,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    summary: hidden ? undefined : c.summary,
    topics: hidden ? [] : c.topics,
    turnCount: c.turnCount,
    voiceVerified: c.voiceVerified,
  };
}

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
    const forget = await forgottenFor(userId);

    sendJson(res, 200, {
      hasMemory: true,
      totalConversations: memory.totalConversations,
      totalDuration: memory.totalDuration,
      firstConversation: memory.firstConversation,
      lastConversation: memory.lastConversation,
      topTopics: forget.keep(memory.topics, (t) => t.topic).slice(0, 10),
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
    const forget = await forgottenFor(userId);

    sendJson(res, 200, {
      recentTopics: forget.keep(context.recentTopics, asIs),
      unfinishedThreads: forget.keep(context.unfinishedThreads, (t) => `${t.topic} ${t.summary}`),
      rememberedDetails: forget.keep(context.rememberedDetails, (d) => d.detail),
      suggestedFollowUps: forget.keep(context.suggestedFollowUps, asIs),
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
    const forget = await forgottenFor(userId);

    sendJson(res, 200, { conversations: conversations.map((c) => listed(c, forget)) });
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
