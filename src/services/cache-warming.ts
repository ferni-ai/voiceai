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

import { createLogger } from '../utils/safe-logger.js';
import { loadBundleById, discoverBundles } from '../personas/bundles/index.js';
import { loadPersonaBehaviors } from './persona-content-loader.js';
import { getEmbeddingCache } from '../memory/embedding-cache.js';

const log = createLogger({ module: 'cache-warming' });

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
 */
async function warmEmbeddings(texts: string[]): Promise<number> {
  const cache = getEmbeddingCache();
  let warmed = 0;

  for (const text of texts) {
    if (!cache.has(text)) {
      try {
        await cache.get(text);
        warmed++;
      } catch (error) {
        log.warn({ text: text.slice(0, 30), error: String(error) }, 'Failed to warm embedding');
      }
    }
  }

  return warmed;
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
      // Warm priority personas (in parallel with concurrency limit)
      const personaPromises = fullConfig.priorityPersonas.map(async (personaId) => {
        const success = await warmPersonaBundle(personaId);
        if (success) {
          personasWarmed++;
          behaviorsWarmed++;
        }
        return success;
      });

      // Execute with concurrency limit
      const batchSize = fullConfig.maxConcurrency;
      for (let i = 0; i < personaPromises.length; i += batchSize) {
        const batch = personaPromises.slice(i, i + batchSize);
        await Promise.all(batch);
      }

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
  let prefetched = 0;

  for (const query of queries) {
    if (!cache.has(query)) {
      try {
        await cache.get(query);
        prefetched++;
      } catch {
        // Silently ignore embedding failures during prefetch
      }
    }
  }

  return prefetched;
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
