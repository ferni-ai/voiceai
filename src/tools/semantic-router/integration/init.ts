/**
 * Semantic Router Initialization
 *
 * Initializes the semantic router with all tool definitions.
 * Call this once at application startup.
 *
 * @module tools/semantic-router/integration/init
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  flushPersonalizationProfiles,
  initializePersonalization,
} from '../advanced/personalization.js';
import { mergeLocaleIntoTools } from '../i18n/index.js';
import { flushDirtyProfiles, initializeCorrectionStore } from '../learning/correction-store.js';
// 🧠 SOTA Online Learning Loop
import {
  initializeOnlineLearning,
  shutdownOnlineLearning,
  getOnlineLearningEngine,
} from '../learning/online-learning-loop.js';
// 🎙️ SOTA Prosody Routing (Real Audio → Routing)
import {
  initializeProsodyRouting,
  shutdownProsodyRouting,
  getProsodyRoutingEngine,
} from '../advanced/prosody-routing-integration.js';
// 🎯 SOTA Dynamic Strategy Selection (Per-User Optimal Cascade)
import {
  initializeDynamicStrategy,
  shutdownDynamicStrategy,
  getDynamicStrategyEngine,
} from '../learning/dynamic-strategy.js';
// 👥 SOTA User Segmentation (Cohort Learning)
import {
  initializeUserSegmentation,
  shutdownUserSegmentation,
  getUserSegmentationEngine,
} from '../learning/user-segmentation.js';
import {
  getToolEmbeddingIndex,
  initializeFirestorePersistence,
  initializeToolEmbeddingIndex,
  isPersistenceAvailable,
} from '../persistence/index.js';
import { getToolRegistry } from '../registry.js';
import { allToolDefinitions, getAvailableToolDefinitions } from '../tool-definitions/index.js';
import { initializeCache } from './redis-cache.js';

// 🧠 Intelligent routing imports
import { enableIntelligentRouting } from '../advanced/intelligent/ab-testing.js';
import {
  startPeriodicRefresh,
  quickWarmup as warmIntelligentRouter,
} from '../advanced/intelligent/cache-warming.js';
import { initializeIntelligentRouter } from './intelligent-router-integration.js';

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

    // CAPABILITY FILTERING: Only register tools whose backing services are configured
    // This prevents hallucination by ensuring we don't route to unavailable tools
    const availableTools = getAvailableToolDefinitions();
    log.info(
      {
        totalDefined: allToolDefinitions.length,
        available: availableTools.length,
        excluded: allToolDefinitions.length - availableTools.length,
      },
      '🔧 Tools filtered by capability availability'
    );

    // IMPORTANT: Merge locale triggers into tool definitions BEFORE registering
    // This adds patterns like "check the weather", "could you play", etc. from en.json
    // Without this, many natural phrases won't match!
    const localizedTools = await mergeLocaleIntoTools(availableTools);
    log.info(
      { baseCount: availableTools.length, mergedCount: localizedTools.length },
      '🌐 Locale triggers merged into tool definitions'
    );

    // Register all built-in tool definitions WITH locale patterns
    registry.registerMany(localizedTools);

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

    // 🧠 Initialize intelligent routing
    // P2 FIX: Rolled out to 100% after E2E Tool Calling Audit (Dec 2024)
    // Previously at 50% for A/B testing, now fully enabled as semantic router primary path
    const enableIntelligent = process.env.ENABLE_INTELLIGENT_ROUTING !== 'false'; // Default: enabled
    const intelligentTrafficPct = parseInt(process.env.INTELLIGENT_ROUTING_TRAFFIC_PCT || '100', 10);

    if (enableIntelligent || intelligentTrafficPct > 0) {
      try {
        log.info({ trafficPct: intelligentTrafficPct }, 'Initializing intelligent routing...');

        await initializeIntelligentRouter({
          enableBanditPersistence: true,
          // Prefer GEMINI_API_KEY for LLM, fallback to GOOGLE_API_KEY
          useGemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        });

        // Warm intelligent router cache
        await warmIntelligentRouter();

        // Enable A/B testing with configured traffic percentage
        if (intelligentTrafficPct > 0) {
          enableIntelligentRouting(intelligentTrafficPct);
          log.info({ trafficPct: intelligentTrafficPct }, 'Intelligent routing A/B test enabled');
        }

        // Start periodic refresh for bandit arms (every 5 minutes)
        startPeriodicRefresh(5 * 60 * 1000);

        log.info('Intelligent routing initialized');
      } catch (intelligentError) {
        log.warn(
          { error: String(intelligentError) },
          'Intelligent routing init failed - using semantic only'
        );
      }
    }

    // 🧠 Initialize Online Learning Loop (SOTA feature)
    // This enables continuous model improvement from corrections
    try {
      const onlineLearningConfig = {
        minExamplesForRetrain: 10,
        autoRetrainInterval: 60 * 60 * 1000, // 1 hour
        learningRate: 0.1,
      };
      initializeOnlineLearning(onlineLearningConfig);
      log.info('Online learning loop initialized - models will retrain from corrections');
    } catch (onlineLearningError) {
      log.warn(
        { error: String(onlineLearningError) },
        'Online learning init failed - static embeddings only'
      );
    }

    // 🎙️ Initialize Prosody Routing (SOTA feature)
    // This enables voice-aware routing decisions based on real audio analysis
    try {
      const prosodyConfig = {
        enabled: process.env.DISABLE_PROSODY_ROUTING !== 'true',
        minConfidenceForBoost: 0.3,
        maxBoostMultiplier: 1.5,
        emergencyThreshold: 0.8,
        learnBaseline: true,
        minSamplesForBaseline: 50,
      };
      initializeProsodyRouting(prosodyConfig);
      log.info('Prosody routing initialized - voice signals will influence tool selection');
    } catch (prosodyError) {
      log.warn(
        { error: String(prosodyError) },
        'Prosody routing init failed - no voice-aware boosting'
      );
    }

    // 🎯 Initialize Dynamic Strategy Selection (SOTA feature)
    // This learns the optimal routing cascade per user
    try {
      const dynamicStrategyConfig = {
        enabled: process.env.DISABLE_DYNAMIC_STRATEGY !== 'true',
        minSamplesForPersonalization: 10,
        explorationRate: 0.1,
        decayFactor: 0.95,
      };
      initializeDynamicStrategy(dynamicStrategyConfig);
      log.info('Dynamic strategy selection initialized - per-user optimal cascade');
    } catch (dynamicStrategyError) {
      log.warn(
        { error: String(dynamicStrategyError) },
        'Dynamic strategy init failed - using default cascade'
      );
    }

    // 👥 Initialize User Segmentation (SOTA feature)
    // This clusters users into cohorts for accelerated personalization
    try {
      const segmentationConfig = {
        enabled: process.env.DISABLE_USER_SEGMENTATION !== 'true',
        minInteractionsForFingerprint: 10,
        numCohorts: 8,
        cohortInheritanceWeight: 0.5,
      };
      initializeUserSegmentation(segmentationConfig);
      log.info('User segmentation initialized - cohort-based learning enabled');
    } catch (segmentationError) {
      log.warn(
        { error: String(segmentationError) },
        'User segmentation init failed - no cohort learning'
      );
    }

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
  tools: Array<import('../types.js').SemanticToolDefinition>
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
  onlineLearning: {
    pendingExamples: number;
    adjustedTools: number;
    lastRetrainTime: number;
  } | null;
  prosodyRouting: {
    enabled: boolean;
    activeSessions: number;
  } | null;
} {
  const registry = getToolRegistry();
  const tools = registry.getAll();
  const categories = [...new Set(tools.map((t) => t.category))];

  // Get online learning stats if available
  let onlineLearningStats = null;
  try {
    const engine = getOnlineLearningEngine();
    const stats = engine.getStats();
    onlineLearningStats = {
      pendingExamples: stats.pendingExamples,
      adjustedTools: stats.adjustedTools,
      lastRetrainTime: stats.lastRetrainTime,
    };
  } catch {
    // Online learning may not be initialized
  }

  // Get prosody routing stats if available
  let prosodyStats = null;
  try {
    const prosodyEngine = getProsodyRoutingEngine();
    prosodyStats = {
      enabled: true,
      activeSessions: 0, // Would need to expose this from the engine
    };
  } catch {
    // Prosody routing may not be initialized
  }

  return {
    initialized,
    toolCount: tools.length,
    categories,
    onlineLearning: onlineLearningStats,
    prosodyRouting: prosodyStats,
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
    // Stop intelligent router periodic refresh
    const { stopPeriodicRefresh } = await import('../advanced/intelligent/cache-warming.js');
    stopPeriodicRefresh();

    // 🧠 Trigger final online learning retrain before shutdown
    // This ensures all pending corrections are processed
    try {
      const engine = getOnlineLearningEngine();
      const stats = engine.getStats();
      if (stats.pendingExamples > 0) {
        log.info({ pendingExamples: stats.pendingExamples }, 'Final retrain before shutdown');
        await engine.triggerRetrain();
      }
      shutdownOnlineLearning();
    } catch (onlineLearningError) {
      log.warn({ error: String(onlineLearningError) }, 'Online learning shutdown failed');
    }

    // 🎙️ Shutdown prosody routing
    try {
      shutdownProsodyRouting();
    } catch (prosodyError) {
      log.warn({ error: String(prosodyError) }, 'Prosody routing shutdown failed');
    }

    // 🎯 Shutdown dynamic strategy
    try {
      shutdownDynamicStrategy();
    } catch (strategyError) {
      log.warn({ error: String(strategyError) }, 'Dynamic strategy shutdown failed');
    }

    // 👥 Shutdown user segmentation
    try {
      shutdownUserSegmentation();
    } catch (segmentationError) {
      log.warn({ error: String(segmentationError) }, 'User segmentation shutdown failed');
    }

    // Flush all pending profile saves
    await Promise.all([flushPersonalizationProfiles(), flushDirtyProfiles()]);

    log.info('Semantic router shutdown complete - all data flushed');
  } catch (error) {
    log.error({ error: String(error) }, 'Error during semantic router shutdown');
  }
}
