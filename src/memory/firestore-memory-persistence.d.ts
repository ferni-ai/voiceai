/**
 * Firestore Memory Persistence
 *
 * Persists associative memory and behavioral patterns to Firestore.
 * Used by the MemoryOrchestrator to maintain state across sessions.
 *
 * Schema:
 * - bogle_users/{userId}/associative_memory/{memoryId}  → AssociativeTrigger[]
 * - bogle_users/{userId}/behavioral_patterns/{patternType} → BehavioralPattern
 * - bogle_users/{userId}/communication_preferences → CommunicationPreferences
 * - bogle_users/{userId}/emotional_threads/{threadId} → EmotionalThread
 *
 * @module memory/firestore-memory-persistence
 */
import type { AssociativeTrigger, BehavioralPattern, EmotionalThread, MemoryItem } from './interfaces/index.js';
interface CommunicationPreferencesData {
    preferences: Array<{
        dimension: string;
        ourApproach: string;
        userResponse: string;
        situation: string;
        timestamp: string;
    }>;
    lastUpdated: string;
}
export declare class FirestoreMemoryPersistence {
    private db;
    private readonly USERS_COLLECTION;
    constructor();
    /**
     * Initialize Firestore connection
     */
    initialize(): Promise<void>;
    /**
     * Check if Firestore is available
     */
    isAvailable(): boolean;
    /**
     * Save associative memory triggers for a user
     */
    saveAssociativeTriggers(userId: string, memoryId: string, triggers: AssociativeTrigger[], memory?: MemoryItem): Promise<void>;
    /**
     * Load associative memory triggers for a user
     *
     * PERFORMANCE: Limited to QUERY_LIMITS.ASSOCIATIVE_TRIGGERS (50) items
     * ordered by most recently updated for relevance
     */
    loadAssociativeTriggers(userId: string, limit?: number): Promise<Map<string, {
        triggers: AssociativeTrigger[];
        memory?: MemoryItem;
    }>>;
    /**
     * Save behavioral patterns for a user
     */
    saveBehavioralPatterns(userId: string, patterns: BehavioralPattern[]): Promise<void>;
    /**
     * Load behavioral patterns for a user
     *
     * PERFORMANCE: Limited to QUERY_LIMITS.BEHAVIORAL_PATTERNS (20) items
     * ordered by most recently observed
     */
    loadBehavioralPatterns(userId: string, limit?: number): Promise<BehavioralPattern[]>;
    /**
     * Save emotional threads for a user
     */
    saveEmotionalThreads(userId: string, threads: EmotionalThread[]): Promise<void>;
    /**
     * Load emotional threads for a user
     */
    loadEmotionalThreads(userId: string): Promise<EmotionalThread[]>;
    /**
     * Save communication preferences for a user
     */
    saveCommunicationPreferences(userId: string, preferences: CommunicationPreferencesData['preferences']): Promise<void>;
    /**
     * Load communication preferences for a user
     */
    loadCommunicationPreferences(userId: string): Promise<CommunicationPreferencesData['preferences']>;
    /**
     * Delete all memory data for a user (GDPR compliance)
     * FIX: Now handles individual delete failures gracefully and reports them
     */
    deleteUserMemoryData(userId: string): Promise<void>;
}
/**
 * Get the Firestore memory persistence instance
 */
export declare function getFirestoreMemoryPersistence(): Promise<FirestoreMemoryPersistence>;
/**
 * Reset the persistence instance (for testing)
 */
export declare function resetFirestoreMemoryPersistence(): void;
declare const _default: {
    FirestoreMemoryPersistence: typeof FirestoreMemoryPersistence;
    getFirestoreMemoryPersistence: typeof getFirestoreMemoryPersistence;
    resetFirestoreMemoryPersistence: typeof resetFirestoreMemoryPersistence;
};
export default _default;
//# sourceMappingURL=firestore-memory-persistence.d.ts.map