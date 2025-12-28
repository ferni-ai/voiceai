/**
 * Session Performance Optimizations
 *
 * Implements four key optimizations for the voice agent critical path:
 *
 * 1. PRE-WARM USER MEMORY EMBEDDINGS - Generate embeddings at session start
 * 2. TOOL EXECUTION PARALLELIZATION - Execute independent tools concurrently
 * 3. MEMORY DEDUPLICATION CACHE - Prevent redundant memory lookups
 * 4. SPECULATIVE CONTEXT PREFETCH - Start context building during user speech
 *
 * @module agents/shared/performance/session-optimizations
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'session-optimizations' });

// ============================================================================
// 1. PRE-WARM USER MEMORY EMBEDDINGS
// ============================================================================

interface PrewarmConfig {
  maxTopics?: number;
  maxPhrases?: number;
  timeoutMs?: number;
}

const DEFAULT_PREWARM_CONFIG: PrewarmConfig = {
  maxTopics: 10,
  maxPhrases: 20,
  timeoutMs: 5000,
};

/**
 * Pre-warm embeddings for a user's common topics and phrases
 * Run at session start to eliminate cold-start latency
 */
export async function prewarmUserEmbeddings(
  userId: string,
  config: PrewarmConfig = {}
): Promise<{ warmedCount: number; durationMs: number }> {
  const startTime = Date.now();
  const { maxTopics, maxPhrases, timeoutMs } = { ...DEFAULT_PREWARM_CONFIG, ...config };

  try {
    // Import dynamically to avoid circular deps
    const { getFirestore } = await import('firebase-admin/firestore');
    const { embedBatchCached } = await import('../../../memory/embedding-cache.js');

    const db = getFirestore();
    const textsToWarm: string[] = [];

    // 1. Get recent topics from extracted facts
    const factsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('extracted_facts')
      .orderBy('extractedAt', 'desc')
      .limit(maxTopics!)
      .get();

    for (const doc of factsSnapshot.docs) {
      const data = doc.data();
      const fact = (data.fact || data.content) as string;
      if (fact && fact.length > 10) {
        textsToWarm.push(fact);
      }
    }

    // 2. Get recent conversation summaries
    const summariesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversation_summaries')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    for (const doc of summariesSnapshot.docs) {
      const data = doc.data();
      if (data.summary && typeof data.summary === 'string') {
        textsToWarm.push(data.summary);
      }
      // Also warm key topics from summaries
      if (Array.isArray(data.topics)) {
        for (const topic of data.topics.slice(0, 3)) {
          if (typeof topic === 'string') {
            textsToWarm.push(topic);
          }
        }
      }
    }

    // 3. Warm embeddings in batch (with timeout)
    if (textsToWarm.length > 0) {
      const uniqueTexts = [...new Set(textsToWarm)].slice(0, maxPhrases!);

      const warmPromise = embedBatchCached(uniqueTexts);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      });

      const result = await Promise.race([warmPromise, timeoutPromise]);

      if (result === null) {
        log.warn({ userId, attempted: uniqueTexts.length }, '⏱️ Embedding prewarm timed out');
        return { warmedCount: 0, durationMs: Date.now() - startTime };
      }

      const durationMs = Date.now() - startTime;
      log.info(
        { userId, warmedCount: uniqueTexts.length, durationMs },
        '🔥 Pre-warmed user embeddings'
      );

      return { warmedCount: uniqueTexts.length, durationMs };
    }

    return { warmedCount: 0, durationMs: Date.now() - startTime };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Embedding prewarm failed (non-blocking)');
    return { warmedCount: 0, durationMs: Date.now() - startTime };
  }
}

// ============================================================================
// 2. TOOL EXECUTION PARALLELIZATION
// ============================================================================

interface ToolCall {
  fn: string;
  args: Record<string, unknown>;
}

interface ParallelToolResult {
  fn: string;
  result: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
}

// Tools that can safely run in parallel (no side effects on each other)
const PARALLELIZABLE_TOOLS = new Set([
  'getweather',
  'getcurrenttime',
  'getnews',
  'searchnews',
  'getmarketsummary',
  'getquote',
  'recallfrommemory',
  'getrelationshipsummary',
  'getcalendartoday',
  'getschedule',
  'gethabits',
  'gettasks',
  'getnotes',
  'getbills',
  'getpackages',
  'getgamestatus',
  'gethomestatus',
  'medicationschedule',
]);

// Tools that MUST run sequentially (have side effects)
const SEQUENTIAL_TOOLS = new Set([
  'rememberaboutuser',
  'updatememory',
  'forgetmemory',
  'addtask',
  'completetask',
  'addbill',
  'paybill',
  'playmusic',
  'musiccontrol',
  'sendmessage',
  'createcalendarevent',
  'scheduleevent',
]);

/**
 * Execute multiple tool calls with intelligent parallelization
 * Read-only tools run in parallel, write tools run sequentially
 */
export async function executeToolsParallel(
  toolCalls: ToolCall[],
  executor: (fn: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<ParallelToolResult[]> {
  if (toolCalls.length === 0) return [];
  if (toolCalls.length === 1) {
    // Single tool - no parallelization needed
    const start = Date.now();
    try {
      const result = await executor(toolCalls[0].fn, toolCalls[0].args);
      return [
        {
          fn: toolCalls[0].fn,
          result,
          success: true,
          durationMs: Date.now() - start,
        },
      ];
    } catch (error) {
      return [
        {
          fn: toolCalls[0].fn,
          result: null,
          success: false,
          error: String(error),
          durationMs: Date.now() - start,
        },
      ];
    }
  }

  // Separate parallelizable and sequential tools
  const parallel: ToolCall[] = [];
  const sequential: ToolCall[] = [];

  for (const call of toolCalls) {
    const fnLower = call.fn.toLowerCase();
    if (PARALLELIZABLE_TOOLS.has(fnLower)) {
      parallel.push(call);
    } else if (SEQUENTIAL_TOOLS.has(fnLower)) {
      sequential.push(call);
    } else {
      // Unknown tools default to sequential for safety
      sequential.push(call);
    }
  }

  const results: ParallelToolResult[] = [];

  // Run parallelizable tools concurrently
  if (parallel.length > 0) {
    const parallelStart = Date.now();
    const parallelResults = await Promise.allSettled(
      parallel.map(async (call) => {
        const start = Date.now();
        const result = await executor(call.fn, call.args);
        return {
          fn: call.fn,
          result,
          success: true,
          durationMs: Date.now() - start,
        };
      })
    );

    for (let i = 0; i < parallelResults.length; i++) {
      const settled = parallelResults[i];
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        results.push({
          fn: parallel[i].fn,
          result: null,
          success: false,
          error: String(settled.reason),
          durationMs: Date.now() - parallelStart,
        });
      }
    }

    log.debug(
      { parallelCount: parallel.length, durationMs: Date.now() - parallelStart },
      '⚡ Executed tools in parallel'
    );
  }

  // Run sequential tools one at a time
  for (const call of sequential) {
    const start = Date.now();
    try {
      const result = await executor(call.fn, call.args);
      results.push({
        fn: call.fn,
        result,
        success: true,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        fn: call.fn,
        result: null,
        success: false,
        error: String(error),
        durationMs: Date.now() - start,
      });
    }
  }

  return results;
}

// ============================================================================
// 3. MEMORY DEDUPLICATION CACHE
// ============================================================================

interface CachedMemoryResult {
  result: unknown;
  timestamp: number;
  query: string;
}

// Per-session memory cache to prevent redundant lookups
const sessionMemoryCache = new Map<string, Map<string, CachedMemoryResult>>();

const MEMORY_CACHE_TTL_MS = 30_000; // 30 seconds
const MEMORY_CACHE_MAX_SIZE = 50;

/**
 * Get or create memory cache for a session
 */
function getSessionMemoryCache(sessionId: string): Map<string, CachedMemoryResult> {
  if (!sessionMemoryCache.has(sessionId)) {
    sessionMemoryCache.set(sessionId, new Map());
  }
  return sessionMemoryCache.get(sessionId)!;
}

/**
 * Check if a memory query result is cached
 */
export function getCachedMemoryResult(sessionId: string, query: string): CachedMemoryResult | null {
  const cache = getSessionMemoryCache(sessionId);
  const normalizedQuery = query.toLowerCase().trim();

  const cached = cache.get(normalizedQuery);
  if (!cached) return null;

  // Check TTL
  if (Date.now() - cached.timestamp > MEMORY_CACHE_TTL_MS) {
    cache.delete(normalizedQuery);
    return null;
  }

  log.debug({ sessionId, query: query.slice(0, 30) }, '💾 Memory cache hit');
  return cached;
}

/**
 * Cache a memory query result
 */
export function cacheMemoryResult(sessionId: string, query: string, result: unknown): void {
  const cache = getSessionMemoryCache(sessionId);
  const normalizedQuery = query.toLowerCase().trim();

  // Evict oldest if at capacity
  if (cache.size >= MEMORY_CACHE_MAX_SIZE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) {
      cache.delete(oldest[0]);
    }
  }

  cache.set(cleanForFirestore(normalizedQuery), {
    result,
    timestamp: Date.now(),
    query: normalizedQuery,
  });
}

/**
 * Clear memory cache for a session (call on session end)
 */
export function clearSessionMemoryCache(sessionId: string): void {
  sessionMemoryCache.delete(sessionId);
  log.debug({ sessionId }, '🧹 Cleared session memory cache');
}

/**
 * Get cache statistics
 */
export function getMemoryCacheStats(): {
  sessionCount: number;
  totalEntries: number;
} {
  let totalEntries = 0;
  for (const cache of sessionMemoryCache.values()) {
    totalEntries += cache.size;
  }
  return {
    sessionCount: sessionMemoryCache.size,
    totalEntries,
  };
}

// ============================================================================
// 4. SPECULATIVE CONTEXT PREFETCH
// ============================================================================

interface PrefetchState {
  partialText: string;
  prefetchPromise: Promise<unknown> | null;
  prefetchedContext: unknown | null;
  timestamp: number;
}

// Per-session prefetch state
const sessionPrefetchState = new Map<string, PrefetchState>();

const PREFETCH_MIN_LENGTH = 15; // Minimum chars before prefetching
const PREFETCH_DEBOUNCE_MS = 200; // Debounce rapid updates
const PREFETCH_STALE_MS = 5000; // Consider prefetch stale after 5s

/**
 * Start speculative context prefetch based on partial user speech
 * Non-blocking - runs in background
 */
export function startSpeculativePrefetch(
  sessionId: string,
  partialText: string,
  prefetchFn: (text: string) => Promise<unknown>
): void {
  // Skip if too short
  if (partialText.length < PREFETCH_MIN_LENGTH) {
    return;
  }

  const existing = sessionPrefetchState.get(sessionId);

  // Debounce: skip if we recently started a prefetch for similar text
  if (existing && Date.now() - existing.timestamp < PREFETCH_DEBOUNCE_MS) {
    return;
  }

  // Skip if text is same or similar to existing prefetch
  if (existing?.partialText && partialText.startsWith(existing.partialText)) {
    // Text grew but root is same - existing prefetch likely still valid
    return;
  }

  // Start new prefetch
  const prefetchPromise = prefetchFn(partialText).catch((error) => {
    log.debug({ error: String(error), sessionId }, 'Speculative prefetch failed (non-blocking)');
    return null;
  });

  sessionPrefetchState.set(cleanForFirestore(sessionId), {
    partialText,
    prefetchPromise,
    prefetchedContext: null,
    timestamp: Date.now(),
  });

  // Store result when ready
  prefetchPromise.then((result) => {
    const state = sessionPrefetchState.get(sessionId);
    if (state && state.partialText === partialText) {
      state.prefetchedContext = result;
      log.debug({ sessionId, textLength: partialText.length }, '🔮 Speculative prefetch complete');
    }
  });
}

/**
 * Get prefetched context if available and relevant
 */
export function getSpeculativePrefetch<T>(sessionId: string, finalText: string): T | null {
  const state = sessionPrefetchState.get(sessionId);
  if (!state) return null;

  // Check if stale
  if (Date.now() - state.timestamp > PREFETCH_STALE_MS) {
    sessionPrefetchState.delete(sessionId);
    return null;
  }

  // Check if final text is related to prefetched text
  // Simple heuristic: final text should start with or contain prefetch text
  const finalLower = finalText.toLowerCase();
  const prefetchLower = state.partialText.toLowerCase();

  const isRelated =
    finalLower.startsWith(prefetchLower) || finalLower.includes(prefetchLower.slice(0, 20));

  if (!isRelated) {
    log.debug({ sessionId }, '🔮 Prefetch not relevant to final text');
    return null;
  }

  if (state.prefetchedContext) {
    log.info({ sessionId }, '🎯 Using speculative prefetch - saved ~150ms');
    const result = state.prefetchedContext as T;
    sessionPrefetchState.delete(sessionId);
    return result;
  }

  return null;
}

/**
 * Clear prefetch state for a session
 */
export function clearSpeculativePrefetch(sessionId: string): void {
  sessionPrefetchState.delete(sessionId);
}

// ============================================================================
// COMBINED SESSION OPTIMIZATION
// ============================================================================

/**
 * Run all session start optimizations
 * Call this when a session begins
 */
export async function optimizeSessionStart(
  sessionId: string,
  userId: string
): Promise<{
  embeddingsWarmed: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  // Run embedding prewarm (non-blocking if it times out)
  const prewarmResult = await prewarmUserEmbeddings(userId, {
    timeoutMs: 3000, // Aggressive timeout for session start
  });

  log.info(
    {
      sessionId,
      userId,
      embeddingsWarmed: prewarmResult.warmedCount,
      durationMs: Date.now() - startTime,
    },
    '🚀 Session optimizations complete'
  );

  return {
    embeddingsWarmed: prewarmResult.warmedCount,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Clean up all optimizations for a session
 * Call this when a session ends
 */
export function cleanupSessionOptimizations(sessionId: string): void {
  clearSessionMemoryCache(sessionId);
  clearSpeculativePrefetch(sessionId);
  log.debug({ sessionId }, '🧹 Session optimizations cleaned up');
}
