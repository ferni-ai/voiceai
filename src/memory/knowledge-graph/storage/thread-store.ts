/**
 * Thread Store - Track conversation arcs across sessions
 *
 * Threads represent ongoing topics/stories that span multiple conversations:
 * - "Preparing for mom's surgery" (spans multiple sessions)
 * - "Job search journey" (active for weeks)
 * - "Planning wedding" (recurring topic)
 *
 * Key features:
 * - Open loops tracking ("We were discussing X, never finished")
 * - Temporal continuity ("Last time we talked about this...")
 * - Entity linking (threads involve specific people/events)
 * - Status tracking (active, open, resolved, dormant, recurring)
 *
 * @module memory/knowledge-graph/storage/thread-store
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { Thread, ThreadSession, ThreadStatus } from '../types.js';

const log = createLogger({ module: 'ThreadStore' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'knowledge_graph';
const THREADS_SUBCOLLECTION = 'threads';

// Thread becomes dormant if not discussed for this many days
const DORMANT_THRESHOLD_DAYS = 14;

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let firestoreInstance: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (firestoreInstance) return firestoreInstance;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    firestoreInstance = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return firestoreInstance;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for thread store');
    return null;
  }
}

async function getThreadsRef(userId: string) {
  const db = await getFirestore();
  if (!db) return null;
  return db.collection(COLLECTION).doc(userId).collection(THREADS_SUBCOLLECTION);
}

// ============================================================================
// CREATE & UPDATE
// ============================================================================

/**
 * Create a new conversation thread
 */
export async function createThread(
  userId: string,
  thread: {
    topic: string;
    relatedTopics?: string[];
    entityIds?: string[];
    initialSession: ThreadSession;
  }
): Promise<Thread | null> {
  const ref = await getThreadsRef(userId);
  if (!ref) return null;

  const id = uuidv4();
  const now = new Date();

  const fullThread: Thread = {
    id,
    userId,
    topic: thread.topic,
    relatedTopics: thread.relatedTopics || [],
    entityIds: thread.entityIds || [],
    sessions: [thread.initialSession],
    status: 'active',
    openQuestions: [],
    pendingActions: [],
    createdAt: now,
    lastUpdatedAt: now,
    salience: 0.5,
    emotionalWeight: 0.5,
    embedding: [], // Could be populated with topic embedding
  };

  await ref.doc(id).set(cleanForFirestore(fullThread));

  log.info({ userId, threadId: id, topic: thread.topic }, '✨ Created thread');

  return fullThread;
}

/**
 * Update an existing thread
 */
export async function updateThread(
  userId: string,
  threadId: string,
  updates: Partial<Thread>
): Promise<Thread | null> {
  const ref = await getThreadsRef(userId);
  if (!ref) return null;

  const docRef = ref.doc(threadId);
  const doc = await docRef.get();

  if (!doc.exists) {
    log.warn({ userId, threadId }, 'Thread not found for update');
    return null;
  }

  const cleanedUpdates = cleanForFirestore({
    ...updates,
    lastUpdatedAt: new Date(),
  });

  await docRef.update(cleanedUpdates);

  const updated = await docRef.get();
  return updated.data() as Thread;
}

/**
 * Record a new session discussing this thread
 */
export async function recordThreadSession(
  userId: string,
  threadId: string,
  session: ThreadSession
): Promise<Thread | null> {
  const ref = await getThreadsRef(userId);
  if (!ref) return null;

  const docRef = ref.doc(threadId);
  const doc = await docRef.get();

  if (!doc.exists) {
    log.warn({ userId, threadId }, 'Thread not found for session recording');
    return null;
  }

  const thread = doc.data() as Thread;
  const updatedSessions = [...thread.sessions, session];

  // Update status based on session count
  let newStatus: ThreadStatus = thread.status;
  if (updatedSessions.length >= 3 && thread.status === 'active') {
    newStatus = 'recurring'; // Discussed multiple times
  }

  await docRef.update({
    sessions: cleanForFirestore(updatedSessions),
    lastUpdatedAt: new Date(),
    status: newStatus,
    salience: Math.min(1, thread.salience + 0.1), // Increase salience on discussion
  });

  const updated = await docRef.get();
  return updated.data() as Thread;
}

/**
 * Add an open question to a thread
 */
export async function addOpenQuestion(
  userId: string,
  threadId: string,
  question: string
): Promise<void> {
  const ref = await getThreadsRef(userId);
  if (!ref) return;

  const { FieldValue } = await import('firebase-admin/firestore');

  await ref.doc(threadId).update({
    openQuestions: FieldValue.arrayUnion(question),
    status: 'open',
    lastUpdatedAt: new Date(),
  });

  log.debug({ userId, threadId, question }, 'Added open question to thread');
}

/**
 * Resolve an open question
 */
export async function resolveOpenQuestion(
  userId: string,
  threadId: string,
  question: string
): Promise<void> {
  const ref = await getThreadsRef(userId);
  if (!ref) return;

  const docRef = ref.doc(threadId);
  const doc = await docRef.get();

  if (!doc.exists) return;

  const thread = doc.data() as Thread;
  const openQuestions = Array.isArray(thread.openQuestions) ? thread.openQuestions : [];
  const updatedQuestions = openQuestions.filter((q) => q !== question);

  // If no more open questions or actions, mark as resolved
  const pendingActions = Array.isArray(thread.pendingActions) ? thread.pendingActions : [];
  const newStatus: ThreadStatus =
    updatedQuestions.length === 0 && pendingActions.length === 0 ? 'resolved' : thread.status;

  await docRef.update({
    openQuestions: updatedQuestions,
    status: newStatus,
    lastUpdatedAt: new Date(),
  });

  log.debug({ userId, threadId, question }, 'Resolved open question');
}

/**
 * Close/resolve a thread
 */
export async function closeThread(
  userId: string,
  threadId: string,
  resolution?: string
): Promise<void> {
  const ref = await getThreadsRef(userId);
  if (!ref) return;

  await ref.doc(threadId).update({
    status: 'resolved',
    resolution,
    resolvedAt: new Date(),
    lastUpdatedAt: new Date(),
  });

  log.info({ userId, threadId, resolution }, 'Closed thread');
}

// ============================================================================
// RETRIEVE
// ============================================================================

/**
 * Get a single thread by ID
 */
export async function getThread(userId: string, threadId: string): Promise<Thread | null> {
  const ref = await getThreadsRef(userId);
  if (!ref) return null;

  const doc = await ref.doc(threadId).get();
  return doc.exists ? (doc.data() as Thread) : null;
}

/**
 * Get all active threads for a user
 */
export async function getActiveThreads(
  userId: string,
  options?: {
    includeOpen?: boolean;
    includeRecurring?: boolean;
    limit?: number;
  }
): Promise<Thread[]> {
  const ref = await getThreadsRef(userId);
  if (!ref) return [];

  // Build status filter
  const statuses: ThreadStatus[] = ['active'];
  if (options?.includeOpen) statuses.push('open');
  if (options?.includeRecurring) statuses.push('recurring');

  let query = ref.where('status', 'in', statuses).orderBy('lastUpdatedAt', 'desc');

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data() as Thread);
}

/**
 * Get threads that have open loops (unresolved questions/actions)
 */
export async function getOpenLoopThreads(userId: string, limit = 10): Promise<Thread[]> {
  const ref = await getThreadsRef(userId);
  if (!ref) return [];

  // Get threads with 'open' status
  const snapshot = await ref
    .where('status', '==', 'open')
    .orderBy('lastUpdatedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Thread);
}

/**
 * Get threads involving specific entities
 */
export async function getThreadsForEntity(
  userId: string,
  entityId: string,
  options?: {
    statuses?: ThreadStatus[];
    limit?: number;
  }
): Promise<Thread[]> {
  const ref = await getThreadsRef(userId);
  if (!ref) return [];

  let query: FirebaseFirestore.Query = ref.where('entityIds', 'array-contains', entityId);

  if (options?.statuses && options.statuses.length > 0) {
    query = query.where('status', 'in', options.statuses);
  }

  query = query.orderBy('lastUpdatedAt', 'desc');

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data() as Thread);
}

/**
 * Find or create a thread for a topic
 */
export async function findOrCreateThread(
  userId: string,
  topic: string,
  sessionInfo: ThreadSession,
  entityIds?: string[]
): Promise<Thread> {
  const ref = await getThreadsRef(userId);
  if (!ref) {
    // Return a mock thread if Firestore unavailable
    return {
      id: uuidv4(),
      userId,
      topic,
      relatedTopics: [],
      entityIds: entityIds || [],
      sessions: [sessionInfo],
      status: 'active',
      openQuestions: [],
      pendingActions: [],
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      salience: 0.5,
      emotionalWeight: 0.5,
      embedding: [],
    };
  }

  // Look for existing thread on this topic
  const normalizedTopic = topic.toLowerCase().trim();

  const existingSnapshot = await ref
    .where('status', 'in', ['active', 'open', 'recurring'])
    .orderBy('lastUpdatedAt', 'desc')
    .limit(20)
    .get();

  // Find by topic match
  for (const doc of existingSnapshot.docs) {
    const thread = doc.data() as Thread;
    if (
      thread.topic.toLowerCase().includes(normalizedTopic) ||
      normalizedTopic.includes(thread.topic.toLowerCase()) ||
      thread.relatedTopics.some(
        (rt) =>
          rt.toLowerCase().includes(normalizedTopic) || normalizedTopic.includes(rt.toLowerCase())
      )
    ) {
      // Found matching thread - add session
      await recordThreadSession(userId, thread.id, sessionInfo);
      return { ...thread, sessions: [...thread.sessions, sessionInfo] };
    }
  }

  // No match found - create new thread
  const newThread = await createThread(userId, {
    topic,
    entityIds,
    initialSession: sessionInfo,
  });

  return newThread!;
}

/**
 * Mark dormant threads that haven't been discussed recently
 */
export async function markDormantThreads(userId: string): Promise<number> {
  const ref = await getThreadsRef(userId);
  if (!ref) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DORMANT_THRESHOLD_DAYS);

  const snapshot = await ref
    .where('status', 'in', ['active', 'recurring'])
    .where('lastUpdatedAt', '<', cutoff)
    .get();

  let marked = 0;
  for (const doc of snapshot.docs) {
    await doc.ref.update({
      status: 'dormant',
      markedDormantAt: new Date(),
    });
    marked++;
  }

  if (marked > 0) {
    log.info({ userId, marked }, 'Marked threads as dormant');
  }

  return marked;
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get thread statistics for a user
 */
export async function getThreadStats(userId: string): Promise<{
  total: number;
  byStatus: Record<ThreadStatus, number>;
  openQuestionCount: number;
  averageSessionsPerThread: number;
  oldestActiveThread?: { topic: string; createdAt: Date };
}> {
  const ref = await getThreadsRef(userId);
  if (!ref) {
    return {
      total: 0,
      byStatus: { active: 0, open: 0, resolved: 0, dormant: 0, recurring: 0, archived: 0 },
      openQuestionCount: 0,
      averageSessionsPerThread: 0,
    };
  }

  const snapshot = await ref.get();
  const threads = snapshot.docs.map((doc) => doc.data() as Thread);

  const byStatus: Record<ThreadStatus, number> = {
    active: 0,
    open: 0,
    resolved: 0,
    dormant: 0,
    recurring: 0,
    archived: 0,
  };

  let openQuestionCount = 0;
  let totalSessions = 0;
  let oldestActive: Thread | null = null;

  for (const thread of threads) {
    byStatus[thread.status] = (byStatus[thread.status] || 0) + 1;
    openQuestionCount += thread.openQuestions.length;
    totalSessions += thread.sessions.length;

    if (
      ['active', 'open', 'recurring'].includes(thread.status) &&
      (!oldestActive || new Date(thread.createdAt) < new Date(oldestActive.createdAt))
    ) {
      oldestActive = thread;
    }
  }

  return {
    total: threads.length,
    byStatus,
    openQuestionCount,
    averageSessionsPerThread: threads.length > 0 ? totalSessions / threads.length : 0,
    oldestActiveThread: oldestActive
      ? { topic: oldestActive.topic, createdAt: new Date(oldestActive.createdAt) }
      : undefined,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DORMANT_THRESHOLD_DAYS };
