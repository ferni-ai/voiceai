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

import { getFirestoreDatabase, getGCPProjectId } from '../config/environment.js';
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
    const { Firestore } = firestore;
    FieldValue = firestore.FieldValue as typeof FieldValue;

    db = new Firestore({
      projectId: getGCPProjectId(),
      databaseId: getFirestoreDatabase(),
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
export async function startConversation(userId: string, personaId: string): Promise<string> {
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
      conversationRef
        .update({
          turnCount: FieldValue.increment(1),
        })
        .catch(() => {
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
export async function endConversation(userId: string, conversationId: string): Promise<void> {
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
        startedAt:
          (data.startedAt as { toDate?: () => Date })?.toDate?.() ||
          new Date(data.startedAt as string),
        endedAt: data.endedAt
          ? (data.endedAt as { toDate?: () => Date })?.toDate?.() ||
            new Date(data.endedAt as string)
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
        timestamp:
          (data.timestamp as { toDate?: () => Date })?.toDate?.() ||
          new Date(data.timestamp as string),
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
    t.content
      .slice(0, 60)
      .replace(/[.!?]+$/, '')
      .trim()
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

    return snapshot.docs
      .map((doc) => ({
        userId: (doc.ref.parent.parent as { id?: string } | null)?.id || 'unknown',
        conversationId: doc.id,
      }))
      .filter((item) => item.userId !== 'unknown');
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
    await firestore.collection('bogle_users').doc(userId).update({
      lastConversationSummary: summary,
      lastContact: new Date(),
    });

    log.info(
      { userId, conversationId, summaryPreview: summary.slice(0, 50) },
      '✅ Conversation summarized'
    );
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
        turns.map((t) => ({ role: t.role, content: t.content, timestamp: t.timestamp })),
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
// API ADAPTERS (for Memory Browser UI compatibility)
// ============================================================================

/**
 * Get user memory summary for API (/api/voice/memory)
 * Aggregates data from all conversations
 */
export async function getUserMemoryForAPI(userId: string): Promise<{
  totalConversations: number;
  totalDuration: number;
  firstConversation: Date | null;
  lastConversation: Date | null;
  topics: Array<{ topic: string; count: number; lastMentioned: Date }>;
  relationshipMilestones: Array<{ type: string; date: Date; description: string }>;
} | null> {
  const conversations = await getRecentConversations(userId, 100); // Get more for stats

  if (conversations.length === 0) {
    return null;
  }

  // Sort by date for first/last
  const sorted = [...conversations].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  // Calculate total duration (rough estimate based on turn count)
  // Assume average 30 seconds per turn
  const totalDuration = conversations.reduce((sum, c) => sum + c.turnCount * 0.5, 0);

  // Extract topics from summaries (simple word extraction)
  const topicCounts = new Map<string, { count: number; lastMentioned: Date }>();
  for (const conv of conversations) {
    if (conv.summary) {
      // Extract meaningful words from summary as topics
      const words = conv.summary
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4);
      for (const word of words) {
        const existing = topicCounts.get(word);
        if (existing) {
          existing.count++;
          if (conv.startedAt > existing.lastMentioned) {
            existing.lastMentioned = conv.startedAt;
          }
        } else {
          topicCounts.set(word, { count: 1, lastMentioned: conv.startedAt });
        }
      }
    }
  }

  // Convert to array and sort by count
  const topics = Array.from(topicCounts.entries())
    .map(([topic, data]) => ({
      topic,
      count: data.count,
      lastMentioned: data.lastMentioned,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const relationshipMilestones = deriveRelationshipMilestones(conversations);

  return {
    totalConversations: conversations.length,
    totalDuration,
    firstConversation: sorted[0]?.startedAt || null,
    lastConversation: sorted[sorted.length - 1]?.startedAt || null,
    topics,
    relationshipMilestones,
  };
}

function deriveRelationshipMilestones(
  conversations: readonly ConversationMetadata[]
): Array<{ type: string; date: Date; description: string }> {
  if (conversations.length === 0) return [];

  const sorted = [...conversations].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const milestones: Array<{ type: string; date: Date; description: string }> = [];

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  milestones.push({
    type: 'first_conversation',
    date: first.startedAt,
    description: 'First conversation together',
  });

  const countMilestones: Array<{ n: number; type: string; label: string }> = [
    { n: 5, type: 'conversation_5', label: 'Five conversations together' },
    { n: 10, type: 'conversation_10', label: 'Ten conversations together' },
    { n: 25, type: 'conversation_25', label: 'Twenty-five conversations together' },
    { n: 50, type: 'conversation_50', label: 'Fifty conversations together' },
  ];

  for (const m of countMilestones) {
    if (sorted.length >= m.n) {
      milestones.push({
        type: m.type,
        date: sorted[m.n - 1]!.startedAt,
        description: m.label,
      });
    }
  }

  // Deepest / most involved conversation (by turnCount)
  const longest = [...sorted].sort((a, b) => b.turnCount - a.turnCount)[0];
  if (longest && longest.turnCount >= 30) {
    milestones.push({
      type: 'deep_conversation',
      date: longest.startedAt,
      description: `A deep conversation (${longest.turnCount} turns)`,
    });
  }

  // Returned after a meaningful gap
  let maxGapDays = 0;
  let gapReturnDate: Date | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gapDays = Math.floor((cur.startedAt.getTime() - prev.startedAt.getTime()) / 86400000);
    if (gapDays > maxGapDays) {
      maxGapDays = gapDays;
      gapReturnDate = cur.startedAt;
    }
  }

  if (gapReturnDate && maxGapDays >= 14) {
    milestones.push({
      type: 'returned_after_gap',
      date: gapReturnDate,
      description: `Came back after ${maxGapDays} days`,
    });
  }

  // One-month relationship marker (first conversation that is >= 30 days after first)
  const thirtyDaysAfterFirst = new Date(first.startedAt.getTime() + 30 * 86400000);
  const monthMarker = sorted.find((c) => c.startedAt >= thirtyDaysAfterFirst);
  if (monthMarker) {
    milestones.push({
      type: 'one_month_together',
      date: monthMarker.startedAt,
      description: 'A month of staying connected',
    });
  }

  // Sort and de-dupe by (type, date)
  const seen = new Set<string>();
  return (
    milestones
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .filter((m) => {
        const key = `${m.type}:${m.date.toISOString()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      // Don’t return milestones in the future (shouldn’t happen, but keep sane)
      .filter((m) => m.date.getTime() <= last.startedAt.getTime())
  );
}

/**
 * Get conversation context for API (/api/voice/memory/context)
 */
export async function getConversationContextForAPI(userId: string): Promise<{
  recentTopics: string[];
  unfinishedThreads: Array<{ topic: string; lastDiscussed: Date; summary: string }>;
  rememberedDetails: Array<{ detail: string; confidence: number; source: string }>;
  suggestedFollowUps: string[];
}> {
  const context = await getLastConversationContext(userId);

  if (!context) {
    return {
      recentTopics: [],
      unfinishedThreads: [],
      rememberedDetails: [],
      suggestedFollowUps: [],
    };
  }

  // Extract topics from summary
  const recentTopics = context.summary
    ? context.summary
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4)
        .slice(0, 5)
    : [];

  // Find potential follow-ups from unanswered questions
  const unfinishedThreads: Array<{ topic: string; lastDiscussed: Date; summary: string }> = [];
  for (const turn of context.turns) {
    if (turn.role === 'user' && turn.content.includes('?')) {
      unfinishedThreads.push({
        topic: `${turn.content.split('?')[0].slice(-30)}?`,
        lastDiscussed: turn.timestamp,
        summary: turn.content.slice(0, 100),
      });
    }
  }

  // Extract remembered details from assistant responses
  const rememberedDetails: Array<{ detail: string; confidence: number; source: string }> = [];
  for (const turn of context.turns) {
    if (turn.role === 'assistant' && turn.content.length > 50) {
      rememberedDetails.push({
        detail: turn.content.slice(0, 100),
        confidence: 0.7,
        source: 'conversation',
      });
    }
  }

  return {
    recentTopics,
    unfinishedThreads: unfinishedThreads.slice(-3),
    rememberedDetails: rememberedDetails.slice(-5),
    suggestedFollowUps: [], // Could be generated from topics
  };
}

/**
 * Get conversations with turns for API (/api/voice/memory/conversations)
 */
export async function getConversationsWithTurnsForAPI(
  userId: string,
  limit = 10
): Promise<
  Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | undefined;
    summary: string | undefined;
    topics: string[];
    turns: ConversationTurn[];
    turnCount: number;
    voiceVerified: boolean;
  }>
> {
  const conversations = await getRecentConversations(userId, limit);

  // Fetch turns for each conversation
  const withTurns = await Promise.all(
    conversations.map(async (conv) => {
      const turns = await getConversationTurns(userId, conv.id, 50);

      // Extract topics from summary
      const topics = conv.summary
        ? conv.summary
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 4)
            .slice(0, 5)
        : [];

      return {
        id: conv.id,
        startedAt: conv.startedAt,
        endedAt: conv.endedAt,
        summary: conv.summary,
        topics,
        turns,
        turnCount: turns.length,
        voiceVerified: false, // Not tracked in realtime-memory yet
      };
    })
  );

  return withTurns;
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
  // API adapters
  getUserMemoryForAPI,
  getConversationContextForAPI,
  getConversationsWithTurnsForAPI,
};
