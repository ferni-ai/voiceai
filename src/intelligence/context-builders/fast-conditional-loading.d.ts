/**
 * Fast Conditional Builder Loading
 *
 * PERFORMANCE OPTIMIZATION: Aggressively filter context builders to minimize
 * per-turn processing time. This module provides faster category detection
 * and cached decisions.
 *
 * Key optimizations:
 * 1. Fast-path detection for common scenarios
 * 2. Cached decisions within a turn
 * 3. Tiered builder execution (core → conditional → optional)
 * 4. Skip expensive builders when not needed
 *
 * @module intelligence/context-builders/fast-conditional-loading
 */
import { BuilderCategory as BC } from './core/categories.js';
import type { ContextBuilderInput, ContextBuilder } from './index.js';
export interface FastLoadingResult {
    categories: BC[];
    tier: 'minimal' | 'standard' | 'full';
    reason: string;
    skippedCategories: BC[];
    estimatedBuilderCount: number;
}
export interface FastLoadingMetrics {
    totalDecisions: number;
    minimalTierCount: number;
    standardTierCount: number;
    fullTierCount: number;
    avgCategoriesPerTurn: number;
    avgBuildersPerTurn: number;
}
/**
 * Determine active categories using fast-path detection
 *
 * This is optimized for speed:
 * 1. First, determine tier (minimal/standard/full)
 * 2. Then, add/remove specific categories based on context
 */
export declare function fastDetermineActiveCategories(input: ContextBuilderInput): FastLoadingResult;
/**
 * Record a loading decision for metrics
 */
export declare function recordLoadingDecision(result: FastLoadingResult): void;
/**
 * Get fast loading metrics
 */
export declare function getFastLoadingMetrics(): FastLoadingMetrics;
/**
 * Filter builders by active categories (optimized)
 *
 * Uses a pre-built category lookup for O(1) category checking
 */
export declare function fastFilterBuilders(builders: ContextBuilder[], activeCategories: BC[]): ContextBuilder[];
/**
 * Drop-in replacement for determineActiveCategories with metrics tracking
 */
export declare function determineActiveCategoriesFast(input: ContextBuilderInput): BC[];
declare const _default: {
    fastDetermineActiveCategories: typeof fastDetermineActiveCategories;
    determineActiveCategoriesFast: typeof determineActiveCategoriesFast;
    fastFilterBuilders: typeof fastFilterBuilders;
    recordLoadingDecision: typeof recordLoadingDecision;
    getFastLoadingMetrics: typeof getFastLoadingMetrics;
    MINIMAL_TIER_CATEGORIES: BC[];
    STANDARD_TIER_CATEGORIES: BC[];
    FULL_TIER_CATEGORIES: BC[];
};
export default _default;
//# sourceMappingURL=fast-conditional-loading.d.ts.map