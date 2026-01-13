/**
 * Embedding Intelligence Persistence
 *
 * Persists embedding-powered predictive data to Firestore.
 *
 * Similar to superhuman-persistence.ts but for the embedding capabilities:
 * - Semantic avoidance patterns
 * - Trajectory pattern library
 * - Breakthrough embeddings
 * - Cognitive fingerprints (community)
 * - Ripple embedding space
 * - Intervention situation library
 *
 * @module intelligence/predictive/embeddings/embedding-persistence
 */
export interface AvoidancePersistenceData {
    embeddings: Array<{
        topic: string;
        embedding: number[];
        deflectionPatterns: string[];
        emotionalSignature: string;
        frequency: number;
        lastDeflection: number;
    }>;
    clusters: Array<{
        id: string;
        label: string;
        themes: string[];
        topics: string[];
        centroidEmbedding: number[];
        cohesion: number;
        emotionalWeight: number;
    }>;
    [key: string]: unknown;
}
export interface TrajectoryPersistenceData {
    patterns: Array<{
        id: string;
        trajectory: string;
        severity: number;
        duration: number;
        trajectoryEmbedding: number[];
        precursorEmbedding: number[];
        contextEmbedding: number[];
        precursorSignals: Array<{
            signal: string;
            value: number;
            daysBeforeOnset: number;
        }>;
        contextDescription: string;
        lifeDomains: string[];
        recordedAt: number;
        onsetAt: number;
        resolvedAt?: number;
        resolution: string;
        helpfulInterventions?: string[];
    }>;
    [key: string]: unknown;
}
export interface BreakthroughPersistenceData {
    breakthroughs: Array<{
        id: string;
        topic: string;
        type: string;
        insightSummary: string;
        impact: number;
        contextEmbedding: number[];
        indicatorEmbedding: number[];
        catalystEmbedding: number[];
        insightEmbedding: number[];
        indicators: Array<{
            type: string;
            strength: number;
            content: string;
        }>;
        catalystType: string;
        catalystDescription: string;
        conversationContext: string;
        emotionalState: string;
        timestamp: number;
        conversationLength: number;
        followUpInsights?: string[];
        actionsTaken?: string[];
    }>;
    [key: string]: unknown;
}
export interface RippleSpacePersistenceData {
    domains: Array<{
        domain: string;
        coreEmbedding: number[];
        currentStateEmbedding: number[];
        healthyStateEmbedding: number[];
        personalMeaning: string;
        recentTopics: string[];
        emotionalAssociation: number;
    }>;
    influenceVectors: Array<{
        from: string;
        to: string;
        influenceEmbedding: number[];
        strength: number;
        direction: string;
        observationCount: number;
        exampleDescriptions: string[];
    }>;
    [key: string]: unknown;
}
export interface InterventionPersistenceData {
    situations: Array<{
        id: string;
        timestamp: number;
        situationEmbedding: number[];
        emotionalEmbedding: number[];
        topicEmbedding: number[];
        transcript: string;
        emotionalState: string;
        topic: string;
        conversationDepth: string;
        intervention: string;
        outcome: string;
        effectivenessScore: number;
        userResponse: string;
        timeOfDay: string;
        dayOfWeek: number;
        relationshipStage: string;
    }>;
    [key: string]: unknown;
}
/**
 * Mark a user's embedding data as dirty (needs persistence)
 */
export declare function markEmbeddingDirty(userId: string): void;
/**
 * Check if user has dirty embedding data
 */
export declare function isEmbeddingDirty(userId: string): boolean;
/**
 * Save semantic avoidance data
 */
export declare function saveSemanticAvoidance(userId: string, data: AvoidancePersistenceData): Promise<void>;
/**
 * Save trajectory patterns
 */
export declare function saveTrajectoryPatterns(userId: string, data: TrajectoryPersistenceData): Promise<void>;
/**
 * Save breakthrough embeddings
 */
export declare function saveBreakthroughEmbeddings(userId: string, data: BreakthroughPersistenceData): Promise<void>;
/**
 * Save ripple embedding space
 */
export declare function saveRippleSpace(userId: string, data: RippleSpacePersistenceData): Promise<void>;
/**
 * Save intervention situations
 */
export declare function saveInterventionSituations(userId: string, data: InterventionPersistenceData): Promise<void>;
/**
 * Save cognitive fingerprint
 */
export declare function saveCognitiveFingerprint(userId: string, data: {
    fingerprint: unknown;
    interventionOutcomes: Array<{
        interventionType: string;
        successes: number;
        failures: number;
        conditions: string[];
    }>;
}): Promise<void>;
/**
 * Load semantic avoidance data
 */
export declare function loadSemanticAvoidance(userId: string): Promise<AvoidancePersistenceData | null>;
/**
 * Load trajectory patterns
 */
export declare function loadTrajectoryPatterns(userId: string): Promise<TrajectoryPersistenceData | null>;
/**
 * Load breakthrough embeddings
 */
export declare function loadBreakthroughEmbeddings(userId: string): Promise<BreakthroughPersistenceData | null>;
/**
 * Load ripple embedding space
 */
export declare function loadRippleSpace(userId: string): Promise<RippleSpacePersistenceData | null>;
/**
 * Load intervention situations
 */
export declare function loadInterventionSituations(userId: string): Promise<InterventionPersistenceData | null>;
/**
 * Load cognitive fingerprint
 */
export declare function loadCognitiveFingerprint(userId: string): Promise<{
    fingerprint: unknown;
    interventionOutcomes: Array<{
        interventionType: string;
        successes: number;
        failures: number;
        conditions: string[];
    }>;
} | null>;
/**
 * Load all embedding data for a user
 */
export declare function loadAllEmbeddingData(userId: string): Promise<{
    avoidance: AvoidancePersistenceData | null;
    trajectories: TrajectoryPersistenceData | null;
    breakthroughs: BreakthroughPersistenceData | null;
    rippleSpace: RippleSpacePersistenceData | null;
    interventions: InterventionPersistenceData | null;
    cognitive: Awaited<ReturnType<typeof loadCognitiveFingerprint>>;
}>;
/**
 * Flush embedding state for a user - saves all in-memory data to Firestore
 */
export declare function flushEmbeddingState(userId: string): Promise<void>;
/**
 * Flush all dirty users
 */
export declare function flushAllDirtyEmbeddingUsers(): Promise<void>;
/**
 * Initialize embedding intelligence for a session
 */
export declare function initializeEmbeddingSession(userId: string, sessionId: string): Promise<void>;
/**
 * Cleanup embedding intelligence for a session
 */
export declare function cleanupEmbeddingSession(userId: string, sessionId: string): Promise<void>;
export declare const embeddingPersistence: {
    markDirty: typeof markEmbeddingDirty;
    isDirty: typeof isEmbeddingDirty;
    flush: typeof flushEmbeddingState;
    flushAll: typeof flushAllDirtyEmbeddingUsers;
    initializeSession: typeof initializeEmbeddingSession;
    cleanupSession: typeof cleanupEmbeddingSession;
    save: {
        avoidance: typeof saveSemanticAvoidance;
        trajectories: typeof saveTrajectoryPatterns;
        breakthroughs: typeof saveBreakthroughEmbeddings;
        rippleSpace: typeof saveRippleSpace;
        interventions: typeof saveInterventionSituations;
        cognitive: typeof saveCognitiveFingerprint;
    };
    load: {
        avoidance: typeof loadSemanticAvoidance;
        trajectories: typeof loadTrajectoryPatterns;
        breakthroughs: typeof loadBreakthroughEmbeddings;
        rippleSpace: typeof loadRippleSpace;
        interventions: typeof loadInterventionSituations;
        cognitive: typeof loadCognitiveFingerprint;
        all: typeof loadAllEmbeddingData;
    };
};
export default embeddingPersistence;
//# sourceMappingURL=embedding-persistence.d.ts.map