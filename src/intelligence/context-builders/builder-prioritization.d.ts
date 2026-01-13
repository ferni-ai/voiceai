/**
 * Builder-Level Prioritization System
 *
 * PERFORMANCE OPTIMIZATION: Extends fast-conditional-loading with builder-level
 * scoring to further reduce the number of builders run per turn.
 *
 * Phase 2 optimization from FUTURE-OPTIMIZATIONS.md:
 * - Impact: 20-30% reduction in context build time
 * - Current: Category-level filtering runs ~20-30 builders per turn
 * - Target: Builder-level prioritization runs ~10-15 builders per turn
 *
 * How it works:
 * 1. After category filtering, score each builder by intent/topic relevance
 * 2. Skip builders with low relevance scores (below threshold)
 * 3. Always run "core" builders that are universally needed
 *
 * @module intelligence/context-builders/builder-prioritization
 */
import type { ContextBuilder, ContextBuilderInput } from './index.js';
export interface BuilderRelevanceScore {
    builderName: string;
    score: number;
    reason: string;
    isCore: boolean;
}
export interface PrioritizationResult {
    selectedBuilders: ContextBuilder[];
    skippedBuilders: string[];
    totalScored: number;
    avgRelevanceScore: number;
    coreBuilderCount: number;
}
export interface PrioritizationConfig {
    /** Minimum relevance score to run a builder (0-1) */
    relevanceThreshold: number;
    /** If true, log detailed prioritization decisions */
    debug: boolean;
    /** If true, skip prioritization and run all builders */
    disabled: boolean;
}
export declare function setPrioritizationConfig(newConfig: Partial<PrioritizationConfig>): void;
export declare function getPrioritizationConfig(): PrioritizationConfig;
/**
 * Prioritize builders based on relevance to current context.
 *
 * This function takes the builders already filtered by category and further
 * filters them by intent/topic relevance scoring.
 *
 * @param builders - Builders already filtered by category
 * @param input - Current context input
 * @returns Prioritization result with selected builders
 */
export declare function prioritizeBuilders(builders: ContextBuilder[], input: ContextBuilderInput): PrioritizationResult;
interface PrioritizationMetrics {
    totalRuns: number;
    totalBuildersScored: number;
    totalBuildersSkipped: number;
    avgBuildersPerTurn: number;
    avgSkipRate: number;
    avgRelevanceScore: number;
}
/**
 * Record a prioritization result for metrics tracking.
 */
export declare function recordPrioritizationResult(result: PrioritizationResult): void;
/**
 * Get prioritization metrics.
 */
export declare function getPrioritizationMetrics(): PrioritizationMetrics;
/**
 * Reset prioritization metrics (for testing).
 */
export declare function resetPrioritizationMetrics(): void;
declare const _default: {
    prioritizeBuilders: typeof prioritizeBuilders;
    recordPrioritizationResult: typeof recordPrioritizationResult;
    getPrioritizationMetrics: typeof getPrioritizationMetrics;
    resetPrioritizationMetrics: typeof resetPrioritizationMetrics;
    setPrioritizationConfig: typeof setPrioritizationConfig;
    getPrioritizationConfig: typeof getPrioritizationConfig;
    CORE_BUILDERS: Set<string>;
};
export default _default;
//# sourceMappingURL=builder-prioritization.d.ts.map