/**
 * Semantic Router Metrics
 *
 * Collects and reports metrics for semantic routing.
 * Used for analytics, debugging, and optimization.
 *
 * Also feeds learning events to the Unified Intelligence Layer
 * for "Better Than Human" continuous improvement.
 *
 * @module tools/semantic-router/integration/metrics
 */
export interface RoutingMetric {
    timestamp: Date;
    userId: string;
    sessionId: string;
    userInput: string;
    toolId: string | null;
    confidence: number;
    matchPath: 'pattern' | 'keyword' | 'embedding' | 'combined' | 'none';
    action: 'execute' | 'hint' | 'conversation' | 'error';
    latencyMs: number;
    cacheHit: boolean;
    success: boolean;
    error?: string;
}
export interface AggregateMetrics {
    totalRoutes: number;
    successfulRoutes: number;
    bypassedLLM: number;
    hints: number;
    conversations: number;
    errors: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    cacheHitRate: number;
    toolBreakdown: Record<string, number>;
    matchPathBreakdown: Record<string, number>;
}
/**
 * Record a routing metric
 */
export declare function recordRoutingMetric(metric: Omit<RoutingMetric, 'timestamp'>): void;
/**
 * Record a successful LLM bypass
 */
export declare function recordLLMBypass(userId: string, sessionId: string, userInput: string, toolId: string, confidence: number, matchPath: string, latencyMs: number, cacheHit: boolean): void;
/**
 * Record a hint added to LLM context
 */
export declare function recordHintAdded(userId: string, sessionId: string, userInput: string, toolId: string, confidence: number, matchPath: string, latencyMs: number): void;
/**
 * Record no tool match (pure conversation)
 */
export declare function recordConversation(userId: string, sessionId: string, userInput: string, latencyMs: number): void;
/**
 * Record a routing error
 */
export declare function recordRoutingError(userId: string, sessionId: string, userInput: string, error: string, latencyMs: number): void;
/**
 * Record a learning event when semantic router was corrected
 *
 * This closes the learning loop - corrections feed into the
 * Unified Intelligence Layer for continuous improvement.
 *
 * @example
 * // Semantic router predicted "spotify_play" but user wanted "apple_music_play"
 * recordLearningEvent({
 *   userId: 'user123',
 *   sessionId: 'session456',
 *   query: 'play some jazz',
 *   predictedTool: 'spotify_play',
 *   actualTool: 'apple_music_play',
 *   confidence: 0.85,
 *   wasCorrection: true,
 * });
 */
export declare function recordLearningEvent(event: {
    userId: string;
    sessionId: string;
    query: string;
    predictedTool: string;
    actualTool: string;
    confidence: number;
    wasCorrection: boolean;
    personaId?: string;
}): Promise<void>;
/**
 * Record a successful tool execution (confirmation of prediction)
 */
export declare function recordToolSuccess(userId: string, sessionId: string, query: string, toolId: string, confidence: number, personaId?: string): Promise<void>;
/**
 * Record a tool correction (user chose different tool)
 */
export declare function recordToolCorrection(userId: string, sessionId: string, query: string, predictedTool: string, actualTool: string, confidence: number, personaId?: string): Promise<void>;
/**
 * Get recent metrics
 */
export declare function getRecentMetrics(limit?: number): RoutingMetric[];
/**
 * Get aggregate metrics
 */
export declare function getAggregateMetrics(since?: Date): AggregateMetrics;
/**
 * Get metrics for a specific user
 */
export declare function getUserMetrics(userId: string, limit?: number): RoutingMetric[];
/**
 * Get metrics for a specific tool
 */
export declare function getToolMetrics(toolId: string, limit?: number): RoutingMetric[];
/**
 * Clear all metrics (for testing)
 */
export declare function clearMetrics(): void;
/**
 * Get data for a metrics dashboard
 */
export declare function getDashboardData(): {
    aggregate: AggregateMetrics;
    recent: RoutingMetric[];
    hourly: Array<{
        hour: number;
        count: number;
        avgLatency: number;
    }>;
};
//# sourceMappingURL=metrics.d.ts.map