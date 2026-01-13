/**
 * Ripple Effect Embedding Space
 *
 * Maps life domains in embedding space to predict cascade paths and
 * find non-obvious domain connections.
 *
 * Example: Work stress → Sleep quality → Energy → Relationships
 * The embedding space reveals which domains are semantically close
 * and therefore likely to influence each other.
 *
 * @module intelligence/predictive/embeddings/ripple-embedding-space
 */
import type { LifeDomain, EventType } from '../ripple-effect-prediction.js';
export interface DomainEmbedding {
    domain: LifeDomain;
    coreEmbedding: number[];
    currentStateEmbedding: number[];
    healthyStateEmbedding: number[];
    personalMeaning: string;
    recentTopics: string[];
    emotionalAssociation: number;
}
export interface InfluenceVector {
    from: LifeDomain;
    to: LifeDomain;
    influenceEmbedding: number[];
    strength: number;
    direction: 'positive' | 'negative' | 'amplifying';
    observationCount: number;
    exampleDescriptions: string[];
}
export interface DomainEmbeddingSpace {
    userId: string;
    domains: Map<LifeDomain, DomainEmbedding>;
    influenceVectors: InfluenceVector[];
    lastUpdated: number;
}
export interface RipplePathPrediction {
    event: {
        domain: LifeDomain;
        eventType: EventType;
        magnitude: number;
    };
    predictedPath: Array<{
        domain: LifeDomain;
        order: number;
        expectedImpact: number;
        semanticConnection: string;
    }>;
    totalRisk: number;
    leveragePoints: Array<{
        domain: LifeDomain;
        action: string;
        expectedBenefit: number;
    }>;
}
export interface DomainCluster {
    name: string;
    domains: LifeDomain[];
    centroid: number[];
    cohesion: number;
    vulnerabilityScore: number;
}
/**
 * Initialize domain embedding space for a user
 */
export declare function initializeDomainSpace(userId: string): Promise<DomainEmbeddingSpace>;
/**
 * Update a domain's current state embedding
 */
export declare function updateDomainState(userId: string, domain: LifeDomain, update: {
    recentTopics?: string[];
    personalMeaning?: string;
    emotionalAssociation?: number;
    currentDescription?: string;
}): Promise<void>;
/**
 * Record an observed influence between domains
 */
export declare function recordDomainInfluence(userId: string, observation: {
    from: LifeDomain;
    to: LifeDomain;
    description: string;
    direction: 'positive' | 'negative' | 'amplifying';
    strength: number;
}): Promise<void>;
/**
 * Predict ripple path for an event using embedding similarity
 */
export declare function predictRipplePath(userId: string, event: {
    domain: LifeDomain;
    eventType: EventType;
    magnitude: number;
    description: string;
}): Promise<RipplePathPrediction>;
/**
 * Find domain clusters that tend to move together
 */
export declare function findDomainClusters(userId: string): DomainCluster[];
/**
 * Get semantic distance between two domains for this user
 */
export declare function getDomainDistance(userId: string, domainA: LifeDomain, domainB: LifeDomain): number | null;
/**
 * Find domains that are semantically close to a topic
 */
export declare function findRelatedDomains(userId: string, topic: string, k?: number): Promise<Array<{
    domain: LifeDomain;
    similarity: number;
}>>;
/**
 * Build ripple embedding space context for LLM
 */
export declare function buildRippleSpaceContext(userId: string, currentTopic?: string): Promise<string>;
export interface RippleSpacePersistenceData {
    domains: Array<{
        domain: LifeDomain;
        coreEmbedding: number[];
        currentStateEmbedding: number[];
        healthyStateEmbedding: number[];
        personalMeaning: string;
        recentTopics: string[];
        emotionalAssociation: number;
    }>;
    influenceVectors: InfluenceVector[];
    lastUpdated: number;
}
/**
 * Get current state for persistence
 */
export declare function getStateForPersistence(userId: string): RippleSpacePersistenceData | null;
/**
 * Hydrate from persisted data
 */
export declare function hydrateFromPersistence(userId: string, data: RippleSpacePersistenceData): void;
/**
 * Clear user data (for cleanup)
 */
export declare function clearUserData(userId: string): void;
export declare const rippleEmbeddingSpace: {
    initializeDomainSpace: typeof initializeDomainSpace;
    updateDomainState: typeof updateDomainState;
    recordDomainInfluence: typeof recordDomainInfluence;
    predictRipplePath: typeof predictRipplePath;
    findDomainClusters: typeof findDomainClusters;
    getDomainDistance: typeof getDomainDistance;
    findRelatedDomains: typeof findRelatedDomains;
    buildRippleSpaceContext: typeof buildRippleSpaceContext;
    getStateForPersistence: typeof getStateForPersistence;
    hydrateFromPersistence: typeof hydrateFromPersistence;
    clearUserData: typeof clearUserData;
};
export default rippleEmbeddingSpace;
//# sourceMappingURL=ripple-embedding-space.d.ts.map