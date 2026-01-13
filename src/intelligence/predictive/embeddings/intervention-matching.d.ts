/**
 * Intervention-Situation Matching - Embedding-Powered
 *
 * Embeds situations to find optimal interventions based on semantic similarity.
 *
 * Example: "In similar situations, validation worked 85% of the time."
 *
 * This enables learning what interventions work for which situations,
 * going beyond simple condition matching to semantic understanding.
 *
 * @module intelligence/predictive/embeddings/intervention-matching
 */
import type { InterventionType } from '../intervention-timing.js';
export interface SituationEmbedding {
    id: string;
    userId: string;
    timestamp: number;
    situationEmbedding: number[];
    emotionalEmbedding: number[];
    topicEmbedding: number[];
    transcript: string;
    emotionalState: string;
    topic: string;
    conversationDepth: 'surface' | 'moderate' | 'deep';
    intervention: InterventionType;
    outcome: 'success' | 'neutral' | 'backfired';
    effectivenessScore: number;
    userResponse: 'engaged' | 'deflected' | 'ignored' | 'rejected' | 'breakthrough';
    timeOfDay: string;
    dayOfWeek: number;
    relationshipStage: string;
}
export interface SituationMatch {
    situation: SituationEmbedding;
    similarity: number;
    emotionalMatch: number;
    topicMatch: number;
    successfulIntervention: boolean;
}
export interface InterventionRecommendation {
    intervention: InterventionType;
    confidence: number;
    successRate: number;
    sampleSize: number;
    reasoning: string;
    antiPatterns: string[];
}
export interface CurrentSituation {
    transcript: string;
    emotionalState: string;
    topic: string;
    conversationDepth?: 'surface' | 'moderate' | 'deep';
    timeOfDay?: string;
    relationshipStage?: string;
}
/**
 * Record a situation-intervention outcome
 */
export declare function recordSituationOutcome(userId: string, situation: {
    transcript: string;
    emotionalState: string;
    topic: string;
    conversationDepth: 'surface' | 'moderate' | 'deep';
    intervention: InterventionType;
    outcome: 'success' | 'neutral' | 'backfired';
    effectivenessScore: number;
    userResponse: SituationEmbedding['userResponse'];
    timeOfDay?: string;
    dayOfWeek?: number;
    relationshipStage?: string;
}): Promise<SituationEmbedding>;
/**
 * Find similar situations from history
 */
export declare function findSimilarSituations(userId: string, currentSituation: CurrentSituation, k?: number): Promise<SituationMatch[]>;
/**
 * Get intervention recommendations based on similar situations
 */
export declare function getInterventionRecommendations(userId: string, currentSituation: CurrentSituation, k?: number): Promise<InterventionRecommendation[]>;
/**
 * Get the single best intervention for current situation
 */
export declare function getBestIntervention(userId: string, currentSituation: CurrentSituation): Promise<InterventionRecommendation | null>;
/**
 * Get intervention success rate for a specific intervention
 */
export declare function getInterventionSuccessRate(userId: string, intervention: InterventionType, currentSituation: CurrentSituation): Promise<{
    rate: number;
    sampleSize: number;
    conditions: string[];
} | null>;
/**
 * Get situations where a specific intervention worked well
 */
export declare function getSuccessfulSituations(userId: string, intervention: InterventionType, limit?: number): SituationEmbedding[];
/**
 * Get intervention statistics for user
 */
export declare function getInterventionStats(userId: string): Record<string, {
    attempts: number;
    successRate: number;
    avgEffectiveness: number;
    bestConditions: string[];
}>;
/**
 * Build intervention matching context for LLM
 */
export declare function buildInterventionMatchingContext(userId: string, currentSituation: CurrentSituation): Promise<string>;
export interface InterventionPersistenceData {
    situations: SituationEmbedding[];
}
/**
 * Get current state for persistence
 */
export declare function getStateForPersistence(userId: string): InterventionPersistenceData;
/**
 * Hydrate from persisted data
 */
export declare function hydrateFromPersistence(userId: string, data: InterventionPersistenceData): void;
/**
 * Clear user data (for cleanup)
 */
export declare function clearUserData(userId: string): void;
export declare const interventionMatching: {
    recordSituationOutcome: typeof recordSituationOutcome;
    findSimilarSituations: typeof findSimilarSituations;
    getInterventionRecommendations: typeof getInterventionRecommendations;
    getBestIntervention: typeof getBestIntervention;
    getInterventionSuccessRate: typeof getInterventionSuccessRate;
    getSuccessfulSituations: typeof getSuccessfulSituations;
    getInterventionStats: typeof getInterventionStats;
    buildInterventionMatchingContext: typeof buildInterventionMatchingContext;
    getStateForPersistence: typeof getStateForPersistence;
    hydrateFromPersistence: typeof hydrateFromPersistence;
    clearUserData: typeof clearUserData;
};
export default interventionMatching;
//# sourceMappingURL=intervention-matching.d.ts.map