/**
 * Tool Recommendation Engine
 *
 * Generates data-driven recommendations for tool optimization:
 * - New tools to create (based on gaps and feature requests)
 * - Tools to consolidate (based on co-occurrence patterns)
 * - Tools to deprecate (based on usage and feedback)
 * - Experiments to run (based on hypotheses from data)
 *
 * This engine continuously learns from user interactions and
 * automatically generates actionable recommendations.
 */
export type { RecommendationType, Recommendation, Evidence, ImpactAssessment, ImplementationGuide, } from '../../types/optimization-types.js';
import type { RecommendationType, Recommendation } from '../../types/optimization-types.js';
export interface ExperimentHypothesis {
    hypothesis: string;
    metric: string;
    expectedChange: string;
    confidence: number;
}
export declare class RecommendationEngine {
    private recommendations;
    private lastGenerationTime;
    private readonly GENERATION_COOLDOWN;
    /**
     * Generate all recommendations based on current data
     */
    generateRecommendations(): Promise<Recommendation[]>;
    private generateToolCreationRecs;
    private generateConsolidationRecs;
    private generateDeprecationRecs;
    private buildDeprecationRationale;
    private generateImprovementRecs;
    private generateExperimentRecs;
    private generateHypotheses;
    private createExperimentFromHypothesis;
    /**
     * Get all pending recommendations
     */
    getPendingRecommendations(): Recommendation[];
    /**
     * Get recommendations by type
     */
    getRecommendationsByType(type: RecommendationType): Recommendation[];
    /**
     * Approve a recommendation
     */
    approveRecommendation(id: string): boolean;
    /**
     * Reject a recommendation
     */
    rejectRecommendation(id: string, reason?: string): boolean;
    /**
     * Mark recommendation as implemented
     */
    markImplemented(id: string): boolean;
    /**
     * Auto-implement low-risk recommendations
     */
    autoImplement(dryRun?: boolean): Promise<string[]>;
    /**
     * Generate recommendation report
     */
    generateReport(): string;
}
export declare const recommendationEngine: RecommendationEngine;
export default recommendationEngine;
//# sourceMappingURL=recommendation-engine.d.ts.map