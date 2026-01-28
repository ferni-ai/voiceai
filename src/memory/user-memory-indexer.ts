/**
 * User Memory Indexer
 *
 * Indexes user memories for semantic search using the semantic-rag module.
 * This enables "Better Than Human" memory recall - finding relevant memories
 * by meaning, not just keywords.
 *
 * @module memory/user-memory-indexer
 */

import type { UserProfile } from '../types/user-profile.js';
import { toSafeDate } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import { indexConversationSummary } from './semantic-rag.js';
import { getFirestore } from './firestore-factory.js';

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

  try {
    // 1. Index conversation summaries
    const summariesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversation_summaries')
      .orderBy('timestamp', 'desc')
      .limit(maxSummaries)
      .get();

    for (const doc of summariesSnapshot.docs) {
      const summary = doc.data();
      const text = summary.summary || summary.text || summary.content;

      if (!text || typeof text !== 'string' || text.length < 10) {
        result.skipped++;
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

      // Create a searchable text from the fact
      const searchableText = fact.key ? `${fact.key}: ${text}` : text;

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
