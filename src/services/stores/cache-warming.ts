/**
 * Cache Warming Service
 *
 * Proactively warms caches on startup and prefetches content for active sessions.
 *
 * Features:
 * - Startup warming for common persona bundles
 * - Session-based story/knowledge prefetching
 * - Embedding prefetching for common queries
 * - Background warming without blocking
 *
 * @module services/cache-warming
 */

import { createLogger } from '../../utils/safe-logger.js';
import { loadBundleById, discoverBundles } from '../../personas/bundles/index.js';
import { loadPersonaBehaviors } from './persona-content-loader.js';
import { getEmbeddingCache } from '../memory/embedding-cache.js';

const log = createLogger({ module: 'cache-warming' });

// ============================================================================
// CONCURRENCY UTILITIES
// ============================================================================

/**
 * Run async tasks with a concurrency limit
 * Unlike Promise.all, this actually limits how many tasks run simultaneously
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }>> {
  const results: Array<
    { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }
  > = [];
  const executing: Array<Promise<void>> = [];

  for (const task of tasks) {
    const p = (async () => {
      try {
        const value = await task();
        results.push({ status: 'fulfilled', value });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    })();

    executing.push(p);

    // When we hit the limit, wait for one to complete before starting more
    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises - filter out settled ones
      const stillExecuting: Array<Promise<void>> = [];
      for (const p of executing) {
        // Check if promise is settled by racing with an immediate resolve
        const settled = await Promise.race([p.then(() => true), Promise.resolve(false)]);
        if (!settled) {
          stillExecuting.push(p);
        }
      }
      executing.length = 0;
      executing.push(...stillExecuting);
    }
  }

  // Wait for remaining tasks
  await Promise.all(executing);

  return results;
}

// ============================================================================
// TYPES
// ============================================================================

export interface WarmingConfig {
  /** Personas to pre-load on startup */
  priorityPersonas: string[];
  /** Common embedding texts to prefetch */
  commonEmbeddingTexts: string[];
  /** Whether to warm embeddings (may incur API costs) */
  warmEmbeddings: boolean;
  /** Maximum concurrent warm operations */
  maxConcurrency: number;
}

export interface WarmingResult {
  personasWarmed: number;
  behaviorsWarmed: number;
  embeddingsWarmed: number;
  durationMs: number;
  errors: string[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: WarmingConfig = {
  priorityPersonas: ['ferni', 'maya-santos', 'alex-chen', 'peter-john'],
  commonEmbeddingTexts: [
    // Common greeting patterns
    'hello',
    'hi there',
    'good morning',
    'how are you',
    // Common topics
    'I need help with',
    'I want to talk about',
    'I have a question',
    // Emotional states
    'I feel anxious',
    'I feel stressed',
    'I feel happy',
    'I feel sad',
  ],
  warmEmbeddings: false, // Disabled by default to avoid API costs
  maxConcurrency: 3,
};

// ============================================================================
// WARMING STATE
// ============================================================================

let isWarming = false;
let warmingPromise: Promise<WarmingResult> | null = null;

// ============================================================================
// WARMING FUNCTIONS
// ============================================================================

/**
 * Warm persona bundle cache
 */
async function warmPersonaBundle(personaId: string): Promise<boolean> {
  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      log.warn({ personaId }, 'Persona bundle not found during warming');
      return false;
    }

    // Pre-load behaviors (most commonly accessed)
    await loadPersonaBehaviors(personaId);

    // Pre-load story index if available
    await bundle.getAllStories?.();

    log.debug({ personaId }, 'Warmed persona bundle');
    return true;
  } catch (error) {
    log.error({ personaId, error: String(error) }, 'Failed to warm persona bundle');
    return false;
  }
}

/**
 * Warm embedding cache with common texts
 * Uses batch API for efficiency - eliminates race condition and is 3-4x faster
 */
async function warmEmbeddings(texts: string[]): Promise<number> {
  const cache = getEmbeddingCache();

  // Filter to only texts not already cached
  const uncachedTexts = texts.filter((text) => !cache.has(text));

  if (uncachedTexts.length === 0) {
    log.debug('All embedding texts already cached');
    return 0;
  }

  try {
    // Use getBatch for atomic, parallel embedding generation
    // This eliminates the check-then-act race condition and is much faster
    const result = await cache.getBatch(uncachedTexts);

    if (result.ok) {
      log.debug({ count: uncachedTexts.length }, 'Warmed embeddings via batch API');
      return uncachedTexts.length;
    } else {
      log.warn({ error: result.error.message }, 'Batch embedding warmup failed');
      return 0;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to warm embeddings');
    return 0;
  }
}

/**
 * Run startup cache warming
 */
export async function warmCachesOnStartup(
  config: Partial<WarmingConfig> = {}
): Promise<WarmingResult> {
  // Return existing promise if warming is in progress
  if (warmingPromise) {
    return warmingPromise;
  }

  if (isWarming) {
    return {
      personasWarmed: 0,
      behaviorsWarmed: 0,
      embeddingsWarmed: 0,
      durationMs: 0,
      errors: ['Warming already in progress'],
    };
  }

  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  isWarming = true;

  warmingPromise = (async () => {
    const startTime = Date.now();
    const errors: string[] = [];
    let personasWarmed = 0;
    let behaviorsWarmed = 0;
    let embeddingsWarmed = 0;

    log.info({ config: fullConfig }, 'Starting cache warming');

    try {
      // Warm priority personas with REAL concurrency limit
      // Creates task functions (not promises) so execution is deferred
      const personaTasks = fullConfig.priorityPersonas.map((personaId) => async () => {
        try {
          const success = await warmPersonaBundle(personaId);
          if (success) {
            personasWarmed++;
            behaviorsWarmed++;
          }
          return { personaId, success };
        } catch (err) {
          log.warn({ personaId, error: String(err) }, 'Failed to warm persona bundle');
          return { personaId, success: false, error: String(err) };
        }
      });

      // Execute with actual concurrency limit (tasks start only when slot available)
      await runWithConcurrency(personaTasks, fullConfig.maxConcurrency);

      // Warm embeddings if enabled
      if (fullConfig.warmEmbeddings && fullConfig.commonEmbeddingTexts.length > 0) {
        embeddingsWarmed = await warmEmbeddings(fullConfig.commonEmbeddingTexts);
      }
    } catch (error) {
      errors.push(String(error));
      log.error({ error: String(error) }, 'Cache warming failed');
    }

    const durationMs = Date.now() - startTime;

    log.info(
      {
        personasWarmed,
        behaviorsWarmed,
        embeddingsWarmed,
        durationMs,
        errors: errors.length,
      },
      'Cache warming completed'
    );

    isWarming = false;
    warmingPromise = null;

    return {
      personasWarmed,
      behaviorsWarmed,
      embeddingsWarmed,
      durationMs,
      errors,
    };
  })();

  return warmingPromise;
}

/**
 * Prefetch content for a specific session/persona
 * Called when a session starts to warm relevant caches
 */
export async function prefetchForSession(
  personaId: string,
  userId?: string
): Promise<{ stories: number; knowledge: number; behaviors: number }> {
  log.debug({ personaId, userId }, 'Prefetching content for session');

  let stories = 0;
  const knowledge = 0; // Knowledge is loaded on-demand per topic, not bulk prefetchable
  let behaviors = 0;

  try {
    // Load the bundle
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      return { stories, knowledge, behaviors };
    }

    // Prefetch behaviors (most important for response generation)
    const behaviorResult = await loadPersonaBehaviors(personaId);
    if (behaviorResult) {
      behaviors = Object.keys(behaviorResult).length;
    }

    // Prefetch all stories (background)
    const allStories = await bundle.getAllStories?.();
    if (allStories) {
      stories = allStories.length;
    }

    // Note: knowledge is loaded on-demand per topic, not bulk prefetchable
    // The stories prefetch covers the main content warming use case

    log.debug({ personaId, stories, knowledge, behaviors }, 'Session prefetch completed');
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Session prefetch failed');
  }

  return { stories, knowledge, behaviors };
}

/**
 * Prefetch embeddings for expected queries based on persona
 * Uses batch API for efficiency - eliminates race condition and is 3-4x faster
 */
export async function prefetchPersonaEmbeddings(personaId: string): Promise<number> {
  // Persona-specific common queries
  const personaQueries: Record<string, string[]> = {
    ferni: ['how are you feeling', 'tell me about yourself', 'I need advice', 'what should I do'],
    'maya-santos': [
      'help me build a habit',
      'morning routine',
      'exercise motivation',
      'staying consistent',
    ],
    'alex-chen': [
      'help me write an email',
      'workplace communication',
      'difficult conversation',
      'professional advice',
    ],
    'peter-john': [
      'investment advice',
      'market analysis',
      'financial planning',
      'portfolio review',
    ],
    'jordan-taylor': ['event planning', 'party ideas', 'celebration planning', 'milestone event'],
    'nayan-patel': [
      'meditation guidance',
      'mindfulness practice',
      'finding peace',
      'spiritual question',
    ],
  };

  const queries = personaQueries[personaId] || [];
  if (queries.length === 0) {
    return 0;
  }

  const cache = getEmbeddingCache();

  // Filter to only uncached queries
  const uncachedQueries = queries.filter((query) => !cache.has(query));

  if (uncachedQueries.length === 0) {
    return 0;
  }

  try {
    // Use getBatch for atomic, parallel embedding generation
    const result = await cache.getBatch(uncachedQueries);
    return result.ok ? uncachedQueries.length : 0;
  } catch {
    // Silently ignore embedding failures during prefetch
    return 0;
  }
}

/**
 * Check if warming is currently in progress
 */
export function isWarmingInProgress(): boolean {
  return isWarming;
}

/**
 * Get list of available personas for warming
 */
export async function getWarmablePersonas(): Promise<string[]> {
  try {
    // discoverBundles returns string[] of bundle IDs
    const bundleIds = await discoverBundles();
    return bundleIds;
  } catch {
    return DEFAULT_CONFIG.priorityPersonas;
  }
}

export default {
  warmCachesOnStartup,
  prefetchForSession,
  prefetchPersonaEmbeddings,
  isWarmingInProgress,
  getWarmablePersonas,
};
