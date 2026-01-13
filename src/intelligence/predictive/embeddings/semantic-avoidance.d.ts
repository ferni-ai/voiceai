/**
 * Semantic Avoidance Detection - Embedding-Powered
 *
 * Goes beyond exact topic matching to find semantically similar avoided topics.
 *
 * Example: User avoids "relationship:parent_father"
 * Embeddings detect they're ALSO avoiding semantically similar:
 *   - "authority figures"
 *   - "disappointment from men"
 *   - "being judged by dad"
 *
 * This enables detecting avoidance of abstract themes, not just explicit topics.
 *
 * @module intelligence/predictive/embeddings/semantic-avoidance
 */
export interface AvoidanceEmbedding {
    topic: string;
    embedding: number[];
    deflectionPatterns: string[];
    emotionalSignature: string;
    frequency: number;
    lastDeflection: number;
}
export interface SemanticAvoidanceCluster {
    id: string;
    label: string;
    themes: string[];
    topics: string[];
    centroidEmbedding: number[];
    cohesion: number;
    emotionalWeight: number;
}
export interface RelatedAvoidance {
    topic: string;
    similarity: number;
    sharedThemes: string[];
    emotionalSimilarity: number;
}
export interface SemanticApproachStrategy {
    avoidedCluster: SemanticAvoidanceCluster;
    approachTopics: Array<{
        topic: string;
        distance: number;
        safetyScore: number;
    }>;
    semanticBridges: string[];
    recommendedTiming: 'now' | 'after_trust' | 'when_ready';
}
/**
 * Record an avoided topic with its embedding
 */
export declare function recordAvoidanceWithEmbedding(userId: string, topic: string, context: {
    deflectionStyle: string;
    emotionalState?: string;
    triggerContext?: string;
}): Promise<void>;
/**
 * Find semantically related avoided topics
 */
export declare function findRelatedAvoidances(userId: string, topic: string, minSimilarity?: number): Promise<RelatedAvoidance[]>;
/**
 * Check if current topic is semantically close to any avoided topics
 */
export declare function isNearAvoidedTerritory(userId: string, currentTopic: string, currentContext: string, threshold?: number): Promise<{
    isNear: boolean;
    nearestAvoided?: string;
    distance: number;
    approachAngle?: string;
}>;
/**
 * Get semantic approach strategy for avoided cluster
 */
export declare function getSemanticApproachStrategy(userId: string, targetTopic: string): Promise<SemanticApproachStrategy | null>;
/**
 * Detect if conversation is circling an avoided topic semantically
 */
export declare function detectSemanticCircling(userId: string, recentTurnEmbeddings: number[][]): Promise<{
    circling: boolean;
    aroundTopic?: string;
    averageDistance: number;
    pattern: 'approaching' | 'orbiting' | 'retreating' | 'none';
}>;
/**
 * Build semantic avoidance context for LLM
 */
export declare function buildSemanticAvoidanceContext(userId: string): string;
export interface SemanticAvoidancePersistenceData {
    embeddings: AvoidanceEmbedding[];
    clusters: SemanticAvoidanceCluster[];
}
/**
 * Get current state for persistence
 */
export declare function getStateForPersistence(userId: string): SemanticAvoidancePersistenceData;
/**
 * Hydrate from persisted data
 */
export declare function hydrateFromPersistence(userId: string, data: SemanticAvoidancePersistenceData): void;
/**
 * Clear user data (for cleanup)
 */
export declare function clearUserData(userId: string): void;
export declare const semanticAvoidance: {
    recordAvoidanceWithEmbedding: typeof recordAvoidanceWithEmbedding;
    findRelatedAvoidances: typeof findRelatedAvoidances;
    isNearAvoidedTerritory: typeof isNearAvoidedTerritory;
    getSemanticApproachStrategy: typeof getSemanticApproachStrategy;
    detectSemanticCircling: typeof detectSemanticCircling;
    buildSemanticAvoidanceContext: typeof buildSemanticAvoidanceContext;
    getStateForPersistence: typeof getStateForPersistence;
    hydrateFromPersistence: typeof hydrateFromPersistence;
    clearUserData: typeof clearUserData;
};
export default semanticAvoidance;
//# sourceMappingURL=semantic-avoidance.d.ts.map