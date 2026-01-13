/**
 * Resilience Metrics
 *
 * Tracks system resilience and scaling health:
 * - Worker startup/shutdown times
 * - Session cleanup latency
 * - Queue depths and backpressure
 * - Circuit breaker states
 * - Health check results
 * - Auto-scaling events
 *
 * @module observability/resilience-metrics
 */
export interface WorkerEvent {
    id: string;
    timestamp: number;
    workerName: string;
    event: 'startup' | 'shutdown' | 'timeout' | 'error';
    durationMs: number;
    success: boolean;
    errorMessage?: string;
}
export interface CleanupEvent {
    id: string;
    timestamp: number;
    sessionId: string;
    durationMs: number;
    success: boolean;
    timedOut: boolean;
    groupsCompleted: number;
    groupsFailed: number;
}
export interface QueueMetric {
    id: string;
    timestamp: number;
    queueName: string;
    depth: number;
    oldestMessageAgeMs: number;
    processedPerSecond: number;
    backpressureActive: boolean;
}
export interface CircuitBreakerEvent {
    id: string;
    timestamp: number;
    serviceName: string;
    state: 'closed' | 'open' | 'half-open';
    previousState: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    lastFailureReason?: string;
}
export interface HealthCheckEvent {
    id: string;
    timestamp: number;
    endpoint: string;
    healthy: boolean;
    latencyMs: number;
    statusCode?: number;
    workersReady: boolean;
    errorMessage?: string;
}
export interface ScalingEvent {
    id: string;
    timestamp: number;
    direction: 'up' | 'down';
    trigger: 'cpu' | 'connections' | 'queue_depth' | 'manual';
    previousInstances: number;
    targetInstances: number;
    reason: string;
}
export interface SessionEvictionEvent {
    id: string;
    timestamp: number;
    evictedCount: number;
    remainingSessions: number;
    reason: 'ttl' | 'capacity';
    oldestSessionAgeMs?: number;
}
export interface ResilienceSnapshot {
    workerStartupAvgMs: number;
    workerStartupP95Ms: number;
    workerTimeouts: number;
    workersHealthy: number;
    workersTotal: number;
    cleanupAvgMs: number;
    cleanupP95Ms: number;
    cleanupTimeouts: number;
    cleanupSuccessRate: number;
    maxQueueDepth: number;
    avgQueueDepth: number;
    backpressureEvents: number;
    queueProcessingRate: number;
    circuitBreakersOpen: number;
    circuitBreakerTrips: number;
    circuitBreakersByService: Record<string, 'closed' | 'open' | 'half-open'>;
    healthCheckSuccessRate: number;
    healthCheckAvgLatencyMs: number;
    lastHealthCheckTime: number;
    lastHealthCheckHealthy: boolean;
    currentInstances: number;
    scaleUpEvents: number;
    scaleDownEvents: number;
    lastScalingEvent?: ScalingEvent;
    sessionEvictionsByTTL: number;
    sessionEvictionsByCapacity: number;
    totalSessionsEvicted: number;
    windowStartTime: number;
    windowEndTime: number;
}
export declare class ResilienceMetricsService {
    private workerEvents;
    private cleanupEvents;
    private queueMetrics;
    private circuitBreakerEvents;
    private healthCheckEvents;
    private scalingEvents;
    private sessionEvictionEvents;
    private readonly MAX_EVENTS;
    private readonly WINDOW_MS;
    private circuitBreakerStates;
    private currentInstances;
    recordWorkerEvent(workerName: string, event: WorkerEvent['event'], durationMs: number, success: boolean, errorMessage?: string): void;
    recordCleanupEvent(sessionId: string, durationMs: number, success: boolean, timedOut: boolean, groupsCompleted: number, groupsFailed: number): void;
    recordQueueMetric(queueName: string, depth: number, oldestMessageAgeMs: number, processedPerSecond: number, backpressureActive: boolean): void;
    recordCircuitBreakerEvent(serviceName: string, state: CircuitBreakerEvent['state'], failureCount: number, successCount: number, lastFailureReason?: string): void;
    recordHealthCheck(endpoint: string, healthy: boolean, latencyMs: number, statusCode?: number, workersReady?: boolean, errorMessage?: string): void;
    recordScalingEvent(direction: 'up' | 'down', trigger: ScalingEvent['trigger'], previousInstances: number, targetInstances: number, reason: string): void;
    recordSessionEviction(evictedCount: number, remainingSessions: number, reason: 'ttl' | 'capacity', oldestSessionAgeMs?: number): void;
    getSnapshot(): ResilienceSnapshot;
    private trimEvents;
    private avg;
    private percentile;
    /**
     * Reset all metrics (for testing)
     */
    reset(): void;
    /**
     * Record bulkhead rejection event (used by TTS bulkhead)
     */
    recordBulkheadRejection(service: string, reason: string): void;
    /**
     * Record circuit breaker state change with latency (used by TTS bulkhead)
     */
    recordCircuitBreakerState(service: string, state: 'open' | 'closed' | 'half-open', latencyMs: number): void;
}
export declare const resilienceMetrics: ResilienceMetricsService;
//# sourceMappingURL=resilience-metrics.d.ts.map