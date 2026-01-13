/**
 * Effect Metrics
 *
 * Observability for the humanization effects system.
 * Tracks effect firing rates, latencies, and outcomes.
 *
 * @module @ferni/conversation/effects/metrics
 */
export interface EffectMetricEvent {
    effectId: string;
    capability: string;
    outcome: 'applied' | 'skipped' | 'error';
    reason?: string;
    latencyMs: number;
    turnNumber: number;
    personaId: string;
    sessionId: string;
}
export interface EffectMetricsSummary {
    totalEffectsApplied: number;
    totalEffectsSkipped: number;
    totalErrors: number;
    effectCounts: Record<string, number>;
    skipReasons: Record<string, number>;
    avgLatencyMs: number;
    p95LatencyMs: number;
}
declare class EffectMetricsCollector {
    private events;
    private maxEvents;
    /**
     * Record an effect application/skip event
     */
    record(event: EffectMetricEvent): void;
    /**
     * Record that an effect was successfully applied
     */
    recordApplied(effectId: string, capability: string, latencyMs: number, context: {
        turnNumber: number;
        personaId: string;
        sessionId: string;
    }): void;
    /**
     * Record that an effect was skipped
     */
    recordSkipped(effectId: string, capability: string, reason: string, context: {
        turnNumber: number;
        personaId: string;
        sessionId: string;
    }): void;
    /**
     * Record an effect error
     */
    recordError(effectId: string, capability: string, error: string, context: {
        turnNumber: number;
        personaId: string;
        sessionId: string;
    }): void;
    /**
     * Get metrics summary
     */
    getSummary(windowMinutes?: number): EffectMetricsSummary;
    /**
     * Get events for a specific session
     */
    getSessionEvents(sessionId: string): EffectMetricEvent[];
    /**
     * Clear all events
     */
    clear(): void;
    /**
     * Export for Prometheus format
     */
    toPrometheusFormat(): string;
}
export declare function getEffectMetrics(): EffectMetricsCollector;
export declare function resetEffectMetrics(): void;
export declare const effectMetrics: {
    recordApplied: (effectId: string, capability: string, latencyMs: number, context: {
        turnNumber: number;
        personaId: string;
        sessionId: string;
    }) => void;
    recordSkipped: (effectId: string, capability: string, reason: string, context: {
        turnNumber: number;
        personaId: string;
        sessionId: string;
    }) => void;
    recordError: (effectId: string, capability: string, error: string, context: {
        turnNumber: number;
        personaId: string;
        sessionId: string;
    }) => void;
    getSummary: (windowMinutes?: number) => EffectMetricsSummary;
    toPrometheus: () => string;
};
export {};
//# sourceMappingURL=metrics.d.ts.map