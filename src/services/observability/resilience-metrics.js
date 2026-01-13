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
import { getLogger } from '../../utils/safe-logger.js';
import { registerCircuitBreakerCallback } from '../../utils/circuit-breaker.js';
const log = getLogger();
// ============================================================================
// RESILIENCE METRICS SERVICE
// ============================================================================
export class ResilienceMetricsService {
    workerEvents = [];
    cleanupEvents = [];
    queueMetrics = [];
    circuitBreakerEvents = [];
    healthCheckEvents = [];
    scalingEvents = [];
    sessionEvictionEvents = [];
    MAX_EVENTS = 5000;
    WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    // Current state tracking
    circuitBreakerStates = new Map();
    currentInstances = 1;
    // ============================================================================
    // WORKER METRICS
    // ============================================================================
    recordWorkerEvent(workerName, event, durationMs, success, errorMessage) {
        const record = {
            id: `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            workerName,
            event,
            durationMs,
            success,
            errorMessage,
        };
        this.workerEvents.push(record);
        this.trimEvents(this.workerEvents);
        if (!success || event === 'timeout') {
            log.warn({ workerName, event, durationMs, errorMessage }, 'Worker event failure');
        }
        else {
            log.debug({ workerName, event, durationMs }, 'Worker event recorded');
        }
    }
    // ============================================================================
    // CLEANUP METRICS
    // ============================================================================
    recordCleanupEvent(sessionId, durationMs, success, timedOut, groupsCompleted, groupsFailed) {
        const record = {
            id: `cleanup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            sessionId,
            durationMs,
            success,
            timedOut,
            groupsCompleted,
            groupsFailed,
        };
        this.cleanupEvents.push(record);
        this.trimEvents(this.cleanupEvents);
        if (timedOut) {
            log.warn({ sessionId, durationMs }, 'Session cleanup timed out');
        }
        else if (!success) {
            log.warn({ sessionId, durationMs, groupsFailed }, 'Session cleanup failed');
        }
    }
    // ============================================================================
    // QUEUE METRICS
    // ============================================================================
    recordQueueMetric(queueName, depth, oldestMessageAgeMs, processedPerSecond, backpressureActive) {
        const record = {
            id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            queueName,
            depth,
            oldestMessageAgeMs,
            processedPerSecond,
            backpressureActive,
        };
        this.queueMetrics.push(record);
        this.trimEvents(this.queueMetrics);
        if (backpressureActive) {
            log.warn({ queueName, depth, oldestMessageAgeMs }, 'Queue backpressure active');
        }
    }
    // ============================================================================
    // CIRCUIT BREAKER METRICS
    // ============================================================================
    recordCircuitBreakerEvent(serviceName, state, failureCount, successCount, lastFailureReason) {
        const previousState = this.circuitBreakerStates.get(serviceName) || 'closed';
        const record = {
            id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            serviceName,
            state,
            previousState,
            failureCount,
            successCount,
            lastFailureReason,
        };
        this.circuitBreakerEvents.push(record);
        this.trimEvents(this.circuitBreakerEvents);
        this.circuitBreakerStates.set(serviceName, state);
        if (state === 'open' && previousState !== 'open') {
            log.error({ serviceName, failureCount, lastFailureReason }, 'Circuit breaker OPENED');
        }
        else if (state === 'closed' && previousState === 'open') {
            log.info({ serviceName, successCount }, 'Circuit breaker CLOSED (recovered)');
        }
    }
    // ============================================================================
    // HEALTH CHECK METRICS
    // ============================================================================
    recordHealthCheck(endpoint, healthy, latencyMs, statusCode, workersReady, errorMessage) {
        const record = {
            id: `health_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            endpoint,
            healthy,
            latencyMs,
            statusCode,
            workersReady: workersReady ?? healthy,
            errorMessage,
        };
        this.healthCheckEvents.push(record);
        this.trimEvents(this.healthCheckEvents);
        if (!healthy) {
            log.warn({ endpoint, statusCode, errorMessage, latencyMs }, 'Health check failed');
        }
    }
    // ============================================================================
    // SCALING METRICS
    // ============================================================================
    recordScalingEvent(direction, trigger, previousInstances, targetInstances, reason) {
        const record = {
            id: `scale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            direction,
            trigger,
            previousInstances,
            targetInstances,
            reason,
        };
        this.scalingEvents.push(record);
        this.trimEvents(this.scalingEvents);
        this.currentInstances = targetInstances;
        log.info({ direction, trigger, previousInstances, targetInstances, reason }, 'Scaling event');
    }
    // ============================================================================
    // SESSION EVICTION METRICS
    // ============================================================================
    recordSessionEviction(evictedCount, remainingSessions, reason, oldestSessionAgeMs) {
        const record = {
            id: `evict_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            evictedCount,
            remainingSessions,
            reason,
            oldestSessionAgeMs,
        };
        this.sessionEvictionEvents.push(record);
        this.trimEvents(this.sessionEvictionEvents);
        if (reason === 'capacity') {
            log.warn({ evictedCount, remainingSessions, oldestSessionAgeMs }, 'Session eviction due to capacity limit');
        }
        else if (evictedCount > 0) {
            log.debug({ evictedCount, remainingSessions }, 'Session eviction due to TTL expiration');
        }
    }
    // ============================================================================
    // SNAPSHOT
    // ============================================================================
    getSnapshot() {
        const now = Date.now();
        const windowStart = now - this.WINDOW_MS;
        // Filter to window
        const recentWorkerEvents = this.workerEvents.filter((e) => e.timestamp >= windowStart);
        const recentCleanupEvents = this.cleanupEvents.filter((e) => e.timestamp >= windowStart);
        const recentQueueMetrics = this.queueMetrics.filter((e) => e.timestamp >= windowStart);
        const recentCircuitEvents = this.circuitBreakerEvents.filter((e) => e.timestamp >= windowStart);
        const recentHealthEvents = this.healthCheckEvents.filter((e) => e.timestamp >= windowStart);
        const recentScalingEvents = this.scalingEvents.filter((e) => e.timestamp >= windowStart);
        // Worker metrics
        const startupEvents = recentWorkerEvents.filter((e) => e.event === 'startup');
        const workerStartupTimes = startupEvents.map((e) => e.durationMs);
        const workerTimeouts = recentWorkerEvents.filter((e) => e.event === 'timeout').length;
        // Cleanup metrics
        const cleanupTimes = recentCleanupEvents.map((e) => e.durationMs);
        const cleanupTimeouts = recentCleanupEvents.filter((e) => e.timedOut).length;
        const cleanupSuccesses = recentCleanupEvents.filter((e) => e.success).length;
        // Queue metrics
        const queueDepths = recentQueueMetrics.map((e) => e.depth);
        const backpressureEvents = recentQueueMetrics.filter((e) => e.backpressureActive).length;
        const processingRates = recentQueueMetrics.map((e) => e.processedPerSecond);
        // Circuit breaker metrics
        const openBreakers = Array.from(this.circuitBreakerStates.entries()).filter(([, state]) => state === 'open').length;
        const trips = recentCircuitEvents.filter((e) => e.state === 'open' && e.previousState !== 'open').length;
        // Health check metrics
        const healthSuccesses = recentHealthEvents.filter((e) => e.healthy).length;
        const healthLatencies = recentHealthEvents.map((e) => e.latencyMs);
        const lastHealthCheck = recentHealthEvents[recentHealthEvents.length - 1];
        // Scaling metrics
        const scaleUpEvents = recentScalingEvents.filter((e) => e.direction === 'up').length;
        const scaleDownEvents = recentScalingEvents.filter((e) => e.direction === 'down').length;
        const lastScaling = this.scalingEvents[this.scalingEvents.length - 1];
        // Session eviction metrics
        const recentEvictionEvents = this.sessionEvictionEvents.filter((e) => e.timestamp >= windowStart);
        const evictionsByTTL = recentEvictionEvents
            .filter((e) => e.reason === 'ttl')
            .reduce((sum, e) => sum + e.evictedCount, 0);
        const evictionsByCapacity = recentEvictionEvents
            .filter((e) => e.reason === 'capacity')
            .reduce((sum, e) => sum + e.evictedCount, 0);
        return {
            // Worker health
            workerStartupAvgMs: this.avg(workerStartupTimes),
            workerStartupP95Ms: this.percentile(workerStartupTimes, 95),
            workerTimeouts,
            workersHealthy: startupEvents.filter((e) => e.success).length,
            workersTotal: startupEvents.length,
            // Session cleanup
            cleanupAvgMs: this.avg(cleanupTimes),
            cleanupP95Ms: this.percentile(cleanupTimes, 95),
            cleanupTimeouts,
            cleanupSuccessRate: recentCleanupEvents.length > 0 ? cleanupSuccesses / recentCleanupEvents.length : 1,
            // Queue health
            maxQueueDepth: Math.max(0, ...queueDepths),
            avgQueueDepth: this.avg(queueDepths),
            backpressureEvents,
            queueProcessingRate: this.avg(processingRates),
            // Circuit breakers
            circuitBreakersOpen: openBreakers,
            circuitBreakerTrips: trips,
            circuitBreakersByService: Object.fromEntries(this.circuitBreakerStates),
            // Health checks
            healthCheckSuccessRate: recentHealthEvents.length > 0 ? healthSuccesses / recentHealthEvents.length : 1,
            healthCheckAvgLatencyMs: this.avg(healthLatencies),
            lastHealthCheckTime: lastHealthCheck?.timestamp ?? 0,
            lastHealthCheckHealthy: lastHealthCheck?.healthy ?? true,
            // Scaling
            currentInstances: this.currentInstances,
            scaleUpEvents,
            scaleDownEvents,
            lastScalingEvent: lastScaling,
            // Session evictions
            sessionEvictionsByTTL: evictionsByTTL,
            sessionEvictionsByCapacity: evictionsByCapacity,
            totalSessionsEvicted: evictionsByTTL + evictionsByCapacity,
            // Time window
            windowStartTime: windowStart,
            windowEndTime: now,
        };
    }
    // ============================================================================
    // HELPERS
    // ============================================================================
    trimEvents(events) {
        if (events.length > this.MAX_EVENTS) {
            events.splice(0, events.length - this.MAX_EVENTS);
        }
    }
    avg(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
    percentile(values, p) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)] ?? 0;
    }
    /**
     * Reset all metrics (for testing)
     */
    reset() {
        this.workerEvents = [];
        this.cleanupEvents = [];
        this.queueMetrics = [];
        this.circuitBreakerEvents = [];
        this.healthCheckEvents = [];
        this.scalingEvents = [];
        this.sessionEvictionEvents = [];
        this.circuitBreakerStates.clear();
        this.currentInstances = 1;
    }
    /**
     * Record bulkhead rejection event (used by TTS bulkhead)
     */
    recordBulkheadRejection(service, reason) {
        // Record as a circuit breaker event with rejection reason
        this.recordCircuitBreakerEvent(service, 'half-open', // Bulkhead rejection moves to half-open state
        1, // failure count
        0, // success count
        `Bulkhead rejection: ${reason}`);
    }
    /**
     * Record circuit breaker state change with latency (used by TTS bulkhead)
     */
    recordCircuitBreakerState(service, state, latencyMs) {
        this.recordCircuitBreakerEvent(service, state, state === 'open' ? 1 : 0, // failure count
        state === 'closed' ? 1 : 0, // success count
        `State change, latency: ${latencyMs}ms`);
    }
}
// ============================================================================
// SINGLETON EXPORT
// ============================================================================
export const resilienceMetrics = new ResilienceMetricsService();
// ============================================================================
// CIRCUIT BREAKER INTEGRATION
// ============================================================================
// Register callback to receive circuit breaker state changes from utils layer
// This follows proper architecture: services layer registers with utils layer
registerCircuitBreakerCallback((name, state, failures, successes, reason) => {
    resilienceMetrics.recordCircuitBreakerEvent(name, state, failures, successes, reason);
});
//# sourceMappingURL=resilience-metrics.js.map