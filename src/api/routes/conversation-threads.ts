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
import admin from 'firebase-admin';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendError, parsePositiveInt, readBody } from '../helpers.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'ConversationThreadsAPI' });

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for conversation threads');
      } else {
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for conversation threads');
    return null;
  }
}

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
// FIRESTORE PERSISTENCE
// ============================================================================

// Local cache for performance (TTL: 5 minutes)
const threadCache = new Map<string, { threads: ConversationThread[]; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get threads for a user from Firestore
 * Collection: users/{userId}/conversation_threads
 */
async function getThreadsForUser(userId: string): Promise<ConversationThread[]> {
  // Check cache first
  const cached = threadCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.threads;
  }

  const db = getFirestore();
  if (!db) {
    log.warn({ userId }, 'Firestore unavailable, returning empty threads');
    return [];
  }

  try {
    const snapshot = await db
      .collection('users')
      .doc(userId)
      .collection('conversation_threads')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const threads: ConversationThread[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        topic: data.topic,
        lastMessage: data.lastMessage,
        personaId: data.personaId,
        personaName: data.personaName,
        status: data.status,
        priority: data.priority,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messageCount: data.messageCount,
        relatedCommitments: data.relatedCommitments,
        emotionalContext: data.emotionalContext,
      };
    });

    // Update cache
    threadCache.set(userId, { threads, cachedAt: Date.now() });

    return threads;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get threads from Firestore');
    return [];
  }
}

/**
 * Save a thread to Firestore
 * Collection: users/{userId}/conversation_threads/{threadId}
 */
async function saveThread(thread: ConversationThread): Promise<void> {
  const db = getFirestore();
  if (!db) {
    log.warn({ threadId: thread.id }, 'Firestore unavailable, thread not persisted');
    return;
  }

  try {
    const threadRef = db
      .collection('users')
      .doc(thread.userId)
      .collection('conversation_threads')
      .doc(thread.id);

    await threadRef.set(cleanForFirestore(thread), { merge: true });

    // Invalidate cache
    threadCache.delete(thread.userId);

    log.debug({ threadId: thread.id, userId: thread.userId }, 'Thread saved to Firestore');
  } catch (error) {
    log.error({ error: String(error), threadId: thread.id }, 'Failed to save thread to Firestore');
  }
}

/**
 * Delete a thread from Firestore
 */
async function deleteThread(userId: string, threadId: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) {
    return false;
  }

  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('conversation_threads')
      .doc(threadId)
      .delete();

    // Invalidate cache
    threadCache.delete(userId);

    return true;
  } catch (error) {
    log.error({ error: String(error), threadId, userId }, 'Failed to delete thread');
    return false;
  }
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

    if (!history?.sessions?.length) {
      return [];
    }

    // Group sessions by topic/theme
    const threads: ConversationThread[] = [];
    const seenTopics = new Set<string>();

    // Get the recent sessions and extract topics
    const recentSessions = history.sessions.slice(-10);

    for (const session of recentSessions) {
      // Extract topics from session
      for (const topic of session.topicsDiscussed || []) {
        if (!seenTopics.has(topic) && topic.length > 3) {
          seenTopics.add(topic);

          threads.push({
            id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            userId,
            topic,
            lastMessage: session.highlights?.[0] || topic,
            personaId: session.personaId || 'ferni',
            personaName: getPersonaName(session.personaId || 'ferni'),
            status: 'open',
            priority: 'normal',
            createdAt: session.date || new Date().toISOString(),
            updatedAt: session.date || new Date().toISOString(),
            messageCount: session.messageCount || 1,
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
    sendError(res, 'userId is required', 400);
    return;
  }

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 5, 20);
    const status = parsedUrl.searchParams.get('status') || 'open';

    // First check stored threads (now async)
    let threads = await getThreadsForUser(userId);

    // If no stored threads, extract from history
    if (threads.length === 0) {
      threads = await extractThreadsFromHistory(userId);
      // Persist extracted threads to Firestore
      await Promise.all(threads.map((thread) => saveThread(thread)));
    }

    // Filter by status
    if (status !== 'all') {
      threads = threads.filter((t) => t.status === status);
    }

    // Sort by updatedAt descending (already sorted by Firestore, but ensure consistency)
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
    sendError(res, 'Failed to fetch threads', 500);
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
    }>(req);

    if (!body || !body.topic) {
      sendError(res, 'Topic is required', 400);
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

    await saveThread(thread);

    sendJSON(res, {
      success: true,
      thread,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to create thread');
    sendError(res, 'Failed to create thread', 500);
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
    }>(req);

    if (!body) return;

    const threads = await getThreadsForUser(userId);
    const thread = threads.find((t) => t.id === threadId);

    if (!thread) {
      sendError(res, 'Thread not found', 404);
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

    await saveThread(thread);

    sendJSON(res, {
      success: true,
      thread,
    });
  } catch (err) {
    log.error({ error: err, userId, threadId }, 'Failed to update thread');
    sendError(res, 'Failed to update thread', 500);
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
