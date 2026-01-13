/**
 * Firestore Persistence for Semantic Router
 *
 * Provides persistent storage for:
 * - Routing corrections (active learning)
 * - User personalization profiles
 * - Routing analytics/events
 * - A/B test results
 *
 * Uses the same Firestore instance as the memory module.
 *
 * @module tools/semantic-router/persistence/firestore-persistence
 */
export interface FirestoreDB {
    collection: (path: string) => CollectionReference;
}
export interface CollectionReference {
    doc: (id: string) => DocumentReference;
    add: (data: Record<string, unknown>) => Promise<DocumentReference>;
    where: (field: string, op: string, value: unknown) => Query;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
    limit: (n: number) => Query;
    get: () => Promise<QuerySnapshot>;
}
export interface DocumentReference {
    id: string;
    set: (data: Record<string, unknown>, options?: {
        merge?: boolean;
    }) => Promise<void>;
    get: () => Promise<DocumentSnapshot>;
    update: (data: Record<string, unknown>) => Promise<void>;
    delete: () => Promise<void>;
    collection: (name: string) => CollectionReference;
}
export interface DocumentSnapshot {
    exists: boolean;
    id: string;
    data: () => Record<string, unknown> | undefined;
}
interface QuerySnapshot {
    empty: boolean;
    docs: DocumentSnapshot[];
    size: number;
}
interface Query {
    where: (field: string, op: string, value: unknown) => Query;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
    limit: (n: number) => Query;
    get: () => Promise<QuerySnapshot>;
}
export declare const COLLECTIONS: {
    readonly CORRECTIONS: "semantic_router_corrections";
    readonly USER_PROFILES: "user_tool_profiles";
    readonly ROUTING_EVENTS: "semantic_router_events";
    readonly AB_TESTS: "semantic_router_ab_tests";
    readonly LEARNING_STATE: "semantic_router_learning";
    readonly TOOL_EMBEDDINGS: "semantic_router_tool_embeddings";
};
/**
 * Initialize the Firestore connection for semantic router
 * Reuses existing Firestore instance from memory module if available
 */
export declare function initializeFirestorePersistence(): Promise<void>;
/**
 * Get the Firestore instance (null if not initialized)
 */
export declare function getFirestore(): FirestoreDB | null;
/**
 * Check if persistence is available
 */
export declare function isPersistenceAvailable(): boolean;
export interface PersistedCorrection {
    id: string;
    timestamp: Date;
    userId: string;
    sessionId: string;
    originalQuery: string;
    normalizedQuery: string;
    predictedTool: string;
    predictedConfidence: number;
    predictedArgs: Record<string, unknown>;
    actualTool: string | null;
    actualArgs?: Record<string, unknown>;
    correctionSource: 'user_explicit' | 'user_implicit' | 'system';
    conversationContext: string[];
    personaId: string;
    feedbackType: 'wrong_tool' | 'wrong_args' | 'should_not_call' | 'missed_tool';
    userFeedback?: string;
}
/**
 * Save a routing correction to Firestore
 */
export declare function saveCorrection(correction: PersistedCorrection): Promise<void>;
/**
 * Load corrections from Firestore
 */
export declare function loadCorrections(options?: {
    userId?: string;
    since?: Date;
    limit?: number;
}): Promise<PersistedCorrection[]>;
export interface PersistedUserProfile {
    userId: string;
    toolBoosts: Record<string, number>;
    vocabulary: Record<string, string>;
    timePatterns: Record<string, Record<string, number>>;
    contextPatterns: Record<string, Record<string, number>>;
    totalInteractions: number;
    lastUpdated: Date;
    correctionRate: number;
}
/**
 * Save user profile to Firestore
 */
export declare function saveUserProfile(profile: PersistedUserProfile): Promise<void>;
/**
 * Load user profile from Firestore
 */
export declare function loadUserProfile(userId: string): Promise<PersistedUserProfile | null>;
export interface PersistedRoutingEvent {
    id: string;
    timestamp: Date;
    userId: string;
    sessionId: string;
    personaId: string;
    inputText: string;
    actionType: string;
    toolId?: string;
    confidence?: number;
    latencyMs: number;
    outcome?: {
        toolExecuted: string | null;
        executionSuccess: boolean;
        corrected?: boolean;
        llmFallbackUsed: boolean;
    };
}
/**
 * Save routing event to Firestore
 * Uses date-partitioned subcollections for efficient querying
 */
export declare function saveRoutingEvent(event: PersistedRoutingEvent): Promise<void>;
/**
 * Load routing events from Firestore
 */
export declare function loadRoutingEvents(options: {
    date: string;
    userId?: string;
    limit?: number;
}): Promise<PersistedRoutingEvent[]>;
export interface PersistedABTest {
    testId: string;
    variants: Array<{
        name: string;
        weight: number;
        config: Record<string, unknown>;
    }>;
    metrics: string[];
    startDate: Date;
    endDate?: Date;
    results: Record<string, number[]>;
    status: 'running' | 'completed' | 'stopped';
}
/**
 * Save A/B test to Firestore
 */
export declare function saveABTest(test: PersistedABTest): Promise<void>;
/**
 * Load A/B tests from Firestore
 */
export declare function loadABTests(options?: {
    status?: 'running' | 'completed' | 'stopped';
}): Promise<PersistedABTest[]>;
export interface PersistedToolEmbeddingIndex {
    toolId: string;
    version: string;
    descriptionEmbedding: number[];
    exampleEmbeddings: number[][];
    embeddingModel: string;
    createdAt: Date;
    toolHash: string;
}
/**
 * Save tool embedding index to Firestore
 * Uses version-partitioned storage for easy migrations
 */
export declare function saveToolEmbedding(index: PersistedToolEmbeddingIndex): Promise<void>;
/**
 * Load a specific tool embedding index from Firestore
 */
export declare function loadToolEmbedding(toolId: string, version: string): Promise<PersistedToolEmbeddingIndex | null>;
/**
 * Load all tool embeddings for a version from Firestore
 */
export declare function loadAllToolEmbeddings(version: string): Promise<PersistedToolEmbeddingIndex[]>;
/**
 * Delete old tool embedding versions (cleanup)
 */
export declare function deleteToolEmbeddingVersion(version: string): Promise<number>;
export interface PersistedLearningState {
    confusionMatrix: Record<string, Record<string, number>>;
    lastRetrainTime?: Date;
    accuracyHistory: Array<{
        timestamp: Date;
        accuracy: number;
    }>;
}
/**
 * Save learning state to Firestore
 */
export declare function saveLearningState(state: PersistedLearningState): Promise<void>;
/**
 * Load learning state from Firestore
 */
export declare function loadLearningState(): Promise<PersistedLearningState | null>;
/**
 * Clean up old data (run periodically)
 */
export declare function cleanupOldData(options: {
    correctionRetentionDays?: number;
    eventRetentionDays?: number;
}): Promise<{
    deletedCorrections: number;
    deletedEvents: number;
}>;
/**
 * Class wrapper for Firestore persistence operations
 * Provides a unified interface for all persistence operations
 */
export declare class FirestorePersistence {
    private initPromise;
    initialize(): Promise<void>;
    isAvailable(): boolean;
    saveCorrection(correction: PersistedCorrection): Promise<void>;
    loadCorrections(options?: {
        userId?: string;
        since?: Date;
        limit?: number;
    }): Promise<PersistedCorrection[]>;
    saveUserProfile(profile: PersistedUserProfile): Promise<void>;
    loadUserProfile(userId: string): Promise<PersistedUserProfile | null>;
    saveRoutingEvent(event: PersistedRoutingEvent): Promise<void>;
    loadRoutingEvents(options: {
        date: string;
        userId?: string;
        limit?: number;
    }): Promise<PersistedRoutingEvent[]>;
    saveABTest(test: PersistedABTest): Promise<void>;
    loadABTests(options?: {
        status?: 'running' | 'completed' | 'stopped';
    }): Promise<PersistedABTest[]>;
    saveToolEmbedding(index: PersistedToolEmbeddingIndex): Promise<void>;
    loadToolEmbedding(toolId: string, version: string): Promise<PersistedToolEmbeddingIndex | null>;
    loadAllToolEmbeddings(version: string): Promise<PersistedToolEmbeddingIndex[]>;
    deleteToolEmbeddingVersion(version: string): Promise<number>;
    saveLearningState(state: PersistedLearningState): Promise<void>;
    loadLearningState(): Promise<PersistedLearningState | null>;
    cleanup(options: {
        correctionRetentionDays?: number;
        eventRetentionDays?: number;
    }): Promise<{
        deletedCorrections: number;
        deletedEvents: number;
    }>;
}
/**
 * Get the singleton FirestorePersistence instance
 */
export declare function getFirestorePersistence(): FirestorePersistence;
export {};
//# sourceMappingURL=firestore-persistence.d.ts.map