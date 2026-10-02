/**
 * Conversation Catch-Up Summarization
 *
 * A call that drops (worker crash, network loss, container restart) never
 * reaches session end, so its conversation is never summarized: no
 * `lastConversationSummary`, nothing in the summaries / semantic index, and
 * the next call starts cold. This sweep finds conversations that went quiet
 * without a summary and does what session end would have done:
 *
 * 1. close the conversation (`endedAt` = last activity, `endedBy: 'catch-up'`)
 * 2. summarize its turns (both roles) with the session summarizer
 * 3. save the summary to `summaries/{id}` (with `conversationId`) and index it
 *    for semantic recall, like session end
 * 4. mark the conversation `summarized: true`; `lastConversationSummary` is
 *    only replaced when this conversation is newer (markSummarized)
 *
 * Run by the `conversation-catchup` Cloud Scheduler job
 * (POST /api/jobs/conversation-catchup).
 *
 * @module services/memory/conversation-catchup
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { ConversationTurn } from './realtime-memory.js';
import { conversationEndTime, toDateOrNull } from './conversation-summary-recency.js';
import { recordCatchUpRun } from './memory-capture-metrics.js';

const log = createLogger({ module: 'conversation-catchup' });

/** A conversation is "over" once it has had no activity for this long. */
export const DEFAULT_IDLE_MS = 30 * 60_000;
/** Don't reach back further than this (old backlog is not worth an LLM call each). */
export const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
export const DEFAULT_BATCH_SIZE = 50;

export interface CandidateConversation {
  userId: string;
  conversationId: string;
  data: Record<string, unknown>;
}

export interface CatchUpSummary {
  id: string;
  shortText: string;
  mainTopics: string[];
  keyPoints: string[];
  emotionalArc: string;
  embedding?: number[];
}

export interface CatchUpDeps {
  queryCandidates: (params: {
    startedAfter: Date;
    startedBefore: Date;
    limit: number;
  }) => Promise<CandidateConversation[]>;
  getTurns: (userId: string, conversationId: string) => Promise<ConversationTurn[]>;
  summarize: (conversationId: string, turns: ConversationTurn[]) => Promise<CatchUpSummary>;
  closeConversation: (userId: string, conversationId: string, endedAt: Date) => Promise<void>;
  saveSummary: (
    userId: string,
    conversationId: string,
    summary: CatchUpSummary,
    timestamp: Date,
    turnCount: number
  ) => Promise<void>;
  indexSummary: (userId: string, summary: CatchUpSummary, timestamp: Date) => Promise<void>;
  markSummarized: (userId: string, conversationId: string, text: string) => Promise<boolean>;
}

export interface CatchUpOptions {
  now?: Date;
  idleMs?: number;
  lookbackMs?: number;
  batchSize?: number;
  dryRun?: boolean;
}

export interface CatchUpResult {
  scanned: number;
  summarized: number;
  skippedActive: number;
  failed: number;
  conversationIds: string[];
}

/** Stable summary id for a conversation, so a re-run overwrites instead of duplicating. */
export function catchUpSummaryId(conversationId: string): string {
  return `summary_${conversationId}`;
}

async function summarizeOne(
  deps: CatchUpDeps,
  candidate: CandidateConversation,
  endedAt: Date
): Promise<void> {
  const { userId, conversationId, data } = candidate;
  if (!toDateOrNull(data.endedAt)) {
    await deps.closeConversation(userId, conversationId, endedAt);
  }

  const turns = await deps.getTurns(userId, conversationId);
  if (turns.length < 2) {
    await deps.markSummarized(userId, conversationId, 'Brief conversation');
    return;
  }

  const summary = await deps.summarize(conversationId, turns);
  await deps.saveSummary(userId, conversationId, summary, endedAt, turns.length);
  await deps.indexSummary(userId, summary, endedAt);
  // Last, so a failure above leaves it unsummarized for the next run.
  const marked = await deps.markSummarized(userId, conversationId, summary.shortText);
  if (!marked) throw new Error('markSummarized failed');
}

/**
 * Summarize conversations that ended (explicitly or by going quiet) without
 * a summary. Never throws for a single conversation; counts it as failed.
 */
export async function runConversationCatchUp(
  deps: CatchUpDeps,
  options: CatchUpOptions = {}
): Promise<CatchUpResult> {
  const now = options.now ?? new Date();
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const lookbackMs = options.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const result: CatchUpResult = {
    scanned: 0,
    summarized: 0,
    skippedActive: 0,
    failed: 0,
    conversationIds: [],
  };

  const candidates = await deps.queryCandidates({
    startedAfter: new Date(now.getTime() - lookbackMs),
    startedBefore: new Date(now.getTime() - idleMs),
    limit: batchSize,
  });

  for (const candidate of candidates) {
    result.scanned += 1;
    // endedAt, else lastActivityAt, else startedAt. Also waits idleMs after an
    // explicit end so it never races the session-end summarizer.
    const lastActivity = conversationEndTime(candidate.data);
    if (!lastActivity || now.getTime() - lastActivity.getTime() < idleMs) {
      result.skippedActive += 1;
      continue;
    }
    if (options.dryRun) {
      result.conversationIds.push(candidate.conversationId);
      continue;
    }
    try {
      await summarizeOne(deps, candidate, lastActivity);
      result.summarized += 1;
      result.conversationIds.push(candidate.conversationId);
    } catch (error) {
      result.failed += 1;
      log.warn(
        { error: String(error), userId: candidate.userId, conversationId: candidate.conversationId },
        'Catch-up summarization failed (will retry next run)'
      );
    }
  }

  recordCatchUpRun(result);
  log.info(
    { ...result, conversationIds: undefined, dryRun: options.dryRun === true },
    '🧾 Conversation catch-up finished'
  );
  return result;
}

// ============================================================================
// DEFAULT (FIRESTORE) DEPENDENCIES
// ============================================================================

/** Production dependencies: realtime-memory's Firestore, the session summarizer, semantic RAG. */
export async function createDefaultCatchUpDeps(): Promise<CatchUpDeps> {
  const realtime = await import('./realtime-memory.js');
  const db = await realtime.getRealtimeFirestore();
  if (!db) throw new Error('Firestore unavailable for conversation catch-up');

  const conversationRef = (userId: string, conversationId: string) =>
    db.collection('bogle_users').doc(userId).collection('conversations').doc(conversationId);

  return {
    queryCandidates: async ({ startedAfter, startedBefore, limit }) => {
      const snapshot = await db
        .collectionGroup('conversations')
        .where('summarized', '==', false)
        .where('startedAt', '>=', startedAfter)
        .where('startedAt', '<=', startedBefore)
        .orderBy('startedAt', 'asc')
        .limit(limit)
        .get();
      return snapshot.docs
        .map((doc) => ({
          userId: (doc.ref.parent.parent as { id?: string } | null)?.id ?? '',
          conversationId: doc.id,
          data: doc.data() ?? {},
        }))
        .filter((c) => c.userId !== '');
    },

    getTurns: (userId, conversationId) =>
      realtime.getConversationTurns(userId, conversationId, 200),

    summarize: async (conversationId, turns) => {
      try {
        const { summarizeWithLLM } = await import('../../memory/index.js');
        const { createSummarizationLLMCaller } = await import('../llm-utils.js');
        const result = await summarizeWithLLM(
          conversationId,
          turns.map((t) => ({ role: t.role, content: t.content, timestamp: t.timestamp })),
          createSummarizationLLMCaller()
        );
        return {
          id: catchUpSummaryId(conversationId),
          shortText:
            result.keyPoints?.slice(0, 2).join('; ') || realtime.buildQuickSummary(turns),
          mainTopics: result.mainTopics ?? [],
          keyPoints: result.keyPoints ?? [],
          emotionalArc: result.emotionalArc ?? '',
          embedding: result.embedding,
        };
      } catch (error) {
        log.warn({ error: String(error), conversationId }, 'LLM summary failed, using quick summary');
        const quick = realtime.buildQuickSummary(turns);
        return {
          id: catchUpSummaryId(conversationId),
          shortText: quick || 'Conversation',
          mainTopics: [],
          keyPoints: quick ? [quick] : [],
          emotionalArc: '',
        };
      }
    },

    closeConversation: async (userId, conversationId, endedAt) => {
      await conversationRef(userId, conversationId).update(
        cleanForFirestore({ endedAt, endedBy: 'catch-up' })
      );
    },

    saveSummary: async (userId, conversationId, summary, timestamp, turnCount) => {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('summaries')
        .doc(summary.id)
        .set(
          cleanForFirestore({
            id: summary.id,
            sessionId: conversationId,
            conversationId,
            timestamp,
            turnCount,
            mainTopics: summary.mainTopics,
            keyPoints: summary.keyPoints,
            emotionalArc: summary.emotionalArc,
            source: 'catch-up',
          })
        );
    },

    indexSummary: async (userId, summary, timestamp) => {
      const { indexConversationSummary } = await import('../../memory/retrieval/semantic-rag.js');
      await indexConversationSummary(userId, {
        id: summary.id,
        text: [...summary.mainTopics, ...summary.keyPoints, summary.emotionalArc].join(' ').trim(),
        topics: summary.mainTopics,
        timestamp,
        embedding: summary.embedding,
      });
    },

    markSummarized: (userId, conversationId, text) =>
      realtime.markSummarized(userId, conversationId, text),
  };
}
