/**
 * Breakthrough Catalyst Embeddings
 *
 * Embeds breakthrough moments to find similar situations where insights emerged.
 *
 * Example: "A similar pattern led to your insight about self-worth 3 months ago."
 *
 * This enables recognizing when conditions are right for breakthrough based on
 * the user's own breakthrough history.
 *
 * @module intelligence/predictive/embeddings/breakthrough-embeddings
 */
import type { BreakthroughType, IndicatorType } from '../breakthrough-proximity.js';
export interface BreakthroughEmbedding {
    id: string;
    userId: string;
    topic: string;
    type: BreakthroughType;
    insightSummary: string;
    impact: number;
    contextEmbedding: number[];
    indicatorEmbedding: number[];
    catalystEmbedding: number[];
    insightEmbedding: number[];
    indicators: Array<{
        type: IndicatorType;
        strength: number;
        content: string;
    }>;
    catalystType: 'question' | 'reflection' | 'connection' | 'emotion' | 'external_event' | 'silence';
    catalystDescription: string;
    conversationContext: string;
    emotionalState: string;
    timestamp: number;
    conversationLength: number;
    followUpInsights?: string[];
    actionsTaken?: string[];
}
export interface BreakthroughMatch {
    breakthrough: BreakthroughEmbedding;
    overallSimilarity: number;
    indicatorSimilarity: number;
    contextSimilarity: number;
    topicSimilarity: number;
    likelihood: number;
    guidanceFromPast: string;
}
export interface BreakthroughPrediction {
    readiness: number;
    likelyType: BreakthroughType;
    optimalCatalysts: Array<{
        type: string;
        description: string;
        historicalSuccess: number;
    }>;
    similarBreakthroughs: BreakthroughMatch[];
    recommendedApproach: string;
}
/**
 * Record a breakthrough with embeddings
 */
export declare function recordBreakthroughWithEmbeddings(userId: string, breakthrough: {
    topic: string;
    type: BreakthroughType;
    insightSummary: string;
    impact: number;
    indicators: Array<{
        type: IndicatorType;
        strength: number;
        content: string;
    }>;
    catalystType: BreakthroughEmbedding['catalystType'];
    catalystDescription: string;
    conversationContext: string;
    emotionalState: string;
    conversationLength: number;
    followUpInsights?: string[];
    actionsTaken?: string[];
}): Promise<BreakthroughEmbedding>;
/**
 * Find similar past breakthroughs
 */
export declare function findSimilarBreakthroughs(userId: string, currentState: {
    topic: string;
    conversationContext: string;
    emotionalState: string;
    indicators: Array<{
        type: IndicatorType;
        strength: number;
        content: string;
    }>;
}, k?: number): Promise<BreakthroughMatch[]>;
/**
 * Predict breakthrough readiness
 */
export declare function predictBreakthroughReadiness(userId: string, currentState: Parameters<typeof findSimilarBreakthroughs>[1]): Promise<BreakthroughPrediction | null>;
/**
 * Get breakthrough catalyst that worked best for this user
 */
export declare function getOptimalCatalysts(userId: string): Array<{
    type: string;
    successRate: number;
    averageImpact: number;
    count: number;
}>;
/**
 * Get breakthrough patterns by topic similarity
 */
export declare function getBreakthroughsByTopic(userId: string, topic: string, k?: number): Promise<BreakthroughEmbedding[]>;
/**
 * Build breakthrough pattern context for LLM
 */
export declare function buildBreakthroughEmbeddingContext(userId: string, currentState: Parameters<typeof findSimilarBreakthroughs>[1]): Promise<string>;
export interface BreakthroughPersistenceData {
    breakthroughs: BreakthroughEmbedding[];
}
/**
 * Get current state for persistence
 */
export declare function getStateForPersistence(userId: string): BreakthroughPersistenceData;
/**
 * Hydrate from persisted data
 */
export declare function hydrateFromPersistence(userId: string, data: BreakthroughPersistenceData): void;
/**
 * Clear user data (for cleanup)
 */
export declare function clearUserData(userId: string): void;
export declare const breakthroughEmbeddings: {
    recordBreakthroughWithEmbeddings: typeof recordBreakthroughWithEmbeddings;
    findSimilarBreakthroughs: typeof findSimilarBreakthroughs;
    predictBreakthroughReadiness: typeof predictBreakthroughReadiness;
    getOptimalCatalysts: typeof getOptimalCatalysts;
    getBreakthroughsByTopic: typeof getBreakthroughsByTopic;
    buildBreakthroughEmbeddingContext: typeof buildBreakthroughEmbeddingContext;
    getStateForPersistence: typeof getStateForPersistence;
    hydrateFromPersistence: typeof hydrateFromPersistence;
    clearUserData: typeof clearUserData;
};
export default breakthroughEmbeddings;
//# sourceMappingURL=breakthrough-embeddings.d.ts.map