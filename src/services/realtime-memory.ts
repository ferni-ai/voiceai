/**
 * Real-Time Memory Service
 *
 * Persists conversation turns to Firestore AS THEY HAPPEN.
 * No more data loss on disconnect.
 *
 * This solves the fundamental problem where:
 * - Turns were stored in RAM
 * - Only saved at session end
 * - If disconnect happened, ALL memory was lost
 *
 * Now:
 * - Each turn is persisted immediately
 * - Background summarization happens async
 * - Ferni ALWAYS remembers you
 *
 * @module services/realtime-memory
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'realtime-memory' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    emotion?: string;
    topics?: string[];
    durationMs?: number;
  };
}

export interface ConversationMetadata {
  id: string;
  userId: string;
  personaId: string;
  startedAt: Date;
  endedAt?: Date;
  turnCount: number;
  summarized: boolean;
  summary?: string;
}

// Firestore types (to avoid import issues)
interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  collectionGroup: (path: string) => CollectionRef;
}

interface CollectionRef {
  doc: (id: string) => DocumentRef;
  add: (data: unknown) => Promise<{ id: string }>;
  orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
  where: (field: string, op: string, value: unknown) => CollectionRef;
  limit: (n: number) => CollectionRef;
  get: () => Promise<QuerySnapshot>;
}

interface DocumentRef {
  collection: (path: string) => CollectionRef;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  update: (data: unknown) => Promise<void>;
  get: () => Promise<DocumentSnapshot>;
}

interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
}

interface DocumentSnapshot {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  ref: DocumentRef & { parent: { parent: DocumentRef | null } };
}

// ============================================================================
// FIRESTORE CLIENT
// ============================================================================

let db: FirestoreDB | null = null;
let FieldValue: { increment: (n: number) => unknown } | null = null;

async function getFirestore(): Promise<FirestoreDB | null> {
  if (db) return db;

  try {
    const firestore = await import('@google-cloud/firestore');
    const Firestore = firestore.Firestore;
    FieldValue = firestore.FieldValue as typeof FieldValue;

    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    }) as unknown as FirestoreDB;

    log.info('🔥 Realtime memory Firestore connected');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for realtime memory');
    return null;
  }
}

// ============================================================================
// CONVERSATION LIFECYCLE
// ============================================================================

/**
 * Start a new conversation - creates the conversation document
 */
export async function startConversation(
  userId: string,
  personaId: string
): Promise<string> {
  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const firestore = await getFirestore();

  if (firestore) {
    try {
      await firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('conversations')
        .doc(conversationId)
        .set({
          startedAt: new Date(),
          personaId,
          turnCount: 0,
          summarized: false,
        });

      log.info({ userId, conversationId, personaId }, '🎬 Conversation started (realtime)');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to start conversation in Firestore');
    }
  }

  return conversationId;
}

/**
 * Add a turn to the conversation - IMMEDIATE persistence
 * This is the key function - every turn is saved as it happens
 */
export async function persistTurn(
  userId: string,
  conversationId: string,
  turn: ConversationTurn
): Promise<void> {
  const firestore = await getFirestore();

  if (!firestore) {
    log.debug('Firestore unavailable, turn not persisted');
    return;
  }

  try {
    const conversationRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    // Add turn document
    await conversationRef.collection('turns').add({
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp || new Date(),
      ...(turn.metadata && { metadata: turn.metadata }),
    });

    // Increment turn count (fire and forget - don't await)
    if (FieldValue) {
      conversationRef.update({
        turnCount: FieldValue.increment(1),
      }).catch(() => {
        // Ignore - non-critical
      });
    }

    log.debug(
      { userId, conversationId, role: turn.role, preview: turn.content.slice(0, 40) },
      '💾 Turn persisted to Firestore'
    );
  } catch (error) {
    // Log but don't throw - we don't want to break the conversation
    log.error({ error: String(error), userId, conversationId }, 'Failed to persist turn');
  }
}

/**
 * End a conversation - marks it for summarization
 */
export async function endConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const firestore = await getFirestore();

  if (!firestore) return;

  try {
    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .update({
        endedAt: new Date(),
      });

    log.info({ userId, conversationId }, '🏁 Conversation ended, ready for summarization');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to end conversation');
  }
}

// ============================================================================
// CONVERSATION RETRIEVAL (for returning users)
// ============================================================================

/**
 * Get recent conversations for a user
 */
export async function getRecentConversations(
  userId: string,
  limit = 5
): Promise<ConversationMetadata[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        userId,
        personaId: data.personaId as string,
        startedAt: (data.startedAt as { toDate?: () => Date })?.toDate?.() || new Date(data.startedAt as string),
        endedAt: data.endedAt
          ? (data.endedAt as { toDate?: () => Date })?.toDate?.() || new Date(data.endedAt as string)
          : undefined,
        turnCount: (data.turnCount as number) || 0,
        summarized: (data.summarized as boolean) || false,
        summary: data.summary as string | undefined,
      };
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get recent conversations');
    return [];
  }
}

/**
 * Get turns from a specific conversation
 */
export async function getConversationTurns(
  userId: string,
  conversationId: string,
  limit = 50
): Promise<ConversationTurn[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .collection('turns')
      .orderBy('timestamp', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        role: data.role as 'user' | 'assistant',
        content: data.content as string,
        timestamp: (data.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(data.timestamp as string),
        metadata: data.metadata as ConversationTurn['metadata'],
      };
    });
  } catch (error) {
    log.error({ error: String(error), userId, conversationId }, 'Failed to get conversation turns');
    return [];
  }
}

/**
 * Get the last conversation's context (for greeting)
 * This is the key function for returning users
 */
export async function getLastConversationContext(userId: string): Promise<{
  turns: ConversationTurn[];
  personaId: string;
  date: Date;
  summary?: string;
} | null> {
  const conversations = await getRecentConversations(userId, 1);

  if (conversations.length === 0) return null;

  const lastConv = conversations[0];
  const turns = await getConversationTurns(userId, lastConv.id, 20);

  return {
    turns,
    personaId: lastConv.personaId,
    date: lastConv.startedAt,
    summary: lastConv.summary,
  };
}

/**
 * Build a summary from recent turns (fallback if no LLM summary)
 */
export function buildQuickSummary(turns: ConversationTurn[]): string {
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length === 0) return '';

  // Get the last 3 user messages, truncated
  const topics = userTurns.slice(-3).map((t) =>
    t.content.slice(0, 60).replace(/[.!?]+$/, '').trim()
  );

  return `Discussed: ${topics.join('; ')}`;
}

// ============================================================================
// SUMMARIZATION HELPERS
// ============================================================================

/**
 * Get unsummarized conversations (for background job)
 */
export async function getUnsummarizedConversations(
  limit = 100
): Promise<Array<{ userId: string; conversationId: string }>> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    // Query across all users for unsummarized, ended conversations
    const snapshot = await firestore
      .collectionGroup('conversations')
      .where('endedAt', '!=', null)
      .where('summarized', '==', false)
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      userId: (doc.ref.parent.parent as { id?: string } | null)?.id || 'unknown',
      conversationId: doc.id,
    })).filter(item => item.userId !== 'unknown');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get unsummarized conversations');
    return [];
  }
}

/**
 * Mark conversation as summarized and update user profile
 */
export async function markSummarized(
  userId: string,
  conversationId: string,
  summary: string
): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    // Update conversation document
    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .update({
        summarized: true,
        summary,
        summarizedAt: new Date(),
      });

    // Also update the user's lastConversationSummary
    await firestore
      .collection('bogle_users')
      .doc(userId)
      .update({
        lastConversationSummary: summary,
        lastContact: new Date(),
      });

    log.info({ userId, conversationId, summaryPreview: summary.slice(0, 50) }, '✅ Conversation summarized');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to mark conversation as summarized');
  }
}

/**
 * Summarize a conversation asynchronously (fire and forget)
 * This can be called at session end without blocking
 */
export async function summarizeConversationAsync(
  userId: string,
  conversationId: string
): Promise<void> {
  try {
    const turns = await getConversationTurns(userId, conversationId);
    
    if (turns.length < 2) {
      // Too short to summarize meaningfully
      await markSummarized(userId, conversationId, 'Brief conversation');
      return;
    }

    // Try LLM summarization
    let summary: string;
    try {
      const { summarizeWithLLM } = await import('../memory/index.js');
      const { createSummarizationLLMCaller } = await import('./llm-utils.js');
      
      const llmCaller = createSummarizationLLMCaller();
      const result = await summarizeWithLLM(
        conversationId,
        turns.map(t => ({ role: t.role, content: t.content, timestamp: t.timestamp })),
        llmCaller
      );
      
      summary = result.keyPoints?.slice(0, 2).join('; ') || buildQuickSummary(turns);
    } catch {
      // Fallback to quick summary
      summary = buildQuickSummary(turns);
    }

    await markSummarized(userId, conversationId, summary);
  } catch (error) {
    log.error({ error: String(error), userId, conversationId }, 'Async summarization failed');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startConversation,
  persistTurn,
  endConversation,
  getRecentConversations,
  getConversationTurns,
  getLastConversationContext,
  buildQuickSummary,
  getUnsummarizedConversations,
  markSummarized,
  summarizeConversationAsync,
};

