/**
 * LLM Health Metrics
 *
 * Tracks AI/LLM performance and health:
 * - Token usage per response
 * - Context window utilization
 * - Rate limit proximity
 * - Model fallback events
 * - Response quality indicators
 */
export interface LLMCall {
    id: string;
    timestamp: number;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    contextWindowUsed: number;
    contextWindowMax: number;
    success: boolean;
    errorType?: string;
    isFallback: boolean;
    qualityScore?: number;
}
export interface LLMHealthSnapshot {
    avgTokensPerResponse: number;
    totalTokensUsed: number;
    tokenUsageByModel: Record<string, number>;
    avgContextUtilization: number;
    maxContextUtilization: number;
    contextTruncations: number;
    rateLimitProximity: number;
    rateLimitHits: number;
    requestsPerMinute: number;
    fallbackCount: number;
    fallbackRate: number;
    primaryModelSuccessRate: number;
    avgResponseQuality: number;
    lowQualityResponses: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    maxLatencyMs: number;
    errorRate: number;
    errorsByType: Record<string, number>;
    windowStartTime: number;
    windowEndTime: number;
    totalCalls: number;
}
declare class LLMHealthService {
    private calls;
    private readonly MAX_CALLS;
    private rateLimitQuota;
    private currentMinuteTokens;
    private minuteResetTime;
    /**
     * Record an LLM API call
     */
    recordCall(call: Omit<LLMCall, 'id' | 'timestamp'>): void;
    /**
     * Record a simple completion (convenience method)
     */
    recordCompletion(model: string, promptTokens: number, completionTokens: number, latencyMs: number, options?: {
        contextWindowUsed?: number;
        contextWindowMax?: number;
        success?: boolean;
        errorType?: string;
        isFallback?: boolean;
        qualityScore?: number;
    }): void;
    /**
     * Record an error
     */
    recordError(model: string, errorType: string, latencyMs: number): void;
    /**
     * Set rate limit quota
     */
    setRateLimitQuota(tokensPerMinute: number): void;
    /**
     * Update rate limit tracking
     */
    private updateRateLimitTracking;
    /**
     * Get current rate limit proximity (0-100)
     */
    getRateLimitProximity(): number;
    /**
     * Get health snapshot
     */
    getSnapshot(windowMinutes?: number): LLMHealthSnapshot;
    /**
     * Clear metrics
     */
    clear(): void;
}
export declare const llmHealthMetrics: LLMHealthService;
export {};
//# sourceMappingURL=llm-health.d.ts.map