/**
 * Thread Persistence - Firestore Storage
 *
 * Persists conversation threads to Firestore for cross-session continuity.
 * Threads survive server restarts and are shared across all instances.
 *
 * Storage structure:
 * - bogle_users/{userId}/conversation_threads/{threadId}
 * - bogle_users/{userId}/conversation_threads/{threadId}/messages/{messageId}
 *
 * @module services/conversation-thread/thread-persistence
 */

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, removeUndefined } from '../../utils/firestore-utils.js';
import { onConversationThreadChange } from '../data-layer/hooks/index.js';
import type {
  ConversationThread,
  ThreadMessage,
  ThreadStatus,
  EngagementChannel,
} from './types.js';
import type { PersonaId } from '../../personas/types.js';

const log = createLogger({ module: 'ThreadPersistence' });

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let db: Firestore | null = null;
let initialized = false;

/**
 * Get or initialize the Firestore instance.
 */
function getFirestoreDb(): Firestore | null {
  if (initialized) {
    return db;
  }

  try {
    db = new Firestore();
    initialized = true;
    log.debug('Thread persistence Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for thread persistence');
    initialized = true;
    return null;
  }
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const THREADS_COLLECTION = 'conversation_threads';
const MESSAGES_COLLECTION = 'messages';

function getThreadsPath(userId: string): string {
  return `bogle_users/${userId}/${THREADS_COLLECTION}`;
}

function getMessagesPath(userId: string, threadId: string): string {
  return `bogle_users/${userId}/${THREADS_COLLECTION}/${threadId}/${MESSAGES_COLLECTION}`;
}

// ============================================================================
// FIRESTORE DOCUMENT TYPES
// ============================================================================

interface FirestoreThread {
  id: string;
  userId: string;
  currentOwnerId: string;
  ownershipHistory: Array<{
    fromAgentId: string;
    toAgentId: string;
    transferredAt: Timestamp;
    reason: string;
  }>;
  channelsUsed: string[];
  originChannel: string;
  lastChannel: string;
  messageCount: number;
  startedAt: Timestamp;
  lastActivityAt: Timestamp;
  lastAgentMessageAt?: Timestamp;
  lastUserMessageAt?: Timestamp;
  triggerType?: string;
  outreachId?: string;
  topicTags: string[];
  emotionalContext?: {
    current: string;
    trajectory: string;
  };
  status: string;
  statusReason?: string;
}

interface FirestoreMessage {
  id: string;
  threadId: string;
  role: string;
  agentId?: string;
  channel: string;
  direction: string;
  content: string;
  timestamp: Timestamp;
  metadata?: {
    sentiment?: string;
    intent?: string;
    toolCalls?: string[];
    outreachId?: string;
    triggeredChannelSwitch?: boolean;
  };
}

// ============================================================================
// THREAD PERSISTENCE
// ============================================================================

/**
 * Save a thread to Firestore.
 */
export async function saveThread(thread: ConversationThread): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ threadId: thread.id }, 'Firestore unavailable, thread not persisted');
    return false;
  }

  try {
    const firestoreThread: FirestoreThread = {
      id: thread.id,
      userId: thread.userId,
      currentOwnerId: thread.currentOwnerId,
      ownershipHistory: thread.ownershipHistory.map((h) => ({
        fromAgentId: h.fromAgentId,
        toAgentId: h.toAgentId,
        transferredAt: Timestamp.fromDate(h.transferredAt),
        reason: h.reason,
      })),
      channelsUsed: thread.channelsUsed,
      originChannel: thread.originChannel,
      lastChannel: thread.lastChannel,
      messageCount: thread.messageCount,
      startedAt: Timestamp.fromDate(thread.startedAt),
      lastActivityAt: Timestamp.fromDate(thread.lastActivityAt),
      lastAgentMessageAt: thread.lastAgentMessageAt
        ? Timestamp.fromDate(thread.lastAgentMessageAt)
        : undefined,
      lastUserMessageAt: thread.lastUserMessageAt
        ? Timestamp.fromDate(thread.lastUserMessageAt)
        : undefined,
      triggerType: thread.triggerType,
      outreachId: thread.outreachId,
      topicTags: thread.topicTags,
      emotionalContext: thread.emotionalContext,
      status: thread.status,
      statusReason: thread.statusReason,
    };

    const docRef = db.collection(getThreadsPath(thread.userId)).doc(thread.id);
    await docRef.set(cleanForFirestore(removeUndefined(firestoreThread)));

    log.debug({ threadId: thread.id, userId: thread.userId }, 'Thread saved to Firestore');

    // Index to semantic memory
    void onConversationThreadChange(
      thread.userId,
      thread.id,
      {
        topic: thread.topicTags.length > 0 ? thread.topicTags.join(', ') : 'conversation',
        participantAgents: [
          thread.currentOwnerId,
          ...thread.ownershipHistory.map((h) => h.toAgentId),
        ],
        messageCount: thread.messageCount,
        startedAt: thread.startedAt.toISOString(),
        emotionalContext: thread.emotionalContext?.current,
        status: thread.status as 'active' | 'paused' | 'closed',
      },
      'update'
    );

    return true;
  } catch (error) {
    log.error({ error: String(error), threadId: thread.id }, 'Failed to save thread');
    return false;
  }
}

/**
 * Load a thread from Firestore.
 */
export async function loadThread(
  userId: string,
  threadId: string
): Promise<ConversationThread | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  try {
    const docRef = db.collection(getThreadsPath(userId)).doc(threadId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as FirestoreThread;
    return firestoreToThread(data);
  } catch (error) {
    log.error({ error: String(error), threadId }, 'Failed to load thread');
    return null;
  }
}

/**
 * Load the most recent active thread for a user.
 */
export async function loadActiveThread(userId: string): Promise<ConversationThread | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  try {
    const threadsRef = db.collection(getThreadsPath(userId));
    const query = threadsRef
      .where('status', '==', 'active')
      .orderBy('lastActivityAt', 'desc')
      .limit(1);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data() as FirestoreThread;
    return firestoreToThread(data);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load active thread');
    return null;
  }
}

/**
 * Load recent threads for a user.
 */
export async function loadRecentThreads(userId: string, limit = 10): Promise<ConversationThread[]> {
  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    const threadsRef = db.collection(getThreadsPath(userId));
    const query = threadsRef.orderBy('lastActivityAt', 'desc').limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToThread(doc.data() as FirestoreThread));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load recent threads');
    return [];
  }
}

// ============================================================================
// MESSAGE PERSISTENCE
// ============================================================================

/**
 * Save a message to Firestore.
 */
export async function saveMessage(userId: string, message: ThreadMessage): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    return false;
  }

  try {
    const firestoreMessage: FirestoreMessage = {
      id: message.id,
      threadId: message.threadId,
      role: message.role,
      agentId: message.agentId,
      channel: message.channel,
      direction: message.direction,
      content: message.content,
      timestamp: Timestamp.fromDate(message.timestamp),
      metadata: message.metadata,
    };

    const docRef = db.collection(getMessagesPath(userId, message.threadId)).doc(message.id);
    await docRef.set(cleanForFirestore(removeUndefined(firestoreMessage)));

    log.debug({ messageId: message.id, threadId: message.threadId }, 'Message saved to Firestore');
    return true;
  } catch (error) {
    log.error({ error: String(error), messageId: message.id }, 'Failed to save message');
    return false;
  }
}

/**
 * Load messages for a thread.
 */
export async function loadMessages(
  userId: string,
  threadId: string,
  limit = 50
): Promise<ThreadMessage[]> {
  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    const messagesRef = db.collection(getMessagesPath(userId, threadId));
    const query = messagesRef.orderBy('timestamp', 'desc').limit(limit);

    const snapshot = await query.get();

    // Reverse to get chronological order
    return snapshot.docs.map((doc) => firestoreToMessage(doc.data() as FirestoreMessage)).reverse();
  } catch (error) {
    log.warn({ error: String(error), threadId }, 'Failed to load messages');
    return [];
  }
}

// ============================================================================
// CONVERTERS
// ============================================================================

/**
 * Type guard to check if a value is a Firestore Timestamp-like object.
 */
function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

/**
 * Safely convert a timestamp-like value to a Date.
 * Handles Firestore Timestamps, Date objects, strings, and numbers.
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (isTimestampLike(value)) {
    // Firestore Timestamp
    return value.toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  // Fallback to current time if value is invalid
  return new Date();
}

/**
 * Safely convert an optional timestamp-like value to a Date or undefined.
 */
function toDateOptional(value: unknown): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return toDate(value);
}

/**
 * Convert Firestore document to ConversationThread.
 */
function firestoreToThread(data: FirestoreThread): ConversationThread {
  return {
    id: data.id,
    userId: data.userId,
    currentOwnerId: data.currentOwnerId as PersonaId,
    ownershipHistory: data.ownershipHistory.map((h) => ({
      fromAgentId: h.fromAgentId as PersonaId,
      toAgentId: h.toAgentId as PersonaId,
      transferredAt: toDate(h.transferredAt),
      reason: h.reason,
    })),
    channelsUsed: data.channelsUsed as EngagementChannel[],
    originChannel: data.originChannel as EngagementChannel,
    lastChannel: data.lastChannel as EngagementChannel,
    messages: [], // Messages loaded separately
    messageCount: data.messageCount,
    startedAt: toDate(data.startedAt),
    lastActivityAt: toDate(data.lastActivityAt),
    lastAgentMessageAt: toDateOptional(data.lastAgentMessageAt),
    lastUserMessageAt: toDateOptional(data.lastUserMessageAt),
    triggerType: data.triggerType,
    outreachId: data.outreachId,
    topicTags: data.topicTags,
    emotionalContext: data.emotionalContext
      ? {
          current: data.emotionalContext.current,
          trajectory: data.emotionalContext.trajectory as 'improving' | 'stable' | 'declining',
        }
      : undefined,
    status: data.status as ThreadStatus,
    statusReason: data.statusReason,
  };
}

/**
 * Convert Firestore document to ThreadMessage.
 */
function firestoreToMessage(data: FirestoreMessage): ThreadMessage {
  return {
    id: data.id,
    threadId: data.threadId,
    role: data.role as 'agent' | 'user' | 'system',
    agentId: data.agentId as PersonaId | undefined,
    channel: data.channel as EngagementChannel,
    direction: data.direction as 'inbound' | 'outbound',
    content: data.content,
    timestamp: toDate(data.timestamp),
    metadata: data.metadata
      ? {
          sentiment: data.metadata.sentiment as 'positive' | 'neutral' | 'negative' | undefined,
          intent: data.metadata.intent,
          toolCalls: data.metadata.toolCalls,
          outreachId: data.metadata.outreachId,
          triggeredChannelSwitch: data.metadata.triggeredChannelSwitch,
        }
      : undefined,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Mark a thread as closed in Firestore.
 */
export async function closeThread(
  userId: string,
  threadId: string,
  reason?: string
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    return false;
  }

  try {
    const docRef = db.collection(getThreadsPath(userId)).doc(threadId);
    await docRef.update(
      cleanForFirestore({
        status: 'closed',
        statusReason: reason,
        lastActivityAt: Timestamp.now(),
      })
    );

    log.debug({ threadId, userId }, 'Thread closed in Firestore');
    return true;
  } catch (error) {
    log.warn({ error: String(error), threadId }, 'Failed to close thread');
    return false;
  }
}

/**
 * Delete old threads (for cleanup jobs).
 */
export async function deleteOldThreads(userId: string, olderThanDays: number): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    return 0;
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const threadsRef = db.collection(getThreadsPath(userId));
    const query = threadsRef
      .where('status', '==', 'closed')
      .where('lastActivityAt', '<', Timestamp.fromDate(cutoff))
      .limit(100);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    log.info({ userId, deleted: snapshot.size }, 'Deleted old threads');
    return snapshot.size;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to delete old threads');
    return 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const threadPersistence = {
  saveThread,
  loadThread,
  loadActiveThread,
  loadRecentThreads,
  saveMessage,
  loadMessages,
  closeThread,
  deleteOldThreads,
};
