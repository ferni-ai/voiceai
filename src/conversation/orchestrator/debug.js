/**
 * Orchestrator Debug & Monitoring Utilities
 *
 * Provides real-time inspection and debugging capabilities:
 * - Live metrics dashboard data
 * - Session state inspection
 * - Feature toggle testing
 * - Performance profiling
 * - Session replay/export
 *
 * @module @ferni/conversation/orchestrator/debug
 */
import { createLogger } from '../../utils/safe-logger.js';
import { orchestratorConfig } from './config-adapter.js';
import { getAggregatedMetrics, getMetricsCollector } from './metrics.js';
import { getPerformanceStats } from './performance.js';
const log = createLogger({ module: 'OrchestratorDebug' });
// ============================================================================
// SESSION RECORDER
// ============================================================================
class SessionRecorder {
    records = new Map();
    maxRecordsPerSession = 100;
    /**
     * Record an orchestration
     */
    record(sessionId, input, output) {
        if (!this.records.has(sessionId)) {
            this.records.set(sessionId, []);
        }
        const records = this.records.get(sessionId);
        records.push({
            turn: input.turnNumber,
            timestamp: Date.now(),
            input: {
                userMessage: input.userMessage.slice(0, 100), // Truncate for privacy
                userEmotion: input.userEmotion,
                topic: input.topic,
                wasPersonalSharing: input.wasPersonalSharing,
            },
            output: {
                appliedFeatures: output.appliedFeatures,
                pacing: output.pacing,
                confidence: output.metadata.confidence.overall,
            },
            timing: output.metadata.timing,
        });
        // Trim to max size
        if (records.length > this.maxRecordsPerSession) {
            records.shift();
        }
    }
    /**
     * Get records for a session
     */
    getRecords(sessionId) {
        return this.records.get(sessionId) || [];
    }
    /**
     * Clear records for a session
     */
    clearSession(sessionId) {
        this.records.delete(sessionId);
    }
    /**
     * Clear all records
     */
    clearAll() {
        this.records.clear();
    }
    /**
     * Export records as JSON
     */
    export(sessionId) {
        const records = this.getRecords(sessionId);
        return JSON.stringify(records, null, 2);
    }
}
// Singleton recorder
const sessionRecorder = new SessionRecorder();
// ============================================================================
// HEALTH CHECK
// ============================================================================
/**
 * Calculate health indicators
 */
function calculateHealth(sessionId) {
    const metrics = getMetricsCollector(sessionId).getMetrics();
    const perfStats = getPerformanceStats();
    const issues = [];
    const recommendations = [];
    // Check latency
    const avgLatency = metrics.phases.total.avgMs;
    const p95Latency = metrics.phases.total.p95Ms;
    if (avgLatency > 100) {
        issues.push(`High average latency: ${avgLatency.toFixed(0)}ms`);
        recommendations.push('Consider enabling minimal preset for lower latency');
    }
    if (p95Latency > 200) {
        issues.push(`High p95 latency: ${p95Latency.toFixed(0)}ms`);
        recommendations.push('Check circuit breakers for slow systems');
    }
    // Check error rate
    const errorRate = metrics.errorRate;
    if (errorRate > 0.01) {
        issues.push(`Elevated error rate: ${(errorRate * 100).toFixed(1)}%`);
        recommendations.push('Review error logs for root cause');
    }
    // Check cache
    const cacheHitRate = metrics.cache.hitRate;
    if (cacheHitRate < 0.5 && metrics.totalOrchestrations > 10) {
        issues.push(`Low cache hit rate: ${(cacheHitRate * 100).toFixed(0)}%`);
        recommendations.push('Detection cache may not be effective');
    }
    // Check circuit breakers
    const cbStatus = perfStats.circuitBreakers;
    const openBreakers = Object.values(cbStatus).filter((b) => b.state === 'open');
    const circuitBreakerHealth = openBreakers.length === 0
        ? 'all_closed'
        : openBreakers.length === Object.keys(cbStatus).length
            ? 'all_open'
            : 'some_open';
    if (circuitBreakerHealth !== 'all_closed') {
        issues.push(`Circuit breakers open: ${openBreakers.map((b) => Object.entries(cbStatus).find(([, v]) => v === b)?.[0]).join(', ')}`);
        recommendations.push('Some intelligence systems are failing - check logs');
    }
    // Determine overall status
    let status = 'healthy';
    if (issues.length > 2 || errorRate > 0.05 || circuitBreakerHealth === 'all_open') {
        status = 'unhealthy';
    }
    else if (issues.length > 0) {
        status = 'degraded';
    }
    return {
        status,
        issues,
        recommendations,
        avgLatency,
        p95Latency,
        errorRate,
        cacheHitRate,
        circuitBreakerHealth,
    };
}
// ============================================================================
// DEBUG API
// ============================================================================
/**
 * Get complete debug snapshot
 */
export function getDebugSnapshot(sessionId, personaId = 'unknown') {
    const metrics = getMetricsCollector(sessionId, personaId).getMetrics();
    const perfStats = getPerformanceStats();
    const configState = orchestratorConfig.getState();
    const records = sessionRecorder.getRecords(sessionId);
    const health = calculateHealth(sessionId);
    return {
        timestamp: Date.now(),
        sessionId,
        personaId,
        config: configState,
        metrics,
        performance: {
            cacheSize: perfStats.detectionCacheSize,
            circuitBreakers: perfStats.circuitBreakers,
        },
        recentOrchestrations: records.slice(-10),
        health,
    };
}
/**
 * Get health status
 */
export function getHealthStatus(sessionId) {
    return calculateHealth(sessionId);
}
/**
 * Get aggregated system health across all sessions
 */
export function getSystemHealth() {
    const aggregated = getAggregatedMetrics();
    let status = 'healthy';
    if (aggregated.errorRate > 0.05) {
        status = 'unhealthy';
    }
    else if (aggregated.errorRate > 0.01 || aggregated.avgTotalMs > 150) {
        status = 'degraded';
    }
    return {
        activeSessions: aggregated.activeSessions,
        totalOrchestrations: aggregated.totalOrchestrations,
        avgLatency: aggregated.avgTotalMs,
        errorRate: aggregated.errorRate,
        status,
    };
}
/**
 * Record an orchestration for debugging
 */
export function recordOrchestration(sessionId, input, output) {
    sessionRecorder.record(sessionId, input, output);
}
/**
 * Get session records
 */
export function getSessionRecords(sessionId) {
    return sessionRecorder.getRecords(sessionId);
}
/**
 * Export session for analysis
 */
export function exportSession(sessionId) {
    return sessionRecorder.export(sessionId);
}
/**
 * Clear session records
 */
export function clearSessionRecords(sessionId) {
    if (sessionId) {
        sessionRecorder.clearSession(sessionId);
    }
    else {
        sessionRecorder.clearAll();
    }
}
// ============================================================================
// A/B TESTING
// ============================================================================
const abTests = new Map();
const userAssignments = new Map();
/**
 * Create an A/B test
 */
export function createABTest(config) {
    abTests.set(config.name, config);
    log.info({ testName: config.name, traffic: config.trafficPercentage }, '🧪 A/B test created');
}
/**
 * Get variant for a user in a test
 */
export function getABTestVariant(testName, userId) {
    const test = abTests.get(testName);
    if (!test || !test.enabled)
        return null;
    // Check if test is active
    const now = Date.now();
    if (now < test.startTime || (test.endTime && now > test.endTime)) {
        return null;
    }
    // Get or assign variant
    if (!userAssignments.has(testName)) {
        userAssignments.set(testName, new Map());
    }
    const assignments = userAssignments.get(testName);
    if (!assignments.has(userId)) {
        // Deterministic assignment based on hash
        const hash = hashString(`${testName}:${userId}`);
        const variant = hash < test.trafficPercentage ? 'treatment' : 'control';
        assignments.set(userId, variant);
    }
    const variant = assignments.get(userId);
    return {
        variant,
        config: test.variants[variant],
    };
}
/**
 * Get A/B test stats
 */
export function getABTestStats(testName) {
    const test = abTests.get(testName);
    if (!test)
        return null;
    const assignments = userAssignments.get(testName);
    if (!assignments) {
        return {
            controlCount: 0,
            treatmentCount: 0,
            controlMetrics: {},
            treatmentMetrics: {},
        };
    }
    let controlCount = 0;
    let treatmentCount = 0;
    for (const variant of assignments.values()) {
        if (variant === 'control')
            controlCount++;
        else
            treatmentCount++;
    }
    return {
        controlCount,
        treatmentCount,
        controlMetrics: {}, // Would aggregate metrics by variant
        treatmentMetrics: {},
    };
}
/**
 * End an A/B test
 */
export function endABTest(testName) {
    const test = abTests.get(testName);
    if (test) {
        test.enabled = false;
        test.endTime = Date.now();
        log.info({ testName }, '🧪 A/B test ended');
    }
}
/**
 * Clear A/B test data
 */
export function clearABTests() {
    abTests.clear();
    userAssignments.clear();
}
// ============================================================================
// PROFILING
// ============================================================================
/**
 * Profile an orchestration with detailed timing
 */
export async function profileOrchestration(name, fn) {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    log.debug({ name, durationMs: durationMs.toFixed(2) }, '⏱️ Profile');
    return { result, profile: { name, durationMs } };
}
/**
 * Create a profiler for detailed phase timing
 */
export function createProfiler() {
    const marks = [];
    let lastTimestamp = performance.now();
    return {
        mark(name) {
            const now = performance.now();
            marks.push({ name, timestamp: now });
            lastTimestamp = now;
        },
        getMarks() {
            let prev = marks[0]?.timestamp || 0;
            return marks.map((m) => {
                const delta = m.timestamp - prev;
                prev = m.timestamp;
                return { ...m, delta };
            });
        },
        reset() {
            marks.length = 0;
            lastTimestamp = performance.now();
        },
    };
}
// ============================================================================
// CONSOLE LOGGING HELPERS
// ============================================================================
/**
 * Log a formatted debug summary
 */
export function logDebugSummary(sessionId) {
    const snapshot = getDebugSnapshot(sessionId);
    log.info({
        session: sessionId,
        health: snapshot.health.status,
        orchestrations: snapshot.metrics.totalOrchestrations,
        avgLatency: `${snapshot.metrics.phases.total.avgMs.toFixed(0)}ms`,
        features: Object.keys(snapshot.metrics.features).length,
        cacheHitRate: `${(snapshot.metrics.cache.hitRate * 100).toFixed(0)}%`,
    }, '🔍 Debug Summary');
    if (snapshot.health.issues.length > 0) {
        log.warn({ issues: snapshot.health.issues }, '⚠️ Health Issues');
    }
}
/**
 * Log feature application stats
 */
export function logFeatureStats(sessionId) {
    const metrics = getMetricsCollector(sessionId).getMetrics();
    const featureStats = Object.entries(metrics.features)
        .map(([name, f]) => ({
        name,
        applied: f.applied,
        rate: `${(f.applicationRate * 100).toFixed(0)}%`,
    }))
        .sort((a, b) => b.applied - a.applied)
        .slice(0, 10);
    log.info({ features: featureStats }, '📊 Feature Stats');
}
// ============================================================================
// HELPERS
// ============================================================================
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash % 100);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const orchestratorDebug = {
    // Snapshots
    getSnapshot: getDebugSnapshot,
    getHealth: getHealthStatus,
    getSystemHealth,
    // Recording
    record: recordOrchestration,
    getRecords: getSessionRecords,
    export: exportSession,
    clearRecords: clearSessionRecords,
    // A/B Testing
    createTest: createABTest,
    getVariant: getABTestVariant,
    getTestStats: getABTestStats,
    endTest: endABTest,
    clearTests: clearABTests,
    // Profiling
    profile: profileOrchestration,
    createProfiler,
    // Logging
    logSummary: logDebugSummary,
    logFeatures: logFeatureStats,
};
//# sourceMappingURL=debug.js.map