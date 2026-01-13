/**
 * Embedding-Powered Predictive Intelligence
 *
 * Enhances the Better Than Human v4 predictive capabilities with
 * semantic understanding through embeddings.
 *
 * CAPABILITIES:
 * 1. Semantic Avoidance - Find thematically related avoided topics
 * 2. Trajectory Patterns - Match emotional sequences to past patterns
 * 3. Breakthrough Embeddings - Find similar breakthrough moments
 * 4. Conversation Trajectory - Track semantic drift in real-time
 * 5. Cognitive Similarity - Community learning from similar profiles
 * 6. Ripple Embedding Space - Domain influence through semantic proximity
 * 7. Intervention Matching - Situation-based intervention selection
 *
 * @module intelligence/predictive/embeddings
 */
export { semanticAvoidance } from './semantic-avoidance.js';
export { trajectoryPatterns } from './trajectory-patterns.js';
export { breakthroughEmbeddings } from './breakthrough-embeddings.js';
export { conversationTrajectory } from './conversation-trajectory.js';
export { cognitiveSimilarity } from './cognitive-similarity.js';
export { rippleEmbeddingSpace } from './ripple-embedding-space.js';
export { interventionMatching } from './intervention-matching.js';
export { embeddingPersistence } from './embedding-persistence.js';
export { entitySynergy } from './entity-synergy.js';
export { embeddingObservability } from './embedding-observability.js';
export { entityEmbeddingSync } from './entity-embedding-sync.js';
export type { RippleSpacePersistenceData, InterventionPersistenceData } from './embedding-persistence.js';
export type { EntityContext, EntityAvoidanceLink, EntityTrajectoryContext, EntityBreakthroughContext } from './entity-synergy.js';
export interface EmbeddingPredictiveContext {
    userId: string;
    sessionId?: string;
    currentTopic?: string;
    currentSituation?: {
        transcript: string;
        emotionalState: string;
        topic: string;
        conversationDepth?: 'surface' | 'moderate' | 'deep';
    };
}
/**
 * Get comprehensive embedding-powered predictive context
 *
 * Combines all 7 embedding capabilities into a unified context for LLM injection.
 */
export declare function getEmbeddingPredictiveContext(context: EmbeddingPredictiveContext): Promise<string>;
//# sourceMappingURL=index.d.ts.map