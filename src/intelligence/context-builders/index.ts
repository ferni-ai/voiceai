/**
 * Context Builder Orchestrator (LEGACY)
 *
 * ⚠️  PREFER the new behavioral system in `./behavioral/integration.js`
 *
 * The behavioral system prevents context leakage by separating concerns:
 * - Behavioral signals (HOW to respond) - can't leak
 * - Awareness facts (WHAT to know) - meant to be used
 * - Tool guidance (WHEN to query) - on-demand data
 *
 * This legacy module is kept for backward compatibility with existing tests
 * and code that hasn't migrated yet.
 *
 * Features (legacy):
 * - 70+ context builders organized by category
 * - Metrics tracking for performance monitoring
 * - Validation and error handling
 * - Dependency resolution between builders
 * - High-emotion mode for focused support
 *
 * @module intelligence/context-builders
 * @deprecated Use `./behavioral/integration.js` for new code
 */

import { createLogger } from '../../utils/safe-logger.js';
import { DISTRESS } from '../distress-levels.js';

// Import types for local use in this module
import type {
  ConversationAnalysis,
  ContextBuilder,
  ContextBuilderInput,
  ContextInjection,
  ContextPriority,
} from './core/types.js';
import { BUILDER_CATEGORIES, getBuilderCategory, type BuilderCategory } from './core/categories.js';

const log = createLogger({ module: 'context-builders' });

// ============================================================================
// CONTEXT OUTPUT CACHE
// ============================================================================

interface ContextOutputCacheEntry {
  injections: ContextInjection[];
  createdAt: number;
  accessedAt: number;
  inputHash: string;
}

const contextOutputCache = new Map<string, ContextOutputCacheEntry>();

const contextCacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

/**
 * Get context output cache statistics
 */
export function getContextOutputCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
} {
  const total = contextCacheStats.hits + contextCacheStats.misses;
  return {
    size: contextOutputCache.size,
    hits: contextCacheStats.hits,
    misses: contextCacheStats.misses,
    evictions: contextCacheStats.evictions,
    hitRate: total > 0 ? contextCacheStats.hits / total : 0,
  };
}

/**
 * Clear context output cache (for testing)
 */
export function clearContextOutputCache(): void {
  contextOutputCache.clear();
  contextCacheStats.hits = 0;
  contextCacheStats.misses = 0;
  contextCacheStats.evictions = 0;
}

// ============================================================================
// TYPES - Re-exported from types.ts (single source of truth)
// ============================================================================

// All context builder types are defined in types.ts and re-exported here
// for backward compatibility. See types.ts for documentation.
export type {
  ConversationAnalysis,
  ConversationStateAnalysis,
  ContextBuilder,
  ContextBuilderInput,
  ContextBuilderMetrics,
  ContextInjection,
  ContextPriority,
  ContextUserData,
  EmotionAnalysis,
  EmotionValence,
  ExtractedDetail,
  IntentAnalysis,
  SessionRecoveryState,
  SessionServices,
  TopicsAnalysis,
  VoiceEmotionResult,
  PersonaConfig,
  UserProfile,
} from './core/types.js';

// Re-export categories and metrics
export {
  BUILDER_CATEGORIES,
  BuilderCategory,
  getBuilderCategory,
  getBuildersInCategory,
  getCategoryMetadata,
  validateBuilderPriorities,
} from './core/categories.js';

export {
  checkPerformanceIssues,
  getAllBuilderMetrics,
  getBuilderMetrics,
  getMetricsSummary,
  getRecentTurnMetrics,
} from './metrics.js';

// ============================================================================
// REGISTRY WITH INDEXING
// ============================================================================

const builders = new Map<string, ContextBuilder>();

/** Pre-computed index of builders by category for O(1) lookup */
const buildersByCategory = new Map<BuilderCategory, Set<string>>();

/** Cached sorted array of all builders (invalidated on registration) */
let sortedBuildersCache: ContextBuilder[] | null = null;

/** Cached sorted arrays by category (invalidated on registration) */
const sortedByCategoryCache = new Map<BuilderCategory, ContextBuilder[]>();

/** Track duplicate registration attempts */
const registrationWarnings = new Set<string>();

/**
 * Invalidate all caches (called when builders change)
 */
function invalidateCaches(): void {
  sortedBuildersCache = null;
  sortedByCategoryCache.clear();
}

/**
 * Register a context builder.
 *
 * Supports two call signatures for backward compatibility:
 * 1. registerContextBuilder(builder: ContextBuilder) - new style
 * 2. registerContextBuilder(name: string, buildFn: Function) - legacy style
 *
 * @param builderOrName - Either a ContextBuilder object or the builder name (legacy)
 * @param buildFn - Build function (only for legacy style)
 */
export function registerContextBuilder(
  builderOrName: ContextBuilder | string,
  buildFn?: (input: ContextBuilderInput) => Promise<ContextInjection[]> | ContextInjection[]
): void {
  let builder: ContextBuilder;

  if (typeof builderOrName === 'string') {
    // Legacy call: registerContextBuilder('name', buildFn)
    if (!buildFn) {
      throw new Error(`registerContextBuilder('${builderOrName}') called without a build function`);
    }
    builder = {
      name: builderOrName,
      description: `Context builder: ${builderOrName}`,
      priority: 50, // Default priority
      category: getBuilderCategory(builderOrName),
      build: async (input) => {
        const result = buildFn(input);
        return result instanceof Promise ? result : Promise.resolve(result);
      },
    };
  } else {
    builder = {
      ...builderOrName,
      category: builderOrName.category || getBuilderCategory(builderOrName.name),
    };
  }

  // Validation: warn on duplicate registration
  if (builders.has(builder.name) && !registrationWarnings.has(builder.name)) {
    log.warn({ builder: builder.name }, 'Builder already registered, overwriting');
    registrationWarnings.add(builder.name);
  }

  // Validation: check dependencies exist (deferred check)
  if (builder.dependsOn) {
    for (const dep of builder.dependsOn) {
      if (!builders.has(dep) && !BUILDER_CATEGORIES[dep]) {
        log.debug(
          { builder: builder.name, dependency: dep },
          'Builder depends on unregistered builder (may load later)'
        );
      }
    }
  }

  // Remove from old category index if overwriting
  if (builders.has(builder.name)) {
    const oldBuilder = builders.get(builder.name)!;
    const oldCategory = oldBuilder.category || getBuilderCategory(oldBuilder.name);
    const oldCategorySet = buildersByCategory.get(oldCategory);
    if (oldCategorySet) {
      oldCategorySet.delete(builder.name);
    }
  }

  // Add to builders map
  builders.set(builder.name, builder);

  // Add to category index
  const category = builder.category || getBuilderCategory(builder.name);
  if (!buildersByCategory.has(category)) {
    buildersByCategory.set(category, new Set());
  }
  buildersByCategory.get(category)!.add(builder.name);

  // Invalidate caches
  invalidateCaches();

  log.debug(
    { builder: builder.name, priority: builder.priority, category },
    'Registered context builder'
  );
}

/**
 * Get all registered builders, sorted by priority (highest first)
 * Uses cached sorted array for O(1) repeated access
 */
export function getRegisteredBuilders(): ContextBuilder[] {
  if (sortedBuildersCache) {
    return sortedBuildersCache;
  }

  sortedBuildersCache = Array.from(builders.values()).sort((a, b) => b.priority - a.priority);
  return sortedBuildersCache;
}

/**
 * Get builders by category using pre-computed index
 * O(k) where k = builders in category, instead of O(n) filtering all builders
 */
export function getBuildersByCategory(category: BuilderCategory): ContextBuilder[] {
  // Check cache first
  const cached = sortedByCategoryCache.get(category);
  if (cached) {
    return cached;
  }

  // Use index for O(1) lookup of builder names in category
  const builderNames = buildersByCategory.get(category);
  if (!builderNames || builderNames.size === 0) {
    return [];
  }

  // Build sorted array from index
  const result: ContextBuilder[] = [];
  for (const name of builderNames) {
    const builder = builders.get(name);
    if (builder) {
      result.push(builder);
    }
  }

  result.sort((a, b) => b.priority - a.priority);

  // Cache the result
  sortedByCategoryCache.set(category, result);

  return result;
}

/**
 * Check if a builder is registered
 */
export function isBuilderRegistered(name: string): boolean {
  return builders.has(name);
}

/**
 * Get builder count
 */
export function getBuilderCount(): number {
  return builders.size;
}

/**
 * Get registry statistics for monitoring
 */
export function getRegistryStats(): {
  totalBuilders: number;
  byCategory: Record<string, number>;
  cacheStatus: { sortedAll: boolean; sortedByCategory: number };
} {
  const byCategory: Record<string, number> = {};
  for (const [category, names] of buildersByCategory.entries()) {
    byCategory[category] = names.size;
  }

  return {
    totalBuilders: builders.size,
    byCategory,
    cacheStatus: {
      sortedAll: sortedBuildersCache !== null,
      sortedByCategory: sortedByCategoryCache.size,
    },
  };
}

// ============================================================================
// INJECTION HELPERS
// ============================================================================

let counter = 0;

export function createInjection(
  source: string,
  content: string,
  priority: ContextPriority,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return {
    id: `${source}_${++counter}`,
    source,
    content,
    priority,
    category: options?.category,
    confidence: options?.confidence ?? 1.0,
  };
}

export function createCriticalInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'critical', options);
}

/**
 * BETTER-THAN-HUMAN: High priority for important trust signals
 * Use this for emotional mismatch detection and similar "superhuman" insights
 */
export function createHighInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'high', options);
}

export function createStandardInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'standard', options);
}

export function createHintInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'hint', options);
}

// ============================================================================
// FORMATTING
// ============================================================================

const PRIORITY_ORDER: Record<ContextPriority, number> = {
  critical: 4,
  high: 3,
  standard: 2,
  hint: 1,
};

/**
 * @deprecated Use `buildIntegratedContext` from `./behavioral/integration.js` instead.
 *
 * The new behavioral system produces pre-formatted output that doesn't need
 * this formatting step and is resistant to context leakage.
 *
 * Format context injections for the LLM prompt
 *
 * BETTER-THAN-HUMAN: In high-emotion moments, we reduce noise by filtering out
 * lower-priority context. This helps the AI focus on what matters most.
 */
export function formatContextForPrompt(
  injections: ContextInjection[],
  options?: {
    maxLength?: number;
    includeHints?: boolean;
    /** BETTER-THAN-HUMAN: If true, only include critical/high priority context */
    highEmotionMode?: boolean;
  }
): string {
  const maxLength = options?.maxLength ?? 4000;
  const includeHints = options?.includeHints ?? true;
  const highEmotionMode = options?.highEmotionMode ?? false;

  // BETTER-THAN-HUMAN: In high emotion mode, filter aggressively
  // Only keep critical and high priority context
  let filtered: ContextInjection[];
  if (highEmotionMode) {
    filtered = injections.filter((i) => i.priority === 'critical' || i.priority === 'high');
  } else {
    filtered = injections.filter((i) => includeHints || i.priority !== 'hint');
  }

  filtered.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);

  const sections: string[] = [];
  let currentLength = 0;

  for (const injection of filtered) {
    const section = injection.content.trim();
    if (currentLength + section.length + 2 > maxLength) {
      if (injection.priority === 'hint') continue;
      break;
    }
    sections.push(section);
    currentLength += section.length + 2;
  }

  return sections.join('\n\n');
}

/**
 * @deprecated High emotion mode is now handled internally by `buildIntegratedContext`.
 *
 * BETTER-THAN-HUMAN: Determine if we should use high-emotion mode
 *
 * High emotion mode reduces context noise when the user needs focused support.
 * Uses centralized DISTRESS constants for consistent thresholds.
 */
export function shouldUseHighEmotionMode(analysis: ConversationAnalysis): boolean {
  // High emotion mode triggers:
  // 1. User needs support
  // 2. High distress level (>= DISTRESS.HIGH)
  // 3. High emotion intensity (> 0.8)
  // 4. Mental health signals detected
  return Boolean(
    analysis.emotion.needsSupport ||
    (analysis.emotion.distressLevel && analysis.emotion.distressLevel >= DISTRESS.HIGH) ||
    analysis.emotion.intensity > 0.8 ||
    (analysis.emotion.mentalHealthSignals && analysis.emotion.mentalHealthSignals.length > 0)
  );
}

// Re-export builder prioritization functions for observability
export {
  getPrioritizationMetrics,
  getPrioritizationConfig,
  setPrioritizationConfig,
  resetPrioritizationMetrics,
} from './builder-prioritization.js';

// ============================================================================
// CONVERSATION HUMANIZING CONTEXT BUILDER
// ============================================================================
// Export for direct use in voice-agent.ts

export {
  buildConversationHumanizingContext,
  formatConversationHumanizingForPrompt,
  getHumanizingSummary as getConversationHumanizingSummary,
} from './humanization/conversation-humanizing.js';

// ============================================================================
// RNG UTILITIES FOR DETERMINISTIC BEHAVIOR
// ============================================================================

export { createBuilderRng, createSimpleRng, type BuilderRng } from './core/rng-utils.js';

// ============================================================================
// SESSION CLEANUP (Memory Leak Prevention)
// ============================================================================

/**
 * Clear all session-scoped state from context builders.
 * Call this when a session ends to prevent memory leaks.
 */
export async function cleanupContextBuilderSession(sessionId: string): Promise<void> {
  // Clear the context output cache for this session
  // (Keys are prefixed with sessionId)
  for (const key of contextOutputCache.keys()) {
    if (key.startsWith(sessionId)) {
      contextOutputCache.delete(key);
    }
  }

  // Clear deep understanding session state
  try {
    const { clearDeepUnderstandingSession } = await import('./intelligence/deep-understanding.js');
    clearDeepUnderstandingSession(sessionId);
  } catch {
    /* module not loaded */
  }

  // Clear conversational superpowers session state
  try {
    const { clearSuperpowersSession } = await import('./superhuman/conversational-superpowers.js');
    clearSuperpowersSession(sessionId);
  } catch {
    /* module not loaded */
  }

  // Clear superhuman insights session state
  try {
    const { clearSuperhumanInsightsSession } = await import('./superhuman/superhuman-insights.js');
    clearSuperhumanInsightsSession(sessionId);
  } catch {
    /* module not loaded */
  }

  // Clear memory lane session state
  try {
    const { clearMemoryLaneSession } = await import('./superhuman/memory-lane-context.js');
    clearMemoryLaneSession(sessionId);
  } catch {
    /* module not loaded */
  }

  log.debug({ sessionId }, '🧹 Context builder session state cleared');
}

/**
 * Clear ALL session state from context builders (for shutdown).
 */
export async function cleanupAllContextBuilderSessions(): Promise<void> {
  // Clear entire context output cache
  contextOutputCache.clear();

  // Clear all deep understanding sessions
  try {
    const { clearAllDeepUnderstandingSessions } =
      await import('./intelligence/deep-understanding.js');
    clearAllDeepUnderstandingSessions();
  } catch {
    /* module not loaded */
  }

  // Clear all conversational superpowers sessions
  try {
    const { clearAllSuperpowersSessions } =
      await import('./superhuman/conversational-superpowers.js');
    clearAllSuperpowersSessions();
  } catch {
    /* module not loaded */
  }

  // Clear all superhuman insights sessions
  try {
    const { clearAllSuperhumanInsightsSessions } =
      await import('./superhuman/superhuman-insights.js');
    clearAllSuperhumanInsightsSessions();
  } catch {
    /* module not loaded */
  }

  // Clear all memory lane sessions
  try {
    const { clearAllMemoryLaneSessions } = await import('./superhuman/memory-lane-context.js');
    clearAllMemoryLaneSessions();
  } catch {
    /* module not loaded */
  }

  log.info('🧹 All context builder session state cleared');
}
