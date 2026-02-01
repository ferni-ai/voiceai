/**
 * Hybrid Search Orchestrator
 *
 * Combines BM25 keyword search with vector semantic search using
 * Reciprocal Rank Fusion (RRF) for optimal retrieval.
 *
 * Architecture:
 * ```
 * Query
 *   │
 *   ├─────────────────┬─────────────────┐
 *   │                 │                 │
 *   ▼                 ▼                 ▼
 * BM25 Search    Vector Search    Entity Store
 *   │                 │                 │
 *   └────────┬────────┴─────────────────┘
 *            │
 *            ▼
 *    Reciprocal Rank Fusion
 *            │
 *            ▼
 *     Fused Results
 * ```
 *
 * Benefits:
 * - BM25 excels at exact name/keyword matching ("Mike", "my brother")
 * - Vector search excels at semantic similarity ("relationship problems")
 * - RRF combines both without needing score normalization
 *
 * @module memory/retrieval/hybrid-search
 */

import { createLogger } from '../../utils/safe-logger.js';
import { searchEntitiesBM25, type BM25SearchResult } from './bm25-search.js';
import { searchMemories, type SemanticSearchResult } from './semantic-memory-search.js';
import {
  fuseSearchResults,
  reciprocalRankFusion,
  type FusedResult,
  type RankedItem,
} from './rank-fusion.js';
import type { Entity, EntitySearchOptions } from '../entity-store/types.js';

const log = createLogger({ module: 'HybridSearch' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hybrid search options
 */
export interface HybridSearchOptions {
  /** Maximum results to return */
  topK?: number;
  /** Minimum fused score threshold */
  minScore?: number;
  /** BM25 weight in fusion (default: 0.4) */
  bm25Weight?: number;
  /** Vector search weight in fusion (default: 0.6) */
  vectorWeight?: number;
  /** Include entity store search */
  includeEntities?: boolean;
  /** Entity types to search */
  entityTypes?: string[];
  /** Minimum sources required to include result */
  minSources?: number;
  /** Skip BM25 search (vector only) */
  skipBM25?: boolean;
  /** Skip vector search (BM25 only) */
  skipVector?: boolean;
}

/**
 * Hybrid search result with source breakdown
 */
export interface HybridSearchResult {
  id: string;
  /** Combined score from RRF */
  score: number;
  /** Result text/content */
  text: string;
  /** Result type (memory, entity, etc.) */
  type: 'memory' | 'entity';
  /** Which sources returned this result */
  sources: string[];
  /** Score breakdown by source */
  scoreBreakdown: {
    bm25?: number;
    vector?: number;
    entity?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Hybrid search metrics
 */
export interface HybridSearchMetrics {
  /** BM25 search latency in ms */
  bm25LatencyMs: number;
  /** Vector search latency in ms */
  vectorLatencyMs: number;
  /** Entity search latency in ms */
  entityLatencyMs: number;
  /** Fusion latency in ms */
  fusionLatencyMs: number;
  /** Total latency in ms */
  totalLatencyMs: number;
  /** Results from each source */
  sourceCounts: {
    bm25: number;
    vector: number;
    entity: number;
  };
  /** Final fused result count */
  fusedCount: number;
}

// ============================================================================
// HYBRID SEARCH
// ============================================================================

/**
 * Perform hybrid search combining BM25 and vector search
 *
 * @param userId - User ID to scope the search
 * @param query - Search query
 * @param options - Search options
 * @returns Fused results and metrics
 */
export async function hybridSearch(
  userId: string,
  query: string,
  options: HybridSearchOptions = {}
): Promise<{ results: HybridSearchResult[]; metrics: HybridSearchMetrics }> {
  const startTime = Date.now();
  const {
    topK = 20,
    minScore = 0.01,
    bm25Weight = 0.4,
    vectorWeight = 0.6,
    includeEntities = true,
    entityTypes,
    minSources = 1,
    skipBM25 = false,
    skipVector = false,
  } = options;

  const metrics: HybridSearchMetrics = {
    bm25LatencyMs: 0,
    vectorLatencyMs: 0,
    entityLatencyMs: 0,
    fusionLatencyMs: 0,
    totalLatencyMs: 0,
    sourceCounts: {
      bm25: 0,
      vector: 0,
      entity: 0,
    },
    fusedCount: 0,
  };

  // Prepare ranked lists for fusion
  const rankedLists = new Map<string, RankedItem<HybridSearchResult>[]>();

  // 1. BM25 KEYWORD SEARCH
  if (!skipBM25 && includeEntities) {
    const bm25Start = Date.now();
    try {
      const bm25Results = await searchEntitiesBM25(userId, query, {
        topK: topK * 2,
        types: entityTypes,
      });

      metrics.bm25LatencyMs = Date.now() - bm25Start;
      metrics.sourceCounts.bm25 = bm25Results.length;

      if (bm25Results.length > 0) {
        rankedLists.set(
          'bm25',
          bm25Results.map((r, i) => ({
            id: `entity_${r.id}`,
            score: r.score,
            rank: i + 1,
            data: {
              id: r.id,
              score: r.score,
              text: r.text,
              type: 'entity' as const,
              sources: ['bm25'],
              scoreBreakdown: { bm25: r.score },
              metadata: r.metadata,
            },
            source: 'bm25',
          }))
        );
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'BM25 search failed');
      metrics.bm25LatencyMs = Date.now() - bm25Start;
    }
  }

  // 2. VECTOR SEMANTIC SEARCH
  if (!skipVector) {
    const vectorStart = Date.now();
    try {
      const { results: vectorResults } = await searchMemories(query, userId, {
        topK: topK * 2,
        minScore: 0.3,
      });

      metrics.vectorLatencyMs = Date.now() - vectorStart;
      metrics.sourceCounts.vector = vectorResults.length;

      if (vectorResults.length > 0) {
        rankedLists.set(
          'vector',
          vectorResults.map((r, i) => ({
            id: `memory_${r.documentId}`,
            score: r.score,
            rank: i + 1,
            data: {
              id: r.documentId,
              score: r.score,
              text: r.text,
              type: 'memory' as const,
              sources: ['vector'],
              scoreBreakdown: { vector: r.score },
              metadata: { source: r.source, sourceId: r.sourceId },
            },
            source: 'vector',
          }))
        );
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Vector search failed');
      metrics.vectorLatencyMs = Date.now() - vectorStart;
    }
  }

  // 3. ENTITY STORE DIRECT SEARCH (for relationship queries)
  if (includeEntities && !skipBM25) {
    const entityStart = Date.now();
    try {
      const { findEntityByAlias, searchEntities } = await import('../entity-store/storage.js');

      // Try exact alias match first
      const exactMatch = await findEntityByAlias(userId, query, 'person');
      if (exactMatch) {
        const entityResult: RankedItem<HybridSearchResult> = {
          id: `entity_${exactMatch.id}`,
          score: 1.0, // Perfect match
          rank: 1,
          data: {
            id: exactMatch.id,
            score: 1.0,
            text: exactMatch.canonicalName,
            type: 'entity' as const,
            sources: ['entity_exact'],
            scoreBreakdown: { entity: 1.0 },
            metadata: {
              type: exactMatch.type,
              relationship: exactMatch.relationship,
              aliases: exactMatch.aliases,
            },
          },
          source: 'entity_exact',
        };

        // Add as its own source for high priority
        rankedLists.set('entity_exact', [entityResult]);
        metrics.sourceCounts.entity++;
      }

      // Also do a search for partial matches
      const searchResults = await searchEntities(userId, query, {
        types: entityTypes as Entity['type'][] | undefined,
        topK: 10,
      });

      if (searchResults.length > 0) {
        const entityResults: RankedItem<HybridSearchResult>[] = searchResults.map((e, i) => ({
          id: `entity_${e.id}`,
          score: e.salience || 0.5,
          rank: i + 1,
          data: {
            id: e.id,
            score: e.salience || 0.5,
            text: e.canonicalName,
            type: 'entity' as const,
            sources: ['entity_search'],
            scoreBreakdown: { entity: e.salience || 0.5 },
            metadata: {
              type: e.type,
              relationship: e.relationship,
              aliases: e.aliases,
            },
          },
          source: 'entity_search',
        }));

        rankedLists.set('entity_search', entityResults);
        metrics.sourceCounts.entity += searchResults.length;
      }

      metrics.entityLatencyMs = Date.now() - entityStart;
    } catch (error) {
      log.debug({ error: String(error) }, 'Entity store search unavailable');
      metrics.entityLatencyMs = Date.now() - entityStart;
    }
  }

  // 4. RECIPROCAL RANK FUSION
  const fusionStart = Date.now();

  // Set up source weights
  const sourceWeights: Record<string, number> = {
    bm25: bm25Weight,
    vector: vectorWeight,
    entity_exact: 1.0, // Exact entity matches get highest weight
    entity_search: 0.3, // Entity search results get lower weight
  };

  const fusedResults = reciprocalRankFusion(rankedLists, {
    k: 60,
    sourceWeights,
    topK,
    minScore,
    minSources,
  });

  metrics.fusionLatencyMs = Date.now() - fusionStart;
  metrics.fusedCount = fusedResults.length;
  metrics.totalLatencyMs = Date.now() - startTime;

  // Convert fused results to HybridSearchResult format
  const results: HybridSearchResult[] = fusedResults.map((f) => ({
    ...f.data,
    score: f.fusedScore,
    sources: f.sources,
    scoreBreakdown: Object.fromEntries(
      Object.entries(f.sourceContributions).map(([source, { rrfScore }]) => [
        source.replace('entity_exact', 'entity').replace('entity_search', 'entity'),
        rrfScore,
      ])
    ),
  }));

  log.debug(
    {
      userId,
      query: query.slice(0, 50),
      results: results.length,
      sources: Array.from(rankedLists.keys()),
      bm25Ms: metrics.bm25LatencyMs,
      vectorMs: metrics.vectorLatencyMs,
      totalMs: metrics.totalLatencyMs,
    },
    '🔀 Hybrid search completed'
  );

  return { results, metrics };
}

/**
 * Quick hybrid search for entity resolution
 *
 * Optimized for finding a specific entity by name/relationship.
 */
export async function findEntityHybrid(
  userId: string,
  query: string,
  options: { type?: string } = {}
): Promise<HybridSearchResult | null> {
  const { results } = await hybridSearch(userId, query, {
    topK: 1,
    includeEntities: true,
    entityTypes: options.type ? [options.type] : undefined,
    bm25Weight: 0.5, // Higher BM25 weight for exact matching
    vectorWeight: 0.3,
  });

  return results[0] || null;
}

/**
 * Search with BM25 only (no vector search)
 */
export async function bm25OnlySearch(
  userId: string,
  query: string,
  options: Omit<HybridSearchOptions, 'skipVector'> = {}
): Promise<HybridSearchResult[]> {
  const { results } = await hybridSearch(userId, query, {
    ...options,
    skipVector: true,
  });
  return results;
}

/**
 * Search with vector only (no BM25)
 */
export async function vectorOnlySearch(
  userId: string,
  query: string,
  options: Omit<HybridSearchOptions, 'skipBM25'> = {}
): Promise<HybridSearchResult[]> {
  const { results } = await hybridSearch(userId, query, {
    ...options,
    skipBM25: true,
    includeEntities: false,
  });
  return results;
}

// ============================================================================
// EXPORTS (types are exported inline above)
// ============================================================================
