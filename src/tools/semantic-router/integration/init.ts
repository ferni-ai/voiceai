/**
 * Semantic Router Initialization
 *
 * Initializes the semantic router with all tool definitions.
 * Call this once at application startup.
 *
 * @module tools/semantic-router/integration/init
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import {
  initializeFirestorePersistence,
  isPersistenceAvailable,
  initializeToolEmbeddingIndex,
  getToolEmbeddingIndex,
} from '../persistence/index.js';
import {
  initializePersonalization,
  flushPersonalizationProfiles,
} from '../advanced/personalization.js';
import { initializeCorrectionStore, flushDirtyProfiles } from '../learning/correction-store.js';
import { initializeCache } from './redis-cache.js';

const log = createLogger({ module: 'semantic-router:init' });

// Track initialization state
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the semantic router with all tool definitions.
 *
 * This function:
 * 1. Registers all semantic tool definitions
 * 2. Pre-warms the embedding cache (if enabled)
 * 3. Logs initialization metrics
 *
 * Safe to call multiple times - will only initialize once.
 */
export async function initializeSemanticRouter(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (initPromise) {
    return initPromise;
  }

  // Already initialized
  if (initialized) {
    return;
  }

  initPromise = doInitialize();
  await initPromise;
}

async function doInitialize(): Promise<void> {
  const startTime = performance.now();

  try {
    log.info('Initializing semantic router...');

    // Initialize caching layer (Redis + in-memory)
    try {
      await initializeCache();
      log.info('Redis/memory cache initialized for semantic router');
    } catch (cacheError) {
      log.warn({ error: String(cacheError) }, 'Redis init failed - using memory cache only');
    }

    // Initialize persistence layer
    try {
      await initializeFirestorePersistence();
      if (isPersistenceAvailable()) {
        log.info('Firestore persistence enabled for semantic router');

        // Initialize learning subsystems with persistence
        await Promise.all([initializePersonalization(), initializeCorrectionStore()]);
        log.info('Learning subsystems initialized with persistence');
      } else {
        log.info('Semantic router using in-memory storage (no Firestore)');
      }
    } catch (persistError) {
      log.warn({ error: String(persistError) }, 'Persistence init failed - using in-memory');
    }

    // Initialize tool embedding index
    try {
      await initializeToolEmbeddingIndex();
      log.info('Tool embedding index service initialized');
    } catch (indexError) {
      log.warn({ error: String(indexError) }, 'Tool embedding index init failed - computing fresh');
    }

    const registry = getToolRegistry();

    // Register all built-in tool definitions
    log.info({ count: allToolDefinitions.length }, 'Registering tool definitions');
    registry.registerMany(allToolDefinitions);

    // Log registered tools
    const registeredTools = registry.getAll();
    const byCategory = new Map<string, number>();
    for (const tool of registeredTools) {
      byCategory.set(tool.category, (byCategory.get(tool.category) || 0) + 1);
    }

    const categoryBreakdown: Record<string, number> = {};
    byCategory.forEach((count, category) => {
      categoryBreakdown[category] = count;
    });

    // Pre-load tool embeddings from index (if available)
    // This happens in the background to not block startup
    void loadToolEmbeddingsFromIndex(registeredTools);

    // Pre-warm cache with common queries (fire-and-forget)
    void warmCache();

    const elapsedMs = Math.round(performance.now() - startTime);

    log.info(
      {
        totalTools: registeredTools.length,
        categoryBreakdown,
        elapsedMs,
      },
      'Semantic router initialized'
    );

    initialized = true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize semantic router');
    throw error;
  } finally {
    initPromise = null;
  }
}

/**
 * Load pre-computed tool embeddings from the index.
 * Falls back to computing fresh if not available.
 */
async function loadToolEmbeddingsFromIndex(
  tools: import('../types.js').SemanticToolDefinition[]
): Promise<void> {
  try {
    const indexService = getToolEmbeddingIndex();
    const registry = getToolRegistry();

    // Batch load all embeddings (checks cache → Firestore → computes)
    const embeddings = await indexService.batchGetToolEmbeddings(tools);

    // Apply embeddings to registry
    for (const [toolId, emb] of embeddings) {
      const registered = registry.getRegistered(toolId);
      if (registered) {
        registered.descriptionEmbedding = emb.description;
        registered.exampleEmbeddings = emb.examples;
      }
    }

    const stats = indexService.getStats();
    log.info(
      {
        total: stats.totalTools,
        cacheHits: stats.cacheHits,
        firestoreLoads: stats.firestoreLoads,
        computed: stats.computedFresh,
      },
      'Tool embeddings loaded from index'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load tool embeddings from index');
  }
}

/**
 * Pre-warm the embedding cache with common queries.
 * This runs in the background after initialization.
 */
async function warmCache(): Promise<void> {
  const commonQueries = [
    // Music queries
    'play some music',
    'play jazz',
    'pause',
    'next song',
    'skip',
    'stop the music',
    // Handoff queries
    'talk to Maya',
    'I need help with habits',
    'can you transfer me',
    // Information queries
    "what's the weather",
    'get me some news',
    'what time is it',
    // Common conversation starters
    'how are you',
    'I need help',
    'I want to talk',
  ];

  try {
    log.info({ queryCount: commonQueries.length }, 'Pre-warming embedding cache');

    const { routeUserInput, mightNeedTool } = await import('../router.js');

    // Pre-check which queries might need tools (fast)
    for (const query of commonQueries) {
      // Just checking mightNeedTool is very fast and warms keyword cache
      mightNeedTool(query);
    }

    // For a subset, do full routing (slower, warms embedding cache)
    const priorityQueries = commonQueries.slice(0, 5);
    for (const query of priorityQueries) {
      try {
        await routeUserInput(query);
      } catch {
        // Individual failures are okay during warmup
      }
    }

    log.info('Embedding cache pre-warmed');
  } catch (error) {
    // Cache warming failure is non-critical
    log.warn({ error: String(error) }, 'Cache warming failed (non-critical)');
  }
}

/**
 * Check if the semantic router is initialized
 */
export function isSemanticRouterInitialized(): boolean {
  return initialized;
}

/**
 * Reset the semantic router (for testing)
 */
export function resetSemanticRouter(): void {
  const registry = getToolRegistry();
  // Clear all tools - need to add this method to registry
  // For now, we just mark as not initialized
  initialized = false;
  initPromise = null;
  log.info('Semantic router reset');
}

/**
 * Get initialization metrics
 */
export function getInitializationMetrics(): {
  initialized: boolean;
  toolCount: number;
  categories: string[];
} {
  const registry = getToolRegistry();
  const tools = registry.getAll();
  const categories = [...new Set(tools.map((t) => t.category))];

  return {
    initialized,
    toolCount: tools.length,
    categories,
  };
}

/**
 * Graceful shutdown - flush all pending data to Firestore
 * Call this when the application is shutting down
 */
export async function shutdownSemanticRouter(): Promise<void> {
  if (!initialized) return;

  log.info('Shutting down semantic router...');

  try {
    // Flush all pending profile saves
    await Promise.all([flushPersonalizationProfiles(), flushDirtyProfiles()]);

    log.info('Semantic router shutdown complete - all data flushed');
  } catch (error) {
    log.error({ error: String(error) }, 'Error during semantic router shutdown');
  }
}
