/**
 * User Memory Indexer
 *
 * Indexes user memories for semantic search using the semantic-rag module.
 * This enables "Better Than Human" memory recall - finding relevant memories
 * by meaning, not just keywords.
 *
 * @module memory/user-memory-indexer
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getFirestoreDb, toSafeDate } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { indexConversationSummary } from '../semantic-rag.js';
import { removeConversationDocument } from '../retrieval/conversation-index.js';
import { isForgotten } from '../domain/forgotten.js';
import { firestoreForgottenStore } from '../adapters/firestore/forgotten-store.js';
import { getFirestore } from '../firestore-factory.js';
import { readCallSummaries } from '../storage/call-summaries.js';

const log = createLogger({ module: 'UserMemoryIndexer' });

export interface IndexingResult {
  indexed: number;
  skipped: number;
  errors: number;
  categories: Record<string, number>;
}

export interface IndexingOptions {
  categories?: string[];
  forceReindex?: boolean;
  vectorStore?: unknown; // Legacy option, not used
  /** Maximum summaries to index (default: 50) */
  maxSummaries?: number;
  /** Maximum facts to index (default: 100) */
  maxFacts?: number;
}

/**
 * Topics the caller asked to forget, or null when they can't be read. The
 * index feeds the recallFromMemory tool, so an unreadable list indexes
 * nothing rather than risk a forgotten memory (fails closed).
 */
export async function readForgottenTopics(
  userId: string,
  read: (userId: string) => Promise<unknown> = readTopicsField
): Promise<string[] | null> {
  try {
    const topics = await read(userId);
    // None recorded is []; anything but a list of strings is unreadable.
    if (topics === undefined || topics === null) return [];
    return Array.isArray(topics) && topics.every((t) => typeof t === 'string') ? topics : null;
  } catch {
    return null;
  }
}

/** memory_state/forgotten.topics; throws when unreadable (no database too), so readers fail closed. */
async function readTopicsField(userId: string): Promise<unknown> {
  const { topics } = await firestoreForgottenStore(getFirestoreDb()).readForgotten(userId);
  if (topics === null) throw new Error('Forgotten topics unreadable');
  return topics;
}

const FACT_COPY = /^conversation_fact_(.+)$/;

/**
 * Index results that are copies of a dynamic fact now forgotten (forgottenAt)
 * or deleted, checked by the fact's id rather than its text: the text may
 * not name the topic. If the facts can't be read, every fact copy is dropped.
 */
export async function forgottenFactCopies(
  userId: string,
  ids: ReadonlyArray<string | undefined>,
  read: (
    userId: string,
    docIds: string[]
  ) => Promise<Map<string, Record<string, unknown> | undefined>> = readFactDocs
): Promise<Set<string>> {
  const copies = ids.flatMap((id) => {
    const m = id ? FACT_COPY.exec(id) : null;
    return m?.[1] ? [{ id: id as string, docId: m[1] }] : [];
  });
  if (copies.length === 0) return new Set();
  try {
    const docs = await read(
      userId,
      copies.map((c) => c.docId)
    );
    return new Set(
      copies
        .filter((c) => {
          const d = docs.get(c.docId);
          return !d || (d.forgottenAt !== undefined && d.forgottenAt !== null);
        })
        .map((c) => c.id)
    );
  } catch {
    return new Set(copies.map((c) => c.id));
  }
}

async function readFactDocs(
  userId: string,
  docIds: string[]
): Promise<Map<string, Record<string, unknown> | undefined>> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
  const snaps = await db.getAll(...docIds.map((id) => facts.doc(id)));
  return new Map(snaps.map((d) => [d.id, d.exists ? d.data() : undefined]));
}

/** Takes a forgotten item out of the index too: it may have been indexed before it was forgotten. */
async function dropForgotten(id: string, result: IndexingResult): Promise<void> {
  result.skipped++;
  result.categories['forgotten'] = (result.categories['forgotten'] || 0) + 1;
  await removeConversationDocument(id).catch((error: unknown) =>
    log.warn({ error: String(error), id }, 'Forgotten memory not removed from the index')
  );
}

// Track last indexed time per user for needsReindex check
const indexingStatus = new Map<string, { lastIndexed: Date; totalIndexed: number }>();

/**
 * Index user memories for semantic search.
 *
 * Indexes:
 * - Conversation summaries from Firestore
 * - Dynamic facts extracted during conversations
 * - Key moments and insights
 */
export async function indexUserMemories(
  userId: string,
  _profile: UserProfile,
  options?: IndexingOptions
): Promise<IndexingResult> {
  const startTime = Date.now();
  const db = getFirestore();

  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping memory indexing');
    return { indexed: 0, skipped: 0, errors: 0, categories: {} };
  }

  const result: IndexingResult = {
    indexed: 0,
    skipped: 0,
    errors: 0,
    categories: {},
  };

  const maxSummaries = options?.maxSummaries ?? 50;
  const maxFacts = options?.maxFacts ?? 100;

  const forgotten = await readForgottenTopics(userId);
  if (forgotten === null) {
    log.warn({ userId }, 'Forgotten topics unreadable: indexing nothing');
    return result;
  }

  try {
    // 1. Index conversation summaries
    const summariesSnapshot = await readCallSummaries(db, userId, { limit: maxSummaries });

    for (const doc of summariesSnapshot.docs) {
      const summary = doc.data();
      const text = summary.summary || summary.text || summary.content;

      if (!text || typeof text !== 'string' || text.length < 10) {
        result.skipped++;
        continue;
      }
      if (summary.forgottenAt != null || isForgotten(text, forgotten)) {
        await dropForgotten(doc.id, result);
        continue;
      }

      try {
        await indexConversationSummary(userId, {
          id: doc.id,
          text,
          topics: summary.topics || [],
          timestamp: toSafeDate(summary.timestamp),
        });
        result.indexed++;
        result.categories['summaries'] = (result.categories['summaries'] || 0) + 1;
      } catch (error) {
        log.debug({ error: String(error), docId: doc.id }, 'Failed to index summary');
        result.errors++;
      }
    }

    // 2. Index dynamic facts
    const factsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_facts')
      .orderBy('extractedAt', 'desc')
      .limit(maxFacts)
      .get();

    for (const doc of factsSnapshot.docs) {
      const fact = doc.data();
      const text = fact.value || fact.content || fact.fact;

      if (!text || typeof text !== 'string' || text.length < 5) {
        result.skipped++;
        continue;
      }

      // Create a searchable text from the fact; a person's name stays in it,
      // so a topic like "Steve" still matches the indexed copy.
      const entity = String(fact.entityName ?? '');
      const named = entity && !/^(user|speaker|me)$/i.test(entity) ? `${entity} ` : '';
      const searchableText = fact.key ? `${named}${fact.key}: ${text}` : `${named}${text}`;
      // Marked by forget.ts, or about a forgotten topic: never searchable again.
      const about = `${String(fact.entityName ?? '')} ${String(fact.key ?? '')} ${text}`;
      if (fact.forgottenAt != null || isForgotten(about, forgotten)) {
        await dropForgotten(`fact_${doc.id}`, result);
        continue;
      }

      try {
        await indexConversationSummary(userId, {
          id: `fact_${doc.id}`,
          text: searchableText,
          topics: fact.topics || [],
          timestamp: toSafeDate(fact.extractedAt),
        });
        result.indexed++;
        result.categories['facts'] = (result.categories['facts'] || 0) + 1;
      } catch (error) {
        log.debug({ error: String(error), docId: doc.id }, 'Failed to index fact');
        result.errors++;
      }
    }

    // 3. Index key moments/insights (if they exist)
    try {
      const insightsSnapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('insights')
        .where('type', 'in', ['breakthrough', 'growth', 'milestone'])
        .limit(30)
        .get();

      for (const doc of insightsSnapshot.docs) {
        const insight = doc.data();
        const text = insight.description || insight.content;

        if (!text || typeof text !== 'string') continue;
        if (isForgotten(text, forgotten)) {
          await dropForgotten(`insight_${doc.id}`, result);
          continue;
        }

        try {
          await indexConversationSummary(userId, {
            id: `insight_${doc.id}`,
            text,
            topics: insight.entityIds || [],
            timestamp: toSafeDate(insight.createdAt),
          });
          result.indexed++;
          result.categories['insights'] = (result.categories['insights'] || 0) + 1;
        } catch {
          result.errors++;
        }
      }
    } catch {
      // Insights collection may not exist
    }

    // Update status tracking
    indexingStatus.set(userId, {
      lastIndexed: new Date(),
      totalIndexed: result.indexed,
    });

    const durationMs = Date.now() - startTime;
    log.info(
      {
        userId,
        ...result,
        durationMs,
      },
      '📚 User memories indexed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to index user memories');
    return result;
  }
}

/**
 * Check if user memories need re-indexing.
 *
 * Returns true if:
 * - Never indexed before
 * - Last indexed more than 24 hours ago
 */
export async function needsReindex(userId: string): Promise<boolean> {
  const status = indexingStatus.get(userId);

  if (!status) {
    return true;
  }

  // Re-index if last indexed more than 24 hours ago
  const hoursSinceIndex = (Date.now() - status.lastIndexed.getTime()) / (1000 * 60 * 60);
  return hoursSinceIndex > 24;
}

/**
 * Get indexing status for a user.
 */
export async function getIndexingStatus(userId: string): Promise<{
  lastIndexed: Date | null;
  totalIndexed: number;
  categories: string[];
}> {
  const status = indexingStatus.get(userId);

  if (!status) {
    return {
      lastIndexed: null,
      totalIndexed: 0,
      categories: [],
    };
  }

  return {
    lastIndexed: status.lastIndexed,
    totalIndexed: status.totalIndexed,
    categories: ['summaries', 'facts', 'insights'],
  };
}
