/**
 * Turn Memory Retrieval
 *
 * Orchestrates memory retrieval for each conversation turn.
 * This is the CRITICAL bridge between the memory infrastructure
 * (Phases 1-8) and live conversations.
 *
 * Architecture:
 * ```
 * User Turn → retrieveForTurn()
 *                 │
 *     ┌───────────┼───────────┐
 *     │           │           │
 *     ▼           ▼           ▼
 *   Hybrid     Graph      Recent
 *   Search    Expansion   Surface
 *     │           │           │
 *     └───────────┼───────────┘
 *                 │
 *     ┌───────────┼───────────┐
 *     │           │           │
 *     ▼           ▼           ▼
 *  Reranker  Relevance   Dedup
 *             Gate       Filter
 *     │           │           │
 *     └───────────┴───────────┘
 *                 │
 *                 ▼
 *          MemoryContext
 * ```
 *
 * Performance Budget: < 100ms total
 *
 * @module memory/retrieval/turn-memory-retrieval
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  hybridSearch,
  type HybridSearchResult,
  type HybridSearchMetrics,
} from './hybrid-search.js';
import { rerankHybridResults } from './cross-encoder.js';

const log = createLogger({ module: 'TurnMemoryRetrieval' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for turn-level memory retrieval
 */
export interface TurnRetrievalInput {
  /** User ID for scoping */
  userId: string;
  /** Current session ID */
  sessionId: string;
  /** User's transcript for this turn */
  transcript: string;
  /** Current turn number */
  turnNumber: number;
  /** Detected emotion (optional) */
  emotion?: string;
  /** Detected topics (optional) */
  topics?: string[];
  /** Current persona ID */
  personaId?: string;
  /** Previously surfaced memory IDs this session (for dedup) */
  surfacedMemoryIds?: Set<string>;
}

/**
 * A single memory to inject into the conversation
 */
export interface RetrievedMemoryForTurn {
  /** Unique ID for deduplication */
  id: string;
  /** Content to inject */
  content: string;
  /** Relevance score (0-1) */
  relevance: number;
  /** Memory type */
  type: 'memory' | 'entity' | 'commitment' | 'anniversary';
  /** Natural attribution phrase */
  attribution: string;
  /** Source for tracking */
  source: string;
  /** When this memory was created/captured */
  timestamp?: Date;
}

/**
 * Memory context for LLM injection
 */
export interface MemoryContext {
  /** Memories to inject (sorted by relevance) */
  memories: RetrievedMemoryForTurn[];
  /** Whether any memory should be proactively surfaced */
  hasProactiveSuggestion: boolean;
  /** Proactive memory if available */
  proactiveMemory?: RetrievedMemoryForTurn;
  /** Metrics for observability */
  metrics: TurnRetrievalMetrics;
}

/**
 * Metrics for turn retrieval
 */
export interface TurnRetrievalMetrics {
  /** Total retrieval time in ms */
  totalTimeMs: number;
  /** Hybrid search time in ms */
  hybridSearchMs: number;
  /** Reranking time in ms */
  rerankMs: number;
  /** Number of raw results from hybrid search */
  rawResultCount: number;
  /** Number of results after relevance gating */
  filteredResultCount: number;
  /** Number of results after deduplication */
  dedupedResultCount: number;
  /** Whether reranking was applied */
  rerankingApplied: boolean;
  /** Cache status */
  cacheHit: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Retrieval configuration
 */
export interface TurnRetrievalConfig {
  /** Minimum relevance score to include (default: 0.7) */
  minRelevanceScore: number;
  /** Maximum memories to return (default: 3) */
  maxMemories: number;
  /** Enable cross-encoder reranking (default: true) */
  enableReranking: boolean;
  /** Reranking timeout in ms (default: 50) */
  rerankTimeoutMs: number;
  /** Total timeout in ms (default: 100) */
  totalTimeoutMs: number;
  /** Enable graph expansion (default: true) */
  enableGraphExpansion: boolean;
  /** Maximum depth for graph expansion (default: 2) */
  graphExpansionDepth: number;
}

const DEFAULT_CONFIG: TurnRetrievalConfig = {
  minRelevanceScore: 0.7,
  maxMemories: 3,
  enableReranking: true,
  rerankTimeoutMs: 50,
  totalTimeoutMs: 100,
  enableGraphExpansion: true,
  graphExpansionDepth: 2,
};

let config: TurnRetrievalConfig = { ...DEFAULT_CONFIG };

/**
 * Update retrieval configuration
 */
export function setTurnRetrievalConfig(newConfig: Partial<TurnRetrievalConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getTurnRetrievalConfig(): TurnRetrievalConfig {
  return { ...config };
}

// ============================================================================
// RECENT SURFACING TRACKING (prevents repetition)
// ============================================================================

/** Track recently surfaced memories per session */
const recentlySurfacedBySession = new Map<string, Map<string, number>>();

/** How long to suppress re-surfacing (5 minutes) */
const RESURFACING_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Check if a memory was recently surfaced
 */
function wasRecentlySurfaced(sessionId: string, memoryId: string): boolean {
  const sessionMap = recentlySurfacedBySession.get(sessionId);
  if (!sessionMap) return false;

  const lastSurfaced = sessionMap.get(memoryId);
  if (!lastSurfaced) return false;

  return Date.now() - lastSurfaced < RESURFACING_COOLDOWN_MS;
}

/**
 * Record that a memory was surfaced
 */
function recordSurfaced(sessionId: string, memoryId: string): void {
  let sessionMap = recentlySurfacedBySession.get(sessionId);
  if (!sessionMap) {
    sessionMap = new Map();
    recentlySurfacedBySession.set(sessionId, sessionMap);
  }
  sessionMap.set(memoryId, Date.now());
}

/**
 * Clear session's surfacing history
 */
export function clearSessionSurfacingHistory(sessionId: string): void {
  recentlySurfacedBySession.delete(sessionId);
}

// ============================================================================
// ATTRIBUTION GENERATION
// ============================================================================

/**
 * Generate natural attribution phrase based on confidence
 */
function generateAttribution(
  content: string,
  relevance: number,
  type: RetrievedMemoryForTurn['type']
): string {
  // High confidence attributions
  if (relevance > 0.9) {
    const highConfidencePhrases = [
      'You told me that',
      'You mentioned that',
      'I remember you saying',
    ];
    return highConfidencePhrases[Math.floor(Math.random() * highConfidencePhrases.length)];
  }

  // Medium confidence attributions
  if (relevance > 0.7) {
    const mediumConfidencePhrases = [
      'I remember you mentioning',
      'You shared with me that',
      'If I recall correctly,',
    ];
    return mediumConfidencePhrases[Math.floor(Math.random() * mediumConfidencePhrases.length)];
  }

  // Lower confidence attributions
  const lowConfidencePhrases = [
    'I think you mentioned',
    'I might be misremembering, but',
    'If I recall,',
  ];
  return lowConfidencePhrases[Math.floor(Math.random() * lowConfidencePhrases.length)];
}

// ============================================================================
// MAIN RETRIEVAL FUNCTION
// ============================================================================

/**
 * Retrieve relevant memories for a conversation turn.
 *
 * This is the main entry point for memory retrieval during conversations.
 * It orchestrates:
 * 1. Hybrid search (BM25 + vector + entity store)
 * 2. Cross-encoder reranking (for quality)
 * 3. Relevance gating (only high-relevance results)
 * 4. Deduplication (no recently surfaced memories)
 *
 * @param input - Turn retrieval input
 * @returns Memory context for LLM injection
 */
export async function retrieveForTurn(input: TurnRetrievalInput): Promise<MemoryContext> {
  const startTime = Date.now();
  const metrics: TurnRetrievalMetrics = {
    totalTimeMs: 0,
    hybridSearchMs: 0,
    rerankMs: 0,
    rawResultCount: 0,
    filteredResultCount: 0,
    dedupedResultCount: 0,
    rerankingApplied: false,
    cacheHit: false,
  };

  const { userId, sessionId, transcript, turnNumber, surfacedMemoryIds } = input;

  // Skip retrieval for very short transcripts (likely just acknowledgments)
  if (transcript.length < 10) {
    return {
      memories: [],
      hasProactiveSuggestion: false,
      metrics: { ...metrics, totalTimeMs: Date.now() - startTime },
    };
  }

  try {
    // 1. HYBRID SEARCH (BM25 + Vector + Entity Store)
    const hybridStart = Date.now();
    const { results: hybridResults, metrics: hybridMetrics } = await Promise.race([
      hybridSearch(userId, transcript, {
        topK: 10,
        minScore: 0.3, // Lower threshold, we'll filter later
        bm25Weight: 0.4,
        vectorWeight: 0.6,
        includeEntities: true,
      }),
      new Promise<{ results: HybridSearchResult[]; metrics: HybridSearchMetrics }>((_, reject) => {
        setTimeout(() => reject(new Error('Hybrid search timeout')), config.totalTimeoutMs * 0.7);
      }),
    ]);

    metrics.hybridSearchMs = Date.now() - hybridStart;
    metrics.rawResultCount = hybridResults.length;

    if (hybridResults.length === 0) {
      return {
        memories: [],
        hasProactiveSuggestion: false,
        metrics: { ...metrics, totalTimeMs: Date.now() - startTime },
      };
    }

    // 2. CROSS-ENCODER RERANKING (optional, for quality)
    let rankedResults = hybridResults;
    if (config.enableReranking && hybridResults.length > 1) {
      const rerankStart = Date.now();
      try {
        const reranked = await Promise.race([
          rerankHybridResults(transcript, hybridResults, {
            topK: config.maxMemories * 2,
            minScore: config.minRelevanceScore,
          }),
          new Promise<HybridSearchResult[]>((_, reject) => {
            setTimeout(() => reject(new Error('Rerank timeout')), config.rerankTimeoutMs);
          }),
        ]);
        rankedResults = reranked;
        metrics.rerankingApplied = true;
        metrics.rerankMs = Date.now() - rerankStart;
      } catch (error) {
        // Reranking failed, use original order
        log.debug({ error: String(error) }, 'Reranking failed, using hybrid order');
        metrics.rerankMs = Date.now() - rerankStart;
      }
    }

    // 3. RELEVANCE GATING
    const relevantResults = rankedResults.filter((r) => r.score >= config.minRelevanceScore);
    metrics.filteredResultCount = relevantResults.length;

    // 4. DEDUPLICATION (remove recently surfaced)
    const dedupedResults = relevantResults.filter((r) => {
      // Check against provided surfaced IDs
      if (surfacedMemoryIds?.has(r.id)) return false;
      // Check against session history
      if (wasRecentlySurfaced(sessionId, r.id)) return false;
      return true;
    });
    metrics.dedupedResultCount = dedupedResults.length;

    // 5. CONVERT TO TURN FORMAT
    const memories: RetrievedMemoryForTurn[] = dedupedResults
      .slice(0, config.maxMemories)
      .map((result) => {
        const memory: RetrievedMemoryForTurn = {
          id: result.id,
          content: result.text,
          relevance: result.score,
          type: result.type,
          attribution: generateAttribution(result.text, result.score, result.type),
          source: result.sources.join(','),
          timestamp: result.metadata?.timestamp
            ? new Date(result.metadata.timestamp as string)
            : undefined,
        };

        // Record that we're surfacing this
        recordSurfaced(sessionId, result.id);

        return memory;
      });

    // 6. CHECK FOR PROACTIVE OPPORTUNITY
    // First turn or every 3rd turn, consider proactive surfacing
    const shouldCheckProactive = turnNumber === 1 || turnNumber % 3 === 0;
    let proactiveMemory: RetrievedMemoryForTurn | undefined;

    if (shouldCheckProactive && memories.length > 0) {
      // The top memory could be proactive if it's very relevant
      const topMemory = memories[0];
      if (topMemory && topMemory.relevance > 0.85) {
        proactiveMemory = topMemory;
      }
    }

    metrics.totalTimeMs = Date.now() - startTime;

    log.debug(
      {
        userId,
        sessionId,
        turnNumber,
        rawResults: metrics.rawResultCount,
        filteredResults: metrics.filteredResultCount,
        dedupedResults: metrics.dedupedResultCount,
        returnedMemories: memories.length,
        totalMs: metrics.totalTimeMs,
        hybridMs: metrics.hybridSearchMs,
        rerankMs: metrics.rerankMs,
        rerankingApplied: metrics.rerankingApplied,
      },
      '🧠 Turn memory retrieval complete'
    );

    return {
      memories,
      hasProactiveSuggestion: !!proactiveMemory,
      proactiveMemory,
      metrics,
    };
  } catch (error) {
    metrics.totalTimeMs = Date.now() - startTime;
    log.warn(
      {
        userId,
        sessionId,
        error: String(error),
        elapsedMs: metrics.totalTimeMs,
      },
      'Turn memory retrieval failed'
    );

    return {
      memories: [],
      hasProactiveSuggestion: false,
      metrics,
    };
  }
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format memory context for LLM injection
 */
export function formatMemoryContextForPrompt(context: MemoryContext): string | null {
  if (context.memories.length === 0) {
    return null;
  }

  const lines: string[] = ['[MEMORY CONTEXT - Use naturally if relevant]'];

  for (const memory of context.memories) {
    const confidenceLabel =
      memory.relevance > 0.9 ? 'certain' : memory.relevance > 0.7 ? 'likely' : 'possible';

    lines.push(`• (${confidenceLabel}) ${memory.attribution}: "${memory.content}"`);
  }

  lines.push('');
  lines.push(
    'Use these memories naturally in your response. ' +
      "Don't force them if they're not relevant to what the user is saying."
  );

  return lines.join('\n');
}

/**
 * Format proactive memory suggestion
 */
export function formatProactiveMemory(memory: RetrievedMemoryForTurn): string {
  return (
    `[PROACTIVE MEMORY OPPORTUNITY]\n` +
    `You might want to bring up: "${memory.content}"\n` +
    `${memory.attribution} this might be relevant to the conversation.`
  );
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Cleanup function for session end
 */
export function cleanupTurnRetrieval(sessionId: string): void {
  clearSessionSurfacingHistory(sessionId);
}

/**
 * Get retrieval stats for observability
 */
export function getTurnRetrievalStats(): {
  activeSessions: number;
  totalSurfacedMemories: number;
} {
  let totalSurfaced = 0;
  for (const sessionMap of recentlySurfacedBySession.values()) {
    totalSurfaced += sessionMap.size;
  }

  return {
    activeSessions: recentlySurfacedBySession.size,
    totalSurfacedMemories: totalSurfaced,
  };
}

// ============================================================================
// USER MEMORY SEARCH (for joy pool building, etc.)
// ============================================================================

export interface UserMemorySearchOptions {
  query: string;
  limit?: number;
}

export interface UserMemoryResult {
  id: string;
  content: string;
  timestamp?: Date;
  relevance: number;
}

/**
 * Search user memories by query.
 * Used for building joy pools, finding related memories, etc.
 */
export async function searchUserMemories(
  userId: string,
  options: UserMemorySearchOptions
): Promise<UserMemoryResult[]> {
  try {
    const { results } = await hybridSearch(userId, options.query, {
      topK: options.limit || 20,
      bm25Weight: 0.3,
      vectorWeight: 0.7,
      includeEntities: false,
    });

    return results.map((r: HybridSearchResult) => ({
      id: r.id,
      content: r.text, // HybridSearchResult uses 'text' not 'content'
      timestamp: undefined, // HybridSearchResult doesn't include timestamp
      relevance: r.score,
    }));
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'User memory search failed');
    return [];
  }
}
