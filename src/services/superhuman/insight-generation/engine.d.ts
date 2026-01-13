/**
 * Insight Generation Engine
 *
 * The orchestrator that runs all insight generators and produces
 * actionable, surfaceable insights that make Ferni "Better Than Human".
 *
 * @module services/superhuman/insight-generation/engine
 */
import type { GeneratedInsight, InsightCategory, InsightGenerationResult, InsightGenerator, InsightGeneratorContext, InsightQueryOptions } from './types.js';
/**
 * Register an insight generator
 */
export declare function registerInsightGenerator(generator: InsightGenerator): void;
/**
 * Get all registered generators
 */
export declare function getRegisteredGenerators(): InsightGenerator[];
/**
 * Run all insight generators for a user
 */
export declare function generateAllInsights(userId: string, context?: InsightGeneratorContext): Promise<InsightGenerationResult>;
/**
 * Generate insights for a specific category
 */
export declare function generateCategoryInsights(userId: string, category: InsightCategory, context?: InsightGeneratorContext): Promise<GeneratedInsight[]>;
/**
 * Query cached insights with filters
 */
export declare function queryCachedInsights(userId: string, options?: InsightQueryOptions): GeneratedInsight[];
/**
 * Get insights to surface based on current context
 */
export declare function getInsightsToSurface(userId: string, context: InsightGeneratorContext): Promise<GeneratedInsight[]>;
/**
 * Mark an insight as surfaced
 */
export declare function markInsightSurfaced(userId: string, insightId: string, reaction?: GeneratedInsight['userReaction']): void;
/**
 * Dismiss an insight
 */
export declare function dismissInsight(userId: string, insightId: string): void;
/**
 * Clear insight cache for a user
 */
export declare function clearInsightCache(userId?: string): void;
/**
 * Format insights for LLM prompt injection
 */
export declare function formatInsightsForPrompt(insights: GeneratedInsight[]): string;
/**
 * Get engine statistics
 */
export declare function getEngineStats(): {
    registeredGenerators: number;
    categories: InsightCategory[];
    cacheSize: number;
};
//# sourceMappingURL=engine.d.ts.map