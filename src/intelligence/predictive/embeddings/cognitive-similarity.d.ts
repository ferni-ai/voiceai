/**
 * Cognitive Fingerprint Similarity - Community Learning
 *
 * Finds users with similar cognitive patterns for community-based learning.
 *
 * Example: "People with your cognitive pattern respond well to X."
 *
 * Privacy-preserving: Only shares aggregated patterns, never raw data.
 * Uses embeddings to find similar cognitive profiles without exposing details.
 *
 * @module intelligence/predictive/embeddings/cognitive-similarity
 */
import type { CognitiveFingerprint, DecisionStyle, StressResponse } from '../cognitive-fingerprint.js';
export interface CognitiveFingerprintEmbedding {
    userId: string;
    overallEmbedding: number[];
    decisionStyleEmbedding: number[];
    stressResponseEmbedding: number[];
    communicationEmbedding: number[];
    growthPatternEmbedding: number[];
    primaryDecisionStyle: DecisionStyle;
    primaryStressResponse: StressResponse;
    changeVelocity: 'fast' | 'moderate' | 'slow';
    observationCount: number;
    confidence: number;
    lastUpdated: number;
}
export interface SimilarProfile {
    userId: string;
    similarity: number;
    similarAspects: string[];
    differentAspects: string[];
}
export interface CommunityInsight {
    insight: string;
    applicability: number;
    basedOnCount: number;
    confidence: number;
}
export interface InterventionSuccessData {
    interventionType: string;
    successRate: number;
    sampleSize: number;
    optimalConditions: string[];
}
/**
 * Register a user's cognitive fingerprint for community learning
 * (Privacy-preserving: only embeddings stored, no raw data)
 */
export declare function registerFingerprintForCommunity(userId: string, fingerprint: CognitiveFingerprint): Promise<CognitiveFingerprintEmbedding>;
/**
 * Find users with similar cognitive profiles
 */
export declare function findSimilarProfiles(userId: string, k?: number): Promise<SimilarProfile[]>;
/**
 * Get community insights for a user based on similar profiles
 */
export declare function getCommunityInsights(userId: string, aspect?: 'interventions' | 'growth' | 'stress' | 'communication'): Promise<CommunityInsight[]>;
/**
 * Get intervention success data from similar profiles
 */
export declare function getCommunityInterventionSuccess(userId: string, interventionType: string): Promise<InterventionSuccessData | null>;
/**
 * Record intervention outcome for community learning
 */
export declare function recordInterventionOutcome(userId: string, interventionType: string, success: boolean, conditions: string[]): void;
/**
 * Get overall community statistics
 */
export declare function getCommunityStats(): {
    totalProfiles: number;
    averageConfidence: number;
    decisionStyleDistribution: Record<string, number>;
    stressResponseDistribution: Record<string, number>;
};
/**
 * Build community learning context for LLM
 */
export declare function buildCommunityLearningContext(userId: string): Promise<string>;
export interface CognitiveSimilarityPersistenceData {
    fingerprint: CognitiveFingerprintEmbedding | null;
    interventionOutcomes: Array<{
        interventionType: string;
        successes: number;
        failures: number;
        conditions: string[];
    }>;
}
/**
 * Get current state for persistence (per-user)
 */
export declare function getStateForPersistence(userId: string): CognitiveSimilarityPersistenceData;
/**
 * Hydrate from persisted data
 */
export declare function hydrateFromPersistence(userId: string, data: CognitiveSimilarityPersistenceData): void;
/**
 * Clear user data (for cleanup)
 */
export declare function clearUserData(userId: string): void;
export declare const cognitiveSimilarity: {
    registerFingerprintForCommunity: typeof registerFingerprintForCommunity;
    findSimilarProfiles: typeof findSimilarProfiles;
    getCommunityInsights: typeof getCommunityInsights;
    getCommunityInterventionSuccess: typeof getCommunityInterventionSuccess;
    recordInterventionOutcome: typeof recordInterventionOutcome;
    getCommunityStats: typeof getCommunityStats;
    buildCommunityLearningContext: typeof buildCommunityLearningContext;
    getStateForPersistence: typeof getStateForPersistence;
    hydrateFromPersistence: typeof hydrateFromPersistence;
    clearUserData: typeof clearUserData;
};
export default cognitiveSimilarity;
//# sourceMappingURL=cognitive-similarity.d.ts.map