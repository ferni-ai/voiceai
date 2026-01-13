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
import type { ConversationAnalysis, ContextBuilder, ContextBuilderInput, ContextInjection, ContextPriority } from './core/types.js';
import { BuilderCategory as BC, type BuilderCategory } from './core/categories.js';
/**
 * Get context output cache statistics
 */
export declare function getContextOutputCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
};
/**
 * Clear context output cache (for testing)
 */
export declare function clearContextOutputCache(): void;
export type { ConversationAnalysis, ConversationStateAnalysis, ContextBuilder, ContextBuilderInput, ContextBuilderMetrics, ContextInjection, ContextPriority, ContextUserData, EmotionAnalysis, EmotionValence, ExtractedDetail, IntentAnalysis, SessionRecoveryState, SessionServices, TopicsAnalysis, VoiceEmotionResult, PersonaConfig, UserProfile, } from './core/types.js';
export { BUILDER_CATEGORIES, BuilderCategory, getBuilderCategory, getBuildersInCategory, getCategoryMetadata, validateBuilderPriorities, } from './core/categories.js';
export { checkPerformanceIssues, getAllBuilderMetrics, getBuilderMetrics, getMetricsSummary, getRecentTurnMetrics, } from './metrics.js';
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
export declare function registerContextBuilder(builderOrName: ContextBuilder | string, buildFn?: (input: ContextBuilderInput) => Promise<ContextInjection[]> | ContextInjection[]): void;
/**
 * Get all registered builders, sorted by priority (highest first)
 * Uses cached sorted array for O(1) repeated access
 */
export declare function getRegisteredBuilders(): ContextBuilder[];
/**
 * Get builders by category using pre-computed index
 * O(k) where k = builders in category, instead of O(n) filtering all builders
 */
export declare function getBuildersByCategory(category: BuilderCategory): ContextBuilder[];
/**
 * Check if a builder is registered
 */
export declare function isBuilderRegistered(name: string): boolean;
/**
 * Get builder count
 */
export declare function getBuilderCount(): number;
/**
 * Get registry statistics for monitoring
 */
export declare function getRegistryStats(): {
    totalBuilders: number;
    byCategory: Record<string, number>;
    cacheStatus: {
        sortedAll: boolean;
        sortedByCategory: number;
    };
};
export declare function createInjection(source: string, content: string, priority: ContextPriority, options?: {
    category?: string;
    confidence?: number;
}): ContextInjection;
export declare function createCriticalInjection(source: string, content: string, options?: {
    category?: string;
    confidence?: number;
}): ContextInjection;
/**
 * BETTER-THAN-HUMAN: High priority for important trust signals
 * Use this for emotional mismatch detection and similar "superhuman" insights
 */
export declare function createHighInjection(source: string, content: string, options?: {
    category?: string;
    confidence?: number;
}): ContextInjection;
export declare function createStandardInjection(source: string, content: string, options?: {
    category?: string;
    confidence?: number;
}): ContextInjection;
export declare function createHintInjection(source: string, content: string, options?: {
    category?: string;
    confidence?: number;
}): ContextInjection;
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
export declare function formatContextForPrompt(injections: ContextInjection[], options?: {
    maxLength?: number;
    includeHints?: boolean;
    /** BETTER-THAN-HUMAN: If true, only include critical/high priority context */
    highEmotionMode?: boolean;
}): string;
/**
 * @deprecated High emotion mode is now handled internally by `buildIntegratedContext`.
 *
 * BETTER-THAN-HUMAN: Determine if we should use high-emotion mode
 *
 * High emotion mode reduces context noise when the user needs focused support.
 * Uses centralized DISTRESS constants for consistent thresholds.
 */
export declare function shouldUseHighEmotionMode(analysis: ConversationAnalysis): boolean;
/**
 * Determine which builder categories should be active for this turn
 *
 * This optimization reduces the number of builders run per turn from 70+ to ~20-30
 * by only running builders relevant to the current context.
 *
 * @param input - The context builder input
 * @returns Array of categories that should be active
 */
export declare function determineActiveCategories(input: ContextBuilderInput): BuilderCategory[];
/**
 * Get builders filtered by active categories
 *
 * @param activeCategories - Categories to include
 * @returns Filtered and sorted builders
 */
export declare function getBuildersByActiveCategories(activeCategories: BC[]): ContextBuilder[];
/**
 * Configuration for conditional builder loading
 */
export interface ConditionalLoadingConfig {
    /** If true, use conditional loading (default: true in production) */
    enabled: boolean;
    /** If true, log which categories are active (default: false) */
    logActiveCategories: boolean;
    /** Override to force specific categories */
    forceCategories?: BC[];
}
/**
 * Update conditional loading configuration
 */
export declare function setConditionalLoadingConfig(config: Partial<ConditionalLoadingConfig>): void;
/**
 * Get current conditional loading configuration
 */
export declare function getConditionalLoadingConfig(): ConditionalLoadingConfig;
/**
 * @deprecated Use `buildIntegratedContext` from `./behavioral/integration.js` instead.
 *
 * This legacy function builds context using the old approach that was prone to
 * context leakage. The new behavioral system separates concerns:
 * - Behavioral signals (HOW to respond) - can't leak
 * - Awareness facts (WHAT to know) - meant to be used
 * - Tool guidance (WHEN to query) - on-demand data
 *
 * Migration:
 * ```typescript
 * // OLD
 * const injections = await buildConversationContext(input);
 * const prompt = formatContextForPrompt(injections);
 *
 * // NEW
 * import { buildIntegratedContext } from './behavioral/integration.js';
 * const result = await buildIntegratedContext(input);
 * // result.behavioralDirective + result.awarenessFacts + result.toolGuidance
 * ```
 *
 * Features:
 * - Output caching with 5-minute TTL
 * - Conditional builder loading (only runs relevant categories)
 * - Parallel execution for performance
 * - Per-builder metrics tracking
 * - Error isolation (one failing builder doesn't break others)
 * - Basic emotional context injection
 */
export declare function buildConversationContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Build context with detailed metrics tracking
 *
 * Returns both the injections and comprehensive metrics including:
 * - Total build time
 * - Per-builder breakdown
 * - Performance warnings
 */
export declare function buildConversationContextWithMetrics(input: ContextBuilderInput): Promise<{
    injections: ContextInjection[];
    metrics: {
        totalDurationMs: number;
        injectionCount: number;
        builderCount: number;
        buildersRan: number;
        buildersProducedInjections: number;
        performanceWarnings: string[];
        conditionalLoadingEnabled: boolean;
    };
}>;
export { areBuildersLoaded, BUILDER_MANIFEST, ensureBuildersLoaded, getAllBuilderModules, getBuilderModulesByCategory, getLastLoadReport, getLoadingStatus, reloadBuilders, type BuilderLoadReport, } from './core/loader.js';
export { getPrioritizationMetrics, getPrioritizationConfig, setPrioritizationConfig, resetPrioritizationMetrics, } from './builder-prioritization.js';
export { buildConversationHumanizingContext, formatConversationHumanizingForPrompt, getHumanizingSummary as getConversationHumanizingSummary, } from './humanization/conversation-humanizing.js';
export { createBuilderRng, createSimpleRng, type BuilderRng } from './core/rng-utils.js';
/**
 * Clear all session-scoped state from context builders.
 * Call this when a session ends to prevent memory leaks.
 */
export declare function cleanupContextBuilderSession(sessionId: string): Promise<void>;
/**
 * Clear ALL session state from context builders (for shutdown).
 */
export declare function cleanupAllContextBuilderSessions(): Promise<void>;
//# sourceMappingURL=index.d.ts.map