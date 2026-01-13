/**
 * Collective Learning Store
 *
 * Persists community insights and agent evolution data to Firestore.
 * Automatically loads on startup and saves on shutdown.
 *
 * Collections:
 * - community_insights: Cross-user learning patterns
 * - agent_evolution: Persona-specific learnings and adjustments
 * - learning_signals: Raw signals for batch processing
 */
export declare class CollectiveLearningStore {
    private db;
    private initialized;
    private readonly COMMUNITY_INSIGHTS;
    private readonly AGENT_EVOLUTION;
    private readonly LEARNING_SIGNALS;
    initialize(): Promise<void>;
    /**
     * Load all community insights and evolution data on startup
     * Runs with timeout to prevent blocking startup
     */
    loadAllData(): Promise<void>;
    private loadCommunityInsights;
    private loadAgentEvolution;
    /**
     * Save all community insights and evolution data on shutdown
     */
    saveAllData(): Promise<void>;
    private saveCommunityInsights;
    private saveAgentEvolution;
    /**
     * Save a batch of learning signals for later processing
     * Called at the end of each session
     */
    saveLearningSignals(sessionId: string, personaId: string, signals: Array<{
        type: string;
        context: Record<string, unknown>;
        outcome: Record<string, unknown>;
        timestamp: Date;
    }>): Promise<void>;
    /**
     * Increment a counter atomically (for high-frequency signals)
     */
    incrementCounter(collection: string, docId: string, field: string, amount?: number): Promise<void>;
    /**
     * Run evolution cycle for all personas
     * This should be called by a scheduled Cloud Function
     */
    runEvolutionCycle(): Promise<{
        personasProcessed: number;
        patternsComputed: number;
        adjustmentsCreated: number;
    }>;
    private hydrateArray;
    private hydrateObject;
    shutdown(): Promise<void>;
    isInitialized(): boolean;
}
export declare function getCollectiveLearningStore(): CollectiveLearningStore;
export declare function initializeCollectiveLearning(): Promise<CollectiveLearningStore>;
export declare function shutdownCollectiveLearning(): Promise<void>;
export default CollectiveLearningStore;
//# sourceMappingURL=collective-learning-store.d.ts.map