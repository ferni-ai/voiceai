/**
 * Cache Warming for Intelligent Routing
 *
 * Pre-loads and caches components to minimize cold-start latency:
 * - Intent classifier patterns (regex compilation)
 * - Bandit optimizer arms (from Firestore)
 * - LLM provider connections (keepalive)
 * - Embedding cache for semantic router
 * - User preferences (per-user cache)
 *
 * @module semantic-router/advanced/intelligent/cache-warming
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getIntentClassifier } from './intent-classifier.js';
import { getBanditOptimizer } from './bandit-optimizer.js';
import { getIntelligentOrchestrator } from './orchestrator.js';
import { FERNI_INTENTS } from './ferni-intents.js';
import { EXTENDED_INTENTS } from './extended-intents.js';
import { createFirestorePersistence, loadUserPreferences } from './bandit-persistence.js';
import { createProviderFromEnv } from './llm-providers.js';

const log = createLogger({ module: 'intelligent-cache-warming' });

// ============================================================================
// TYPES
// ============================================================================

export interface WarmupConfig {
  /** Warm intent classifier with all patterns */
  warmIntentClassifier?: boolean;
  /** Load bandit arms from Firestore */
  warmBanditOptimizer?: boolean;
  /** Pre-test LLM provider connection */
  warmLLMProvider?: boolean;
  /** Pre-load user preferences for specific users */
  userIds?: string[];
  /** Initialize semantic router embeddings */
  warmSemanticRouter?: boolean;
  /** Run sample queries to warm JIT */
  warmWithSampleQueries?: boolean;
}

export interface WarmupResult {
  success: boolean;
  timings: {
    intentClassifierMs: number;
    banditOptimizerMs: number;
    llmProviderMs: number;
    userPreferencesMs: number;
    semanticRouterMs: number;
    sampleQueriesMs: number;
    totalMs: number;
  };
  errors: string[];
  stats: {
    intentsLoaded: number;
    banditArmsLoaded: number;
    usersPreloaded: number;
  };
}

// ============================================================================
// SAMPLE QUERIES FOR JIT WARMING
// ============================================================================

const SAMPLE_QUERIES = [
  // High-frequency patterns
  'play some music',
  'talk to maya',
  'what is the weather',
  'set a reminder',
  'hello',
  // Medium complexity
  'I just finished my workout',
  'schedule a meeting tomorrow',
  'play something relaxing',
  // Edge cases
  'help',
  'thanks',
];

// ============================================================================
// WARMUP FUNCTIONS
// ============================================================================

/**
 * Warm the intent classifier by registering all intents
 */
async function warmIntentClassifier(): Promise<{ intentsLoaded: number; timeMs: number }> {
  const start = performance.now();

  const classifier = getIntentClassifier();

  // Register all Ferni intents
  classifier.registerIntents(FERNI_INTENTS);

  // Register extended intents
  classifier.registerIntents(EXTENDED_INTENTS);

  // Force pattern compilation by doing a sample classification
  classifier.classify('warm up query');

  const timeMs = performance.now() - start;
  const intentsLoaded = FERNI_INTENTS.length + EXTENDED_INTENTS.length;

  log.info({ intentsLoaded, timeMs }, 'Intent classifier warmed');

  return { intentsLoaded, timeMs };
}

/**
 * Warm the bandit optimizer by loading arms from persistence
 */
async function warmBanditOptimizer(): Promise<{ armsLoaded: number; timeMs: number }> {
  const start = performance.now();

  const bandit = getBanditOptimizer();

  // Try to load from Firestore
  let armsLoaded = 0;
  try {
    const persistence = await createFirestorePersistence();
    if (persistence) {
      const arms = await persistence.load();
      if (arms.size > 0) {
        // Initialize with loaded arms by converting to tool IDs
        const toolIds = Array.from(arms.keys());
        await bandit.initialize(toolIds);
        armsLoaded = arms.size;
      }
    }
  } catch (error) {
    log.warn({ error }, 'Failed to load bandit arms from Firestore');
  }

  // If no arms loaded, initialize with default tools
  if (armsLoaded === 0) {
    const defaultTools = [
      'spotify_play',
      'spotify_pause',
      'spotify_skip',
      'weather_check',
      'reminder_set',
      'calendar_check',
      'handoff_maya',
      'handoff_peter',
      'handoff_alex',
      'handoff_jordan',
      'handoff_nayan',
      'habit_log',
    ];
    await bandit.initialize(defaultTools);
    armsLoaded = defaultTools.length;
  }

  const timeMs = performance.now() - start;
  log.info({ armsLoaded, timeMs }, 'Bandit optimizer warmed');

  return { armsLoaded, timeMs };
}

/**
 * Warm LLM provider by testing connection
 */
async function warmLLMProvider(): Promise<{ success: boolean; timeMs: number }> {
  const start = performance.now();

  const provider = createProviderFromEnv();
  let success = false;

  if (provider) {
    try {
      // Simple test call to verify connection
      const result = await provider.selectTool('test warmup', [
        { toolId: 'test', name: 'Test', description: 'Test tool', confidence: 1 },
      ]);
      success = result.selectedToolId !== null || result.reasoning.length > 0;
    } catch (error) {
      log.warn({ error }, 'LLM provider warmup failed');
    }
  }

  const timeMs = performance.now() - start;
  log.info({ success, timeMs }, 'LLM provider warmed');

  return { success, timeMs };
}

/**
 * Preload user preferences for specified users
 */
async function warmUserPreferences(
  userIds: string[]
): Promise<{ usersLoaded: number; timeMs: number }> {
  const start = performance.now();

  let usersLoaded = 0;
  for (const userId of userIds) {
    try {
      const prefs = await loadUserPreferences(userId);
      if (prefs) {
        usersLoaded++;
      }
    } catch (error) {
      log.warn({ error, userId }, 'Failed to load user preferences');
    }
  }

  const timeMs = performance.now() - start;
  log.info({ usersLoaded, timeMs }, 'User preferences warmed');

  return { usersLoaded, timeMs };
}

/**
 * Warm semantic router embeddings
 */
async function warmSemanticRouter(): Promise<{ success: boolean; timeMs: number }> {
  const start = performance.now();

  let success = false;
  try {
    // Use the AdvancedSemanticRouter which has initialization
    const { getAdvancedRouter } = await import('../../index.js');
    const router = getAdvancedRouter();
    // Trigger initialization by calling with a sample query
    await router.route('warmup query', {
      userId: 'warmup',
      sessionId: 'warmup',
      personaId: 'ferni',
    });
    success = true;
  } catch (error) {
    log.warn({ error }, 'Semantic router warmup failed');
  }

  const timeMs = performance.now() - start;
  log.info({ success, timeMs }, 'Semantic router warmed');

  return { success, timeMs };
}

/**
 * Run sample queries to warm JIT compiler
 */
async function warmWithSampleQueries(): Promise<{ queriesRun: number; timeMs: number }> {
  const start = performance.now();

  const classifier = getIntentClassifier();
  let queriesRun = 0;

  for (const query of SAMPLE_QUERIES) {
    try {
      classifier.classify(query);
      queriesRun++;
    } catch {
      // Ignore errors during warmup
    }
  }

  const timeMs = performance.now() - start;
  log.info({ queriesRun, timeMs }, 'Sample queries warmed');

  return { queriesRun, timeMs };
}

// ============================================================================
// MAIN WARMUP FUNCTION
// ============================================================================

/**
 * Warm all intelligent routing caches
 *
 * @example
 * ```typescript
 * // Full warmup on server start
 * const result = await warmIntelligentRouting({
 *   warmIntentClassifier: true,
 *   warmBanditOptimizer: true,
 *   warmLLMProvider: true,
 *   warmSemanticRouter: true,
 *   warmWithSampleQueries: true,
 * });
 *
 * console.log(`Warmed in ${result.timings.totalMs}ms`);
 * ```
 */
export async function warmIntelligentRouting(config: WarmupConfig = {}): Promise<WarmupResult> {
  const totalStart = performance.now();
  const errors: string[] = [];

  const timings = {
    intentClassifierMs: 0,
    banditOptimizerMs: 0,
    llmProviderMs: 0,
    userPreferencesMs: 0,
    semanticRouterMs: 0,
    sampleQueriesMs: 0,
    totalMs: 0,
  };

  const stats = {
    intentsLoaded: 0,
    banditArmsLoaded: 0,
    usersPreloaded: 0,
  };

  log.info({ config }, 'Starting intelligent routing warmup');

  // Run warmups in parallel where possible
  const warmupTasks: Promise<void>[] = [];

  // Intent classifier (fast, local)
  if (config.warmIntentClassifier !== false) {
    warmupTasks.push(
      warmIntentClassifier()
        .then((result) => {
          timings.intentClassifierMs = result.timeMs;
          stats.intentsLoaded = result.intentsLoaded;
        })
        .catch((e) => {
          errors.push(`Intent classifier: ${e}`);
        })
    );
  }

  // Bandit optimizer (may hit Firestore)
  if (config.warmBanditOptimizer !== false) {
    warmupTasks.push(
      warmBanditOptimizer()
        .then((result) => {
          timings.banditOptimizerMs = result.timeMs;
          stats.banditArmsLoaded = result.armsLoaded;
        })
        .catch((e) => {
          errors.push(`Bandit optimizer: ${e}`);
        })
    );
  }

  // Wait for parallel tasks
  await Promise.all(warmupTasks);

  // Sequential tasks (depend on earlier warmups)

  // LLM provider (network call)
  if (config.warmLLMProvider) {
    try {
      const result = await warmLLMProvider();
      timings.llmProviderMs = result.timeMs;
      if (!result.success) {
        errors.push('LLM provider connection test failed');
      }
    } catch (e) {
      errors.push(`LLM provider: ${e}`);
    }
  }

  // User preferences
  if (config.userIds && config.userIds.length > 0) {
    try {
      const result = await warmUserPreferences(config.userIds);
      timings.userPreferencesMs = result.timeMs;
      stats.usersPreloaded = result.usersLoaded;
    } catch (e) {
      errors.push(`User preferences: ${e}`);
    }
  }

  // Semantic router
  if (config.warmSemanticRouter) {
    try {
      const result = await warmSemanticRouter();
      timings.semanticRouterMs = result.timeMs;
      if (!result.success) {
        errors.push('Semantic router initialization failed');
      }
    } catch (e) {
      errors.push(`Semantic router: ${e}`);
    }
  }

  // Sample queries (run last to warm JIT)
  if (config.warmWithSampleQueries) {
    try {
      const result = await warmWithSampleQueries();
      timings.sampleQueriesMs = result.timeMs;
    } catch (e) {
      errors.push(`Sample queries: ${e}`);
    }
  }

  timings.totalMs = performance.now() - totalStart;

  const success = errors.length === 0;

  log.info(
    {
      success,
      totalMs: timings.totalMs,
      intentsLoaded: stats.intentsLoaded,
      banditArmsLoaded: stats.banditArmsLoaded,
      errorCount: errors.length,
    },
    'Intelligent routing warmup complete'
  );

  return {
    success,
    timings,
    errors,
    stats,
  };
}

/**
 * Quick warmup for essential components only
 * Use this for fast startup when full warmup is too slow
 */
export async function quickWarmup(): Promise<WarmupResult> {
  return warmIntelligentRouting({
    warmIntentClassifier: true,
    warmBanditOptimizer: false, // Skip Firestore
    warmLLMProvider: false, // Skip network
    warmSemanticRouter: false, // Skip embeddings
    warmWithSampleQueries: true, // Warm JIT
  });
}

/**
 * Full warmup for production
 */
export async function fullWarmup(activeUserIds?: string[]): Promise<WarmupResult> {
  return warmIntelligentRouting({
    warmIntentClassifier: true,
    warmBanditOptimizer: true,
    warmLLMProvider: true,
    warmSemanticRouter: true,
    warmWithSampleQueries: true,
    userIds: activeUserIds,
  });
}

// ============================================================================
// PERIODIC REFRESH
// ============================================================================

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic cache refresh
 */
export function startPeriodicRefresh(intervalMs: number = 5 * 60 * 1000): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(async () => {
    try {
      // Refresh bandit arms (learns new patterns)
      await warmBanditOptimizer();
      log.debug('Periodic cache refresh complete');
    } catch (error) {
      log.warn({ error }, 'Periodic cache refresh failed');
    }
  }, intervalMs);

  log.info({ intervalMs }, 'Started periodic cache refresh');
}

/**
 * Stop periodic cache refresh
 */
export function stopPeriodicRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    log.info('Stopped periodic cache refresh');
  }
}
