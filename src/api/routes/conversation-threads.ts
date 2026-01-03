/**
 * Conversation Threads API Routes
 *
 * Tracks ongoing conversation topics across sessions.
 * "Better Than Human" - We remember every thread of your story.
 *
 * A "thread" is a topic or theme the user has been discussing across
 * multiple conversations. Unlike raw conversation history, threads
 * represent semantic continuity - "we were talking about your job search"
 * or "that thing with your sister."
 *
 * GET /api/conversations/threads - Get open conversation threads
 * POST /api/conversations/threads - Create/update a thread
 * PATCH /api/conversations/threads/:id - Update thread status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendError, parsePositiveInt, readBody } from '../helpers.js';

const log = createLogger({ module: 'ConversationThreadsAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface ConversationThread {
  id: string;
  userId: string;
  topic: string;
  lastMessage: string;
  personaId: string;
  personaName: string;
  status: 'open' | 'resolved' | 'paused';
  priority: 'high' | 'normal' | 'low';
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  relatedCommitments?: string[];
  emotionalContext?: string;
}

// ============================================================================
// IN-MEMORY STORE (TODO: Move to Firestore)
// ============================================================================

// Temporary in-memory store - will be replaced with Firestore
const threadStore = new Map<string, ConversationThread[]>();

function getThreadsForUser(userId: string): ConversationThread[] {
  return threadStore.get(userId) || [];
}

function saveThread(thread: ConversationThread): void {
  const threads = threadStore.get(thread.userId) || [];
  const existingIndex = threads.findIndex((t) => t.id === thread.id);
  
  if (existingIndex >= 0) {
    threads[existingIndex] = thread;
  } else {
    threads.push(thread);
  }
  
  threadStore.set(thread.userId, threads);
}

// ============================================================================
// EXTRACT THREADS FROM CONVERSATION HISTORY
// ============================================================================

async function extractThreadsFromHistory(userId: string): Promise<ConversationThread[]> {
  try {
    // Get conversation history
    const { getConversationHistoryService } = await import(
      '../../services/stores/conversation-history.js'
    );
    const historyService = getConversationHistoryService();
    const history = await historyService.getHistory(userId, 50);

    if (!history?.messages?.length) {
      return [];
    }

    // Group messages by topic/theme
    // For now, extract recent distinct topics from the conversation
    const threads: ConversationThread[] = [];
    const seenTopics = new Set<string>();

    // Get the last few conversations and extract topics
    const recentMessages = history.messages.slice(-20);
    
    for (const msg of recentMessages) {
      if (msg.role === 'user' && msg.content && msg.content.length > 20) {
        // Simple topic extraction - take first 50 chars as topic preview
        const topic = extractTopic(msg.content);
        
        if (!seenTopics.has(topic)) {
          seenTopics.add(topic);
          
          threads.push({
            id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            userId,
            topic,
            lastMessage: msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : ''),
            personaId: msg.personaId || 'ferni',
            personaName: getPersonaName(msg.personaId || 'ferni'),
            status: 'open',
            priority: 'normal',
            createdAt: msg.timestamp || new Date().toISOString(),
            updatedAt: msg.timestamp || new Date().toISOString(),
            messageCount: 1,
          });
        }
      }
    }

    return threads.slice(0, 5); // Return top 5 threads
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not extract threads from history');
    return [];
  }
}

function extractTopic(content: string): string {
  // Simple topic extraction - can be enhanced with NLP
  const cleaned = content
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Take first meaningful phrase
  const words = cleaned.split(' ').filter((w) => w.length > 2);
  return words.slice(0, 5).join(' ');
}

function getPersonaName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    peter: 'Peter',
    maya: 'Maya',
    alex: 'Alex',
    jordan: 'Jordan',
    nayan: 'Nayan',
  };
  return names[personaId] || 'Ferni';
}

// ============================================================================
// GET /api/conversations/threads
// ============================================================================

export async function handleGetThreads(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  // Get userId from query param (like background-results API)
  const userId = parsedUrl.searchParams.get('userId');
  if (!userId) {
    sendError(res, { code: 'MISSING_USER_ID', message: 'userId is required' }, 400);
    return;
  }

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 5, 20);
    const status = parsedUrl.searchParams.get('status') || 'open';

    // First check stored threads
    let threads = getThreadsForUser(userId);

    // If no stored threads, extract from history
    if (threads.length === 0) {
      threads = await extractThreadsFromHistory(userId);
      // Cache extracted threads
      for (const thread of threads) {
        saveThread(thread);
      }
    }

    // Filter by status
    if (status !== 'all') {
      threads = threads.filter((t) => t.status === status);
    }

    // Sort by updatedAt descending
    threads.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Limit
    threads = threads.slice(0, limit);

    sendJSON(res, {
      success: true,
      threads,
      count: threads.length,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get conversation threads');
    sendError(res, { code: 'THREADS_FETCH_FAILED', message: 'Failed to fetch threads' }, 500);
  }
}

// ============================================================================
// POST /api/conversations/threads - Create/update thread
// ============================================================================

export async function handleCreateThread(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await readBody<{
      topic: string;
      lastMessage: string;
      personaId?: string;
      status?: 'open' | 'resolved' | 'paused';
      priority?: 'high' | 'normal' | 'low';
      emotionalContext?: string;
    }>(req, res);

    if (!body || !body.topic) {
      sendError(res, { code: 'INVALID_REQUEST', message: 'Topic is required' }, 400);
      return;
    }

    const thread: ConversationThread = {
      id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      topic: body.topic,
      lastMessage: body.lastMessage || body.topic,
      personaId: body.personaId || 'ferni',
      personaName: getPersonaName(body.personaId || 'ferni'),
      status: body.status || 'open',
      priority: body.priority || 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 1,
      emotionalContext: body.emotionalContext,
    };

    saveThread(thread);

    sendJSON(res, {
      success: true,
      thread,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to create thread');
    sendError(res, { code: 'THREAD_CREATE_FAILED', message: 'Failed to create thread' }, 500);
  }
}

// ============================================================================
// PATCH /api/conversations/threads/:id
// ============================================================================

export async function handleUpdateThread(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  threadId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await readBody<{
      status?: 'open' | 'resolved' | 'paused';
      lastMessage?: string;
    }>(req, res);

    if (!body) return;

    const threads = getThreadsForUser(userId);
    const thread = threads.find((t) => t.id === threadId);

    if (!thread) {
      sendError(res, { code: 'NOT_FOUND', message: 'Thread not found' }, 404);
      return;
    }

    if (body.status) {
      thread.status = body.status;
    }
    if (body.lastMessage) {
      thread.lastMessage = body.lastMessage;
      thread.messageCount++;
    }
    thread.updatedAt = new Date().toISOString();

    saveThread(thread);

    sendJSON(res, {
      success: true,
      thread,
    });
  } catch (err) {
    log.error({ error: err, userId, threadId }, 'Failed to update thread');
    sendError(res, { code: 'THREAD_UPDATE_FAILED', message: 'Failed to update thread' }, 500);
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleConversationThreadsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/conversations/threads
  if (pathname === '/api/conversations/threads' && req.method === 'GET') {
    await handleGetThreads(req, res, parsedUrl);
    return true;
  }

  // POST /api/conversations/threads
  if (pathname === '/api/conversations/threads' && req.method === 'POST') {
    await handleCreateThread(req, res, parsedUrl);
    return true;
  }

  // PATCH /api/conversations/threads/:id
  const updateMatch = pathname.match(/^\/api\/conversations\/threads\/([^/]+)$/);
  if (updateMatch && req.method === 'PATCH') {
    await handleUpdateThread(req, res, parsedUrl, updateMatch[1]);
    return true;
  }

  return false;
}
