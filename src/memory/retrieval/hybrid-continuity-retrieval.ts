/**
 * Hybrid Continuity Retrieval
 *
 * Merges memories from three sources for "Better than Human" recall:
 * 1. Firestore: Recent capsule + last summary (fast, last 7 days)
 * 2. Spanner: Thread state + anchors (durable, weeks/months)
 * 3. Vector: Semantic search results (context-relevant)
 *
 * Uses a rank/merge policy based on:
 * - Freshness: Recent memories score higher
 * - Significance: High-significance anchors boost score
 * - Relevance: Semantic match to current context
 *
 * @module memory/retrieval/hybrid-continuity-retrieval
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getMemoryCapsule, type MemoryCapsule } from '../dynamic/memory-continuity.js';
import {
  getMemoryThreadsByUser,
  getMemoryAnchorsByUser,
  isSpannerReady,
  markAnchorRecalled,
  type MemoryThread,
  type MemoryAnchor,
  type MemoryAnchorType,
} from '../spanner-graph/index.js';
import {
  searchMemories,
  toSemanticMatches,
  type SemanticSearchMetrics,
} from './semantic-memory-search.js';

const log = createLogger({ module: 'HybridContinuityRetrieval' });

// ============================================================================
// TYPES
// ============================================================================

export interface ContinuityBundle {
  /** Rolling summary from recent sessions */
  rollingSummary?: string;
  /** Active conversation threads */
  activeThreads: ThreadSummary[];
  /** High-significance anchors for proactive recall */
  topAnchors: AnchorSummary[];
  /** Topics to follow up on */
  pendingTopics: string[];
  /** Last emotional state */
  lastEmotionalState?: string;
  /** Semantic matches from vector search */
  semanticMatches: SemanticMatch[];
  /** Retrieval metadata */
  metadata: RetrievalMetadata;
}

export interface ThreadSummary {
  /** Thread ID for attribution tracking */
  threadId?: string;
  theme: string;
  rollingSummary?: string;
  sessionCount: number;
  daysSinceLastUpdate: number;
  confidence: number;
  /** Relevance score to current context (0-1) */
  relevanceScore: number;
}

export interface AnchorSummary {
  /** Anchor ID for attribution tracking */
  anchorId?: string;
  type: MemoryAnchorType;
  summary: string;
  context?: string;
  significance: number;
  daysSinceCreated: number;
  timesRecalled: number;
  /** Relevance score to current context (0-1) */
  relevanceScore: number;
}

export interface SemanticMatch {
  /** Memory ID for attribution tracking */
  memoryId?: string;
  text: string;
  source: string;
  score: number;
}

export interface RetrievalMetadata {
  /** Whether Spanner was available */
  spannerAvailable: boolean;
  /** Whether capsule was found */
  capsuleFound: boolean;
  /** Total retrieval time in ms */
  retrievalTimeMs: number;
  /** Number of threads retrieved */
  threadCount: number;
  /** Number of anchors retrieved */
  anchorCount: number;
  /** Number of semantic matches */
  semanticMatchCount: number;
}

export interface RetrievalOptions {
  /** Current user message for relevance scoring */
  currentContext?: string;
  /** Maximum threads to retrieve */
  maxThreads?: number;
  /** Maximum anchors to retrieve */
  maxAnchors?: number;
  /** Maximum semantic matches to retrieve */
  maxSemanticMatches?: number;
  /** Minimum significance for anchors */
  minAnchorSignificance?: number;
  /** Minimum score for semantic matches (0-1) */
  minSemanticScore?: number;
  /** Whether to include semantic search (default: true when context provided) */
  includeSemanticSearch?: boolean;
}

// ============================================================================
// RANKING FUNCTIONS
// ============================================================================

/**
 * Calculate freshness score (0-1) based on days since update
 */
function freshnessScore(daysSince: number): number {
  if (daysSince <= 1) return 1.0;
  if (daysSince <= 3) return 0.9;
  if (daysSince <= 7) return 0.8;
  if (daysSince <= 14) return 0.6;
  if (daysSince <= 30) return 0.4;
  if (daysSince <= 90) return 0.2;
  return 0.1;
}

/**
 * Calculate basic text relevance score (simple keyword matching)
 * More sophisticated scoring would use embeddings
 */
function textRelevanceScore(text: string, context: string): number {
  if (!context || !text) return 0.5;

  const contextWords = new Set(
    context
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const textWords = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  if (textWords.length === 0) return 0.5;

  let matches = 0;
  for (const word of textWords) {
    if (contextWords.has(word)) matches++;
  }

  return Math.min(0.5 + (matches / textWords.length) * 0.5, 1.0);
}

/**
 * Calculate combined ranking score for a thread
 */
function rankThread(thread: MemoryThread, context?: string): number {
  const fresh = freshnessScore(daysSince(thread.lastUpdated));
  const relevance = context
    ? textRelevanceScore(`${thread.theme} ${thread.rollingSummary || ''}`, context)
    : 0.5;
  const confidence = thread.confidence;

  // Weighted combination: 40% freshness, 35% relevance, 25% confidence
  return fresh * 0.4 + relevance * 0.35 + confidence * 0.25;
}

/**
 * Calculate combined ranking score for an anchor
 */
function rankAnchor(anchor: MemoryAnchor, context?: string): number {
  const fresh = freshnessScore(daysSince(anchor.createdAt));
  const relevance = context
    ? textRelevanceScore(`${anchor.payload.summary} ${anchor.payload.context || ''}`, context)
    : 0.5;
  const significance = anchor.significanceScore;

  // Usage boost: memories that are frequently referenced get higher scores
  const recallBoost = anchor.recallCount > 0 ? 0.1 * Math.log10(anchor.recallCount + 1) : 0;

  // Recency of recall boost
  let recencyBoost = 0;
  if (anchor.lastRecalled) {
    const daysSinceRecall = daysSince(anchor.lastRecalled);
    if (daysSinceRecall < 7) recencyBoost = 0.05;
    else if (daysSinceRecall < 30) recencyBoost = 0.02;
  }

  // Decay for never-recalled old memories
  let decayPenalty = 0;
  if (anchor.recallCount === 0 && daysSince(anchor.createdAt) > 30) {
    decayPenalty = Math.min(0.1, daysSince(anchor.createdAt) * 0.002);
  }

  // Weighted combination: 20% freshness, 30% relevance, 35% significance, 15% usage
  const baseScore = fresh * 0.2 + relevance * 0.3 + significance * 0.35;
  const usageScore = recallBoost + recencyBoost - decayPenalty;

  return Math.max(0.1, Math.min(1.0, baseScore + usageScore * 0.15));
}

/**
 * Calculate days since a date
 */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Retrieve and rank threads from Spanner
 */
async function retrieveThreads(
  userId: string,
  options: RetrievalOptions
): Promise<ThreadSummary[]> {
  if (!isSpannerReady()) return [];

  try {
    const threads = await getMemoryThreadsByUser(userId, {
      limit: (options.maxThreads || 10) * 2, // Get more than needed for ranking
      minConfidence: 0.3,
    });

    // Rank and sort threads
    const ranked = threads.map((t) => {
      const relevanceScore = rankThread(t, options.currentContext);
      return {
        threadId: t.threadId, // Include for attribution tracking
        theme: t.theme,
        rollingSummary: t.rollingSummary,
        sessionCount: t.sessionCount,
        daysSinceLastUpdate: daysSince(t.lastUpdated),
        confidence: t.confidence,
        relevanceScore,
        _score: relevanceScore,
      };
    });

    return ranked
      .sort((a, b) => b._score - a._score)
      .slice(0, options.maxThreads || 10)
      .map(({ _score, ...rest }) => rest);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve threads');
    return [];
  }
}

/**
 * Retrieve and rank anchors from Spanner
 */
async function retrieveAnchors(
  userId: string,
  options: RetrievalOptions
): Promise<AnchorSummary[]> {
  if (!isSpannerReady()) return [];

  try {
    const anchors = await getMemoryAnchorsByUser(userId, {
      limit: (options.maxAnchors || 10) * 2,
      minSignificance: options.minAnchorSignificance || 0.5,
    });

    // Rank and sort anchors
    const ranked = anchors.map((a) => {
      const relevanceScore = rankAnchor(a, options.currentContext);
      return {
        anchorId: a.anchorId,
        type: a.anchorType,
        summary: a.payload.summary,
        context: a.payload.context,
        significance: a.significanceScore,
        daysSinceCreated: daysSince(a.createdAt),
        timesRecalled: a.recallCount,
        relevanceScore,
        _score: relevanceScore,
      };
    });

    const topAnchors = ranked
      .sort((a, b) => b._score - a._score)
      .slice(0, options.maxAnchors || 10);

    // Mark top anchors as recalled (async, don't await)
    for (const anchor of topAnchors.slice(0, 3)) {
      markAnchorRecalled(userId, anchor.anchorId).catch((err) => {
        log.debug({ error: String(err), userId, anchorId: anchor.anchorId }, 'Failed to mark anchor recalled (non-critical)');
      });
    }

    return topAnchors.map(({ _score, ...rest }) => rest);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to retrieve anchors');
    return [];
  }
}

/**
 * Merge capsule data with Spanner data
 */
function mergeCapsuleWithSpanner(
  capsule: MemoryCapsule | null,
  threads: ThreadSummary[],
  anchors: AnchorSummary[]
): { threads: ThreadSummary[]; anchors: AnchorSummary[]; pendingTopics: string[] } {
  // If no capsule, use Spanner data as-is
  if (!capsule) {
    return { threads, anchors, pendingTopics: [] };
  }

  // Merge threads: prefer Spanner (more detailed) but fill gaps from capsule
  const threadThemes = new Set(threads.map((t) => t.theme.toLowerCase()));
  const mergedThreads = [...threads];

  for (const capsuleThread of capsule.activeThreads) {
    if (!threadThemes.has(capsuleThread.theme.toLowerCase())) {
      mergedThreads.push({
        theme: capsuleThread.theme,
        sessionCount: capsuleThread.sessionCount,
        daysSinceLastUpdate: daysSince(new Date(capsuleThread.lastUpdated)),
        confidence: 0.6, // Default confidence for capsule-only threads
        relevanceScore: 0.5,
      });
    }
  }

  // Merge anchors: prefer Spanner but add high-significance capsule anchors
  const mergedAnchors = [...anchors];
  const anchorSummaries = new Set(anchors.map((a) => a.summary.toLowerCase().slice(0, 50)));

  for (const capsuleAnchor of capsule.topAnchors) {
    if (
      capsuleAnchor.significance >= 0.7 &&
      !anchorSummaries.has(capsuleAnchor.summary.toLowerCase().slice(0, 50))
    ) {
      mergedAnchors.push({
        type: capsuleAnchor.type,
        summary: capsuleAnchor.summary,
        significance: capsuleAnchor.significance,
        daysSinceCreated: 0, // Unknown from capsule
        timesRecalled: 0,
        relevanceScore: 0.5,
      });
    }
  }

  return {
    threads: mergedThreads.slice(0, 10),
    anchors: mergedAnchors.slice(0, 10),
    pendingTopics: capsule.pendingTopics || [],
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Retrieve continuity bundle for session start or mid-session context refresh
 *
 * @param userId - User ID
 * @param options - Retrieval options
 * @returns Continuity bundle with merged memories
 */
export async function retrieveContinuityBundle(
  userId: string,
  options: RetrievalOptions = {}
): Promise<ContinuityBundle> {
  const startTime = Date.now();

  const metadata: RetrievalMetadata = {
    spannerAvailable: isSpannerReady(),
    capsuleFound: false,
    retrievalTimeMs: 0,
    threadCount: 0,
    anchorCount: 0,
    semanticMatchCount: 0,
  };

  // 1. Get memory capsule from Firestore (fast path)
  const capsule = await getMemoryCapsule(userId);
  metadata.capsuleFound = capsule !== null;

  // 2. Get threads and anchors from Spanner (if available)
  const [spannerThreads, spannerAnchors] = await Promise.all([
    retrieveThreads(userId, options),
    retrieveAnchors(userId, options),
  ]);

  // 3. Merge capsule with Spanner data
  const merged = mergeCapsuleWithSpanner(capsule, spannerThreads, spannerAnchors);
  metadata.threadCount = merged.threads.length;
  metadata.anchorCount = merged.anchors.length;

  // 4. Semantic search for context-relevant memories
  // Default to true when currentContext is provided (mid-session retrieval)
  const shouldDoSemanticSearch =
    options.includeSemanticSearch !== false && !!options.currentContext;

  let semanticMatches: SemanticMatch[] = [];
  if (shouldDoSemanticSearch && options.currentContext) {
    try {
      const { results, metrics: semanticMetrics } = await searchMemories(
        options.currentContext,
        userId,
        {
          topK: options.maxSemanticMatches || 5,
          minScore: options.minSemanticScore || 0.5,
          sourceTypes: ['anchor', 'session_summary', 'fact'],
        }
      );

      semanticMatches = toSemanticMatches(results);
      metadata.semanticMatchCount = semanticMatches.length;

      log.debug(
        {
          results: results.length,
          embeddingMs: semanticMetrics.embeddingLatencyMs,
          searchMs: semanticMetrics.searchLatencyMs,
        },
        'Semantic search completed'
      );
    } catch (error) {
      log.debug({ error: String(error) }, 'Semantic search failed, continuing without');
    }
  }

  metadata.retrievalTimeMs = Date.now() - startTime;

  const bundle: ContinuityBundle = {
    rollingSummary: capsule?.rollingSummary,
    activeThreads: merged.threads,
    topAnchors: merged.anchors,
    pendingTopics: merged.pendingTopics,
    lastEmotionalState: capsule?.lastEmotionalState,
    semanticMatches,
    metadata,
  };

  log.info(
    {
      userId,
      threads: metadata.threadCount,
      anchors: metadata.anchorCount,
      semantic: metadata.semanticMatchCount,
      timeMs: metadata.retrievalTimeMs,
      spannerAvailable: metadata.spannerAvailable,
    },
    '🔍 Retrieved continuity bundle'
  );

  return bundle;
}

// ============================================================================
// FORMATTING FOR LLM CONTEXT
// ============================================================================

/**
 * Format continuity bundle into LLM-injectable context
 */
export function formatContinuityForLLM(bundle: ContinuityBundle): string {
  const sections: string[] = [];

  // 1. Rolling summary (most recent context)
  if (bundle.rollingSummary) {
    sections.push(`## Recent Conversations\n${bundle.rollingSummary.slice(0, 500)}`);
  }

  // 2. Active threads (with memory tags for attribution)
  if (bundle.activeThreads.length > 0) {
    const threadLines = bundle.activeThreads
      .slice(0, 5)
      .map((t) => {
        const recency =
          t.daysSinceLastUpdate === 0
            ? 'today'
            : t.daysSinceLastUpdate === 1
              ? 'yesterday'
              : `${t.daysSinceLastUpdate} days ago`;
        const tag = t.threadId ? ` [MEM:thread_${t.threadId.slice(-8)}]` : '';
        return `- **${t.theme}** (${t.sessionCount} conversations, last ${recency})${tag}`;
      })
      .join('\n');
    sections.push(`## Ongoing Threads\n${threadLines}`);
  }

  // 3. Top anchors (significant memories with tags for attribution)
  if (bundle.topAnchors.length > 0) {
    const anchorLines = bundle.topAnchors
      .slice(0, 5)
      .map((a) => {
        const typeEmoji =
          a.type === 'breakthrough'
            ? '💡'
            : a.type === 'commitment'
              ? '🤝'
              : a.type === 'growth'
                ? '🌱'
                : a.type === 'emotional_peak'
                  ? '❤️'
                  : '📌';
        const tag = a.anchorId ? ` [MEM:anchor_${a.anchorId.slice(-8)}]` : '';
        return `${typeEmoji} ${a.summary}${tag}`;
      })
      .join('\n');
    sections.push(`## Significant Memories\n${anchorLines}`);
  }

  // 4. Pending topics
  if (bundle.pendingTopics.length > 0) {
    const topicLines = bundle.pendingTopics
      .slice(0, 5)
      .map((t) => `- ${t}`)
      .join('\n');
    sections.push(`## Topics to Follow Up\n${topicLines}`);
  }

  // 5. Semantic matches (relevant memories from vector search with tags)
  if (bundle.semanticMatches.length > 0) {
    const matchLines = bundle.semanticMatches
      .slice(0, 3)
      .map((m) => {
        const tag = m.memoryId ? ` [MEM:sem_${m.memoryId.slice(-8)}]` : '';
        return `- ${m.text.slice(0, 150)}${m.text.length > 150 ? '...' : ''}${tag}`;
      })
      .join('\n');
    sections.push(`## Related Context\n${matchLines}`);
  }

  // 6. Emotional state
  if (bundle.lastEmotionalState && bundle.lastEmotionalState !== 'neutral') {
    sections.push(`## Last Known State\nEmotional state: ${bundle.lastEmotionalState}`);
  }

  if (sections.length === 0) {
    return '';
  }

  // Build context with attribution instructions
  const header = `[MEMORY CONTINUITY]

**Attribution:** When you reference or build upon any of the memories below, naturally weave in the relevant [MEM:...] tag at the end of that sentence. This helps track which memories are most valuable. Example: "I remember you mentioned your career concerns [MEM:thread_abc123]."`;

  return `${header}\n\n${sections.join('\n\n')}`;
}

// ============================================================================
// MEMORY TAGGING FOR ATTRIBUTION
// ============================================================================

export interface InjectedMemory {
  /** Memory tag (e.g., "thread_abc123", "anchor_xyz789") */
  tag: string;
  /** Full memory ID */
  fullId: string;
  /** Memory type */
  type: 'thread' | 'anchor' | 'semantic';
  /** Memory text/summary */
  text: string;
}

/**
 * Extract all injected memory tags from a continuity bundle
 * Used for attribution tracking after LLM response
 */
export function getInjectedMemories(bundle: ContinuityBundle): InjectedMemory[] {
  const memories: InjectedMemory[] = [];

  // Extract thread tags
  for (const thread of bundle.activeThreads.slice(0, 5)) {
    if (thread.threadId) {
      memories.push({
        tag: `thread_${thread.threadId.slice(-8)}`,
        fullId: thread.threadId,
        type: 'thread',
        text: thread.theme,
      });
    }
  }

  // Extract anchor tags
  for (const anchor of bundle.topAnchors.slice(0, 5)) {
    if (anchor.anchorId) {
      memories.push({
        tag: `anchor_${anchor.anchorId.slice(-8)}`,
        fullId: anchor.anchorId,
        type: 'anchor',
        text: anchor.summary,
      });
    }
  }

  // Extract semantic match tags
  for (const match of bundle.semanticMatches.slice(0, 3)) {
    if (match.memoryId) {
      memories.push({
        tag: `sem_${match.memoryId.slice(-8)}`,
        fullId: match.memoryId,
        type: 'semantic',
        text: match.text.slice(0, 100),
      });
    }
  }

  return memories;
}
