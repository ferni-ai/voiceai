/**
 * Brand Evolution Engine
 *
 * Learns from experiments and user feedback to evolve brand rules.
 * Connects A/B test results to brand improvements.
 *
 * @module @ferni/brand/brand-evolution
 */
import type { BrandHealthMetrics, BrandRuleChange, ExperimentPattern, ValidationResult } from './types.js';
/**
 * Extract learnings from completed experiments
 */
export declare function extractBrandLearnings(): Promise<ExperimentPattern[]>;
/**
 * Update brand rules based on learnings
 */
export declare function evolveBrandRules(learnings: ExperimentPattern[]): Promise<BrandRuleChange[]>;
/**
 * Record a failed approach
 */
export declare function recordFailedApproach(approach: string, reason: string, experimentId: string): Promise<void>;
/**
 * Calculate brand health metrics
 */
export declare function calculateBrandHealth(): Promise<BrandHealthMetrics>;
/**
 * Log a validation for metrics tracking
 */
export declare function logValidation(content: string, result: ValidationResult, context?: {
    persona?: string;
    channel?: string;
}): Promise<void>;
/**
 * Run daily brand evolution analysis
 */
export declare function runDailyEvolution(): Promise<{
    learnings: ExperimentPattern[];
    changes: BrandRuleChange[];
}>;
/**
 * Get recent rule changes
 */
export declare function getRecentRuleChanges(days?: number): Promise<BrandRuleChange[]>;
//# sourceMappingURL=brand-evolution.d.ts.map