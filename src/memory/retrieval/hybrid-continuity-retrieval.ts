/**
 * Hybrid Continuity Retrieval
 *
 * Merges memories from two sources for "Better than Human" recall:
 * 1. Firestore: Recent capsule + last summary (fast, last 7 days)
 * 2. Vector: Semantic search results (context-relevant)
 *
 * @module memory/retrieval/hybrid-continuity-retrieval
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getMemoryCapsule, type MemoryCapsule } from '../dynamic/memory-continuity.js';
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
  type: MemoryCapsule['topAnchors'][number]['type'];
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
// HELPERS
// ============================================================================

/**
 * Calculate days since a date
 */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Threads, anchors and pending topics from the capsule. Only anchors with
 * significance >= 0.7 are surfaced.
 */
function fromCapsule(capsule: MemoryCapsule | null): {
  threads: ThreadSummary[];
  anchors: AnchorSummary[];
  pendingTopics: string[];
} {
  if (!capsule) {
    return { threads: [], anchors: [], pendingTopics: [] };
  }

  const threads: ThreadSummary[] = capsule.activeThreads.map((capsuleThread) => ({
    theme: capsuleThread.theme,
    sessionCount: capsuleThread.sessionCount,
    daysSinceLastUpdate: daysSince(new Date(capsuleThread.lastUpdated)),
    confidence: 0.6, // Default confidence for capsule-only threads
    relevanceScore: 0.5,
  }));

  const anchors: AnchorSummary[] = capsule.topAnchors
    .filter((capsuleAnchor) => capsuleAnchor.significance >= 0.7)
    .map((capsuleAnchor) => ({
      type: capsuleAnchor.type,
      summary: capsuleAnchor.summary,
      significance: capsuleAnchor.significance,
      daysSinceCreated: 0, // Unknown from capsule
      timesRecalled: 0,
      relevanceScore: 0.5,
    }));

  return {
    threads: threads.slice(0, 10),
    anchors: anchors.slice(0, 10),
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
    capsuleFound: false,
    retrievalTimeMs: 0,
    threadCount: 0,
    anchorCount: 0,
    semanticMatchCount: 0,
  };

  // 1. Get memory capsule from Firestore (fast path)
  const capsule = await getMemoryCapsule(userId);
  metadata.capsuleFound = capsule !== null;

  // 2. Threads and anchors from the capsule
  const merged = fromCapsule(capsule);
  metadata.threadCount = merged.threads.length;
  metadata.anchorCount = merged.anchors.length;

  // 3. Semantic search for context-relevant memories
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
