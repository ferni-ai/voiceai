/**
 * Embedding Intelligence Observability
 *
 * Tracks metrics and effectiveness of embedding-powered predictions.
 *
 * METRICS TRACKED:
 * - Embedding generation counts and latencies
 * - Prediction accuracy (when outcomes are recorded)
 * - Capability usage frequency
 * - Hydration and persistence stats
 * - Intervention recommendation success rates
 *
 * @module intelligence/predictive/embeddings/embedding-observability
 */
export interface EmbeddingMetrics {
    embeddingsGenerated: number;
    embeddingLatencyMs: number[];
    embeddingErrors: number;
    semanticAvoidanceChecks: number;
    trajectoryPredictions: number;
    breakthroughAssessments: number;
    trajectoryAnalyses: number;
    interventionRecommendations: number;
    ripplePredictions: number;
    communityInsights: number;
    trajectoryPredictionsCorrect: number;
    trajectoryPredictionsIncorrect: number;
    interventionsSuccessful: number;
    interventionsFailed: number;
    breakthroughsDetected: number;
    avoidanceApproachesDetected: number;
    hydrationsPerformed: number;
    flushesPerformed: number;
    persistenceErrors: number;
    sessionsTracked: number;
    turnsProcessed: number;
}
export interface CapabilityHealth {
    capability: string;
    status: 'healthy' | 'degraded' | 'error';
    lastUsed: number;
    errorRate: number;
    avgLatencyMs: number;
}
/**
 * Record embedding generation
 */
export declare function recordEmbeddingGeneration(latencyMs: number, success: boolean): void;
/**
 * Record capability usage
 */
export declare function recordCapabilityUsage(capability: 'semantic_avoidance' | 'trajectory_patterns' | 'breakthrough' | 'conversation_trajectory' | 'intervention' | 'ripple' | 'community', latencyMs?: number, error?: boolean): void;
/**
 * Record prediction outcome (for accuracy tracking)
 */
export declare function recordPredictionOutcome(type: 'trajectory' | 'intervention' | 'breakthrough' | 'avoidance', success: boolean): void;
/**
 * Record persistence operation
 */
export declare function recordPersistence(operation: 'hydration' | 'flush', success: boolean): void;
/**
 * Record session tracking
 */
export declare function recordSession(): void;
/**
 * Record turn processing
 */
export declare function recordTurn(): void;
/**
 * Get current metrics
 */
export declare function getMetrics(): EmbeddingMetrics;
/**
 * Get metrics summary for logging/monitoring
 */
export declare function getMetricsSummary(): {
    embeddingStats: {
        total: number;
        avgLatencyMs: number;
        errorRate: number;
    };
    capabilityUsage: Record<string, number>;
    effectiveness: {
        trajectoryAccuracy: number;
        interventionSuccessRate: number;
    };
    persistence: {
        hydrations: number;
        flushes: number;
        errors: number;
    };
};
/**
 * Get health status per capability
 */
export declare function getCapabilityHealth(): CapabilityHealth[];
/**
 * Reset metrics (for testing or new period)
 */
export declare function resetMetrics(): void;
/**
 * Log metrics summary (call periodically or on session end)
 */
export declare function logMetricsSummary(): void;
export declare const embeddingObservability: {
    recordEmbeddingGeneration: typeof recordEmbeddingGeneration;
    recordCapabilityUsage: typeof recordCapabilityUsage;
    recordPredictionOutcome: typeof recordPredictionOutcome;
    recordPersistence: typeof recordPersistence;
    recordSession: typeof recordSession;
    recordTurn: typeof recordTurn;
    getMetrics: typeof getMetrics;
    getMetricsSummary: typeof getMetricsSummary;
    getCapabilityHealth: typeof getCapabilityHealth;
    resetMetrics: typeof resetMetrics;
    logMetricsSummary: typeof logMetricsSummary;
};
export default embeddingObservability;
//# sourceMappingURL=embedding-observability.d.ts.map