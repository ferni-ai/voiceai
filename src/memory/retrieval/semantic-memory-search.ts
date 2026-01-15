/**
 * Semantic Memory Search
 *
 * Provides context-relevant memory retrieval using vector similarity search.
 * Searches across memory anchors, session summaries, and user facts to find
 * memories semantically similar to the current conversation context.
 *
 * Features:
 * - Uses Firestore vector store with native KNN search
 * - Filters by user and memory type
 * - Returns ranked results with similarity scores
 * - Integrates with hybrid retrieval for "Better than Human" memory
 *
 * @module memory/retrieval/semantic-memory-search
 */

import { createLogger } from '../../utils/safe-logger.js';
import { embed } from '../embeddings.js';
import {
  getFirestoreVectorStore,
  type FirestoreVectorStore,
} from '../firestore-vector-store/index.js';
import type { VectorSearchResult, VectorFilter } from '../vector-store-interface.js';
import type { SemanticMatch } from './hybrid-continuity-retrieval.js';

const log = createLogger({ module: 'SemanticMemorySearch' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Collection name for memory embeddings */
export const MEMORY_EMBEDDINGS_COLLECTION = 'memory_embeddings';

/** Memory source types for filtering */
export type MemorySourceType =
  | 'anchor'
  | 'thread'
  | 'session_summary'
  | 'fact'
  | 'entity'
  | 'conversation';

/** Default number of results to return */
const DEFAULT_TOP_K = 5;

/** Minimum similarity score to include in results */
const DEFAULT_MIN_SCORE = 0.5;

// ============================================================================
// TYPES
// ============================================================================

export interface SemanticSearchOptions {
  /** Maximum number of results to return */
  topK?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by memory source types */
  sourceTypes?: MemorySourceType[];
  /** Include embedding in results (for debugging) */
  includeEmbedding?: boolean;
}

export interface SemanticSearchResult {
  /** The memory text */
  text: string;
  /** Source type (anchor, thread, etc.) */
  source: MemorySourceType;
  /** Similarity score (0-1) */
  score: number;
  /** Original document ID */
  documentId: string;
  /** Source-specific ID (anchorId, threadId, etc.) */
  sourceId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchMetrics {
  /** Query embedding latency in ms */
  embeddingLatencyMs: number;
  /** Vector search latency in ms */
  searchLatencyMs: number;
  /** Total latency in ms */
  totalLatencyMs: number;
  /** Number of results returned */
  resultCount: number;
  /** Whether vector store was available */
  vectorStoreAvailable: boolean;
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

/**
 * Search for semantically similar memories for a user
 *
 * @param query - The text to find similar memories for
 * @param userId - User ID to scope the search
 * @param options - Search options
 * @returns Array of semantic matches sorted by similarity
 */
export async function searchMemories(
  query: string,
  userId: string,
  options: SemanticSearchOptions = {}
): Promise<{ results: SemanticSearchResult[]; metrics: SemanticSearchMetrics }> {
  const startTime = Date.now();
  const topK = options.topK || DEFAULT_TOP_K;
  const minScore = options.minScore || DEFAULT_MIN_SCORE;

  const metrics: SemanticSearchMetrics = {
    embeddingLatencyMs: 0,
    searchLatencyMs: 0,
    totalLatencyMs: 0,
    resultCount: 0,
    vectorStoreAvailable: false,
  };

  try {
    // Get vector store
    const vectorStore = getFirestoreVectorStore();
    if (!vectorStore.isInitialized) {
      await vectorStore.initialize();
    }
    metrics.vectorStoreAvailable = true;

    // 1. Embed the query
    const embeddingStart = Date.now();
    const queryEmbedding = await embed(query);
    metrics.embeddingLatencyMs = Date.now() - embeddingStart;

    // 2. Build filter
    const filter: VectorFilter = {
      userId,
    };

    if (options.sourceTypes && options.sourceTypes.length > 0) {
      filter.source = options.sourceTypes;
    }

    // 3. Search vector store
    const searchStart = Date.now();
    const searchResults = await vectorStore.searchByEmbedding(queryEmbedding, {
      topK: topK * 2, // Get more to filter by score
      filter,
      minScore,
    });
    metrics.searchLatencyMs = Date.now() - searchStart;

    // 4. Transform results
    const results: SemanticSearchResult[] = searchResults
      .filter((r) => r.score >= minScore)
      .slice(0, topK)
      .map((r) => ({
        text: r.document.text,
        source: (r.document.metadata.source as MemorySourceType) || 'conversation',
        score: r.score,
        documentId: r.document.id,
        sourceId: r.document.metadata.sourceId as string | undefined,
        metadata: options.includeEmbedding ? r.document.metadata : undefined,
      }));

    metrics.resultCount = results.length;
    metrics.totalLatencyMs = Date.now() - startTime;

    log.debug(
      {
        query: query.slice(0, 50),
        userId,
        results: results.length,
        embeddingMs: metrics.embeddingLatencyMs,
        searchMs: metrics.searchLatencyMs,
        totalMs: metrics.totalLatencyMs,
      },
      '🔍 Semantic memory search completed'
    );

    return { results, metrics };
  } catch (error) {
    metrics.totalLatencyMs = Date.now() - startTime;
    log.warn({ error: String(error), userId }, 'Semantic memory search failed');
    return { results: [], metrics };
  }
}

/**
 * Convert semantic search results to SemanticMatch format for hybrid retrieval
 *
 * @param results - Semantic search results
 * @returns Array of SemanticMatch objects
 */
export function toSemanticMatches(results: SemanticSearchResult[]): SemanticMatch[] {
  return results.map((r) => ({
    memoryId: r.sourceId ? `${r.source}_${r.sourceId}` : undefined,
    text: r.text,
    source: `${r.source}${r.sourceId ? `:${r.sourceId}` : ''}`,
    score: r.score,
  }));
}

// ============================================================================
// INDEXING FUNCTIONS
// ============================================================================

/**
 * Index a memory for semantic search
 *
 * @param userId - User ID
 * @param text - Memory text to index
 * @param source - Memory source type
 * @param sourceId - Source-specific ID
 * @param metadata - Additional metadata
 */
export async function indexMemory(
  userId: string,
  text: string,
  source: MemorySourceType,
  sourceId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const vectorStore = getFirestoreVectorStore();
    if (!vectorStore.isInitialized) {
      await vectorStore.initialize();
    }

    const documentId = `${source}_${sourceId}`;

    await vectorStore.addDocument({
      id: documentId,
      text,
      metadata: {
        source,
        userId,
        sourceId,
        timestamp: new Date(),
        ...metadata,
      },
    });

    log.debug({ userId, source, sourceId }, 'Indexed memory for semantic search');
  } catch (error) {
    log.warn({ error: String(error), userId, source }, 'Failed to index memory');
  }
}

/**
 * Index multiple memories in batch
 *
 * @param userId - User ID
 * @param memories - Array of memories to index
 */
export async function indexMemoriesBatch(
  userId: string,
  memories: Array<{
    text: string;
    source: MemorySourceType;
    sourceId: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<void> {
  try {
    const vectorStore = getFirestoreVectorStore();
    if (!vectorStore.isInitialized) {
      await vectorStore.initialize();
    }

    const documents = memories.map((m) => ({
      id: `${m.source}_${m.sourceId}`,
      text: m.text,
      metadata: {
        source: m.source,
        userId,
        sourceId: m.sourceId,
        timestamp: new Date(),
        ...m.metadata,
      },
    }));

    await vectorStore.addDocuments(documents);

    log.debug({ userId, count: memories.length }, 'Batch indexed memories for semantic search');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to batch index memories');
  }
}

/**
 * Remove a memory from the semantic index
 *
 * @param source - Memory source type
 * @param sourceId - Source-specific ID
 */
export async function removeIndexedMemory(
  source: MemorySourceType,
  sourceId: string
): Promise<void> {
  try {
    const vectorStore = getFirestoreVectorStore();
    if (!vectorStore.isInitialized) {
      await vectorStore.initialize();
    }

    const documentId = `${source}_${sourceId}`;
    await vectorStore.removeDocument(documentId);

    log.debug({ source, sourceId }, 'Removed memory from semantic index');
  } catch (error) {
    log.warn({ error: String(error), source, sourceId }, 'Failed to remove indexed memory');
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Search for semantically similar anchors
 */
export async function searchAnchors(
  query: string,
  userId: string,
  topK: number = 5
): Promise<SemanticSearchResult[]> {
  const { results } = await searchMemories(query, userId, {
    topK,
    sourceTypes: ['anchor'],
    minScore: 0.4,
  });
  return results;
}

/**
 * Search for semantically similar session summaries
 */
export async function searchSessionSummaries(
  query: string,
  userId: string,
  topK: number = 3
): Promise<SemanticSearchResult[]> {
  const { results } = await searchMemories(query, userId, {
    topK,
    sourceTypes: ['session_summary'],
    minScore: 0.5,
  });
  return results;
}

/**
 * Search for semantically similar facts about entities
 */
export async function searchFacts(
  query: string,
  userId: string,
  topK: number = 5
): Promise<SemanticSearchResult[]> {
  const { results } = await searchMemories(query, userId, {
    topK,
    sourceTypes: ['fact', 'entity'],
    minScore: 0.45,
  });
  return results;
}
