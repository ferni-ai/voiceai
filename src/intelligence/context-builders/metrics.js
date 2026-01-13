/**
 * Context Builder Metrics & Observability
 *
 * Tracks performance and usage of context builders for:
 * - Performance optimization (which builders are slow?)
 * - Debugging (which builders fired for this turn?)
 * - Analytics (which builders produce the most value?)
 *
 * @module intelligence/context-builders/metrics
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'context-builder-metrics' });
// ============================================================================
// METRICS STORAGE
// ============================================================================
const builderMetrics = new Map();
const recentTurnMetrics = [];
const MAX_TURN_HISTORY = 100;
// ============================================================================
// METRICS RECORDING
// ============================================================================
/**
 * Record metrics for a builder execution
 */
export function recordBuilderMetrics(name, durationMs, injectionCount, error) {
    let metrics = builderMetrics.get(name);
    if (!metrics) {
        metrics = {
            name,
            callCount: 0,
            totalDurationMs: 0,
            avgDurationMs: 0,
            injectionsProduced: 0,
            skipCount: 0,
            errorCount: 0,
        };
        builderMetrics.set(name, metrics);
    }
    metrics.callCount++;
    metrics.totalDurationMs += durationMs;
    metrics.avgDurationMs = metrics.totalDurationMs / metrics.callCount;
    metrics.injectionsProduced += injectionCount;
    metrics.lastCallTimestamp = new Date();
    metrics.lastDurationMs = durationMs;
    metrics.lastInjectionsCount = injectionCount;
    if (error) {
        metrics.errorCount++;
    }
    else if (injectionCount === 0) {
        metrics.skipCount++;
    }
    // Log slow builders
    if (durationMs > 100) {
        log.warn({ builder: name, durationMs }, 'Slow context builder detected');
    }
}
/**
 * Record metrics for an entire turn
 */
export function recordTurnMetrics(sessionId, turnNumber, builderResults) {
    const totalDurationMs = builderResults.reduce((sum, b) => sum + b.durationMs, 0);
    const buildersProducedInjections = builderResults.filter((b) => b.injectionCount > 0).length;
    const totalInjections = builderResults.reduce((sum, b) => sum + b.injectionCount, 0);
    const turnMetrics = {
        turnNumber,
        sessionId,
        totalDurationMs,
        buildersRan: builderResults.length,
        buildersProducedInjections,
        totalInjections,
        builderBreakdown: builderResults.map((b) => ({
            name: b.name,
            durationMs: b.durationMs,
            injectionCount: b.injectionCount,
            skipped: b.injectionCount === 0 && !b.error,
            error: b.error,
        })),
        timestamp: new Date(),
    };
    recentTurnMetrics.push(turnMetrics);
    if (recentTurnMetrics.length > MAX_TURN_HISTORY) {
        recentTurnMetrics.shift();
    }
    // Log turn summary
    log.debug({
        sessionId,
        turnNumber,
        totalDurationMs,
        buildersRan: builderResults.length,
        injections: totalInjections,
    }, 'Context build complete');
    return turnMetrics;
}
// ============================================================================
// METRICS RETRIEVAL
// ============================================================================
/**
 * Get metrics for a specific builder
 */
export function getBuilderMetrics(name) {
    return builderMetrics.get(name);
}
/**
 * Get metrics for all builders
 */
export function getAllBuilderMetrics() {
    return Array.from(builderMetrics.values());
}
/**
 * Get recent turn metrics
 */
export function getRecentTurnMetrics(limit = 10) {
    return recentTurnMetrics.slice(-limit);
}
/**
 * Get metrics summary
 */
export function getMetricsSummary() {
    const allMetrics = getAllBuilderMetrics();
    if (allMetrics.length === 0) {
        return {
            totalBuilds: 0,
            avgBuildTimeMs: 0,
            slowestBuilders: [],
            mostActiveBuilders: [],
            highestSkipRate: [],
            errorProneBuilders: [],
        };
    }
    const totalBuilds = recentTurnMetrics.length;
    const avgBuildTimeMs = totalBuilds > 0
        ? recentTurnMetrics.reduce((sum, t) => sum + t.totalDurationMs, 0) / totalBuilds
        : 0;
    // Slowest builders (by average)
    const slowestBuilders = [...allMetrics]
        .filter((m) => m.callCount > 0)
        .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
        .slice(0, 5)
        .map((m) => ({ name: m.name, avgMs: Math.round(m.avgDurationMs) }));
    // Most active builders (produce most injections per call)
    const mostActiveBuilders = [...allMetrics]
        .filter((m) => m.callCount > 0)
        .map((m) => ({
        name: m.name,
        avgInjections: m.injectionsProduced / m.callCount,
    }))
        .sort((a, b) => b.avgInjections - a.avgInjections)
        .slice(0, 5);
    // Highest skip rate
    const highestSkipRate = [...allMetrics]
        .filter((m) => m.callCount >= 5) // Need enough calls
        .map((m) => ({
        name: m.name,
        skipRate: m.skipCount / m.callCount,
    }))
        .sort((a, b) => b.skipRate - a.skipRate)
        .slice(0, 5);
    // Error-prone builders
    const errorProneBuilders = [...allMetrics]
        .filter((m) => m.errorCount > 0)
        .map((m) => ({
        name: m.name,
        errorRate: m.errorCount / m.callCount,
    }))
        .sort((a, b) => b.errorRate - a.errorRate)
        .slice(0, 5);
    return {
        totalBuilds,
        avgBuildTimeMs: Math.round(avgBuildTimeMs),
        slowestBuilders,
        mostActiveBuilders,
        highestSkipRate,
        errorProneBuilders,
    };
}
/**
 * Get metrics for a specific session
 */
export function getSessionMetrics(sessionId) {
    const sessionTurns = recentTurnMetrics.filter((t) => t.sessionId === sessionId);
    const avgDurationMs = sessionTurns.length > 0
        ? sessionTurns.reduce((sum, t) => sum + t.totalDurationMs, 0) / sessionTurns.length
        : 0;
    const totalInjections = sessionTurns.reduce((sum, t) => sum + t.totalInjections, 0);
    return {
        turns: sessionTurns,
        avgDurationMs: Math.round(avgDurationMs),
        totalInjections,
    };
}
// ============================================================================
// METRICS RESET
// ============================================================================
/**
 * Reset all metrics (for testing)
 */
export function resetAllMetrics() {
    builderMetrics.clear();
    recentTurnMetrics.length = 0;
}
/**
 * Reset metrics for a specific builder
 */
export function resetBuilderMetrics(name) {
    builderMetrics.delete(name);
}
// ============================================================================
// PERFORMANCE ALERTS
// ============================================================================
/**
 * Check for performance issues and return warnings
 */
export function checkPerformanceIssues() {
    const warnings = [];
    const summary = getMetricsSummary();
    // Warn about slow average build time
    if (summary.avgBuildTimeMs > 200) {
        warnings.push(`Average context build time is ${summary.avgBuildTimeMs}ms (target: <200ms)`);
    }
    // Warn about very slow individual builders
    for (const builder of summary.slowestBuilders) {
        if (builder.avgMs > 50) {
            warnings.push(`Builder "${builder.name}" averaging ${builder.avgMs}ms`);
        }
    }
    // Warn about high skip rates (might indicate unnecessary builders)
    for (const builder of summary.highestSkipRate) {
        if (builder.skipRate > 0.9) {
            warnings.push(`Builder "${builder.name}" skips ${Math.round(builder.skipRate * 100)}% of the time`);
        }
    }
    // Warn about errors
    for (const builder of summary.errorProneBuilders) {
        warnings.push(`Builder "${builder.name}" has ${Math.round(builder.errorRate * 100)}% error rate`);
    }
    return warnings;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordBuilderMetrics,
    recordTurnMetrics,
    getBuilderMetrics,
    getAllBuilderMetrics,
    getRecentTurnMetrics,
    getMetricsSummary,
    getSessionMetrics,
    resetAllMetrics,
    resetBuilderMetrics,
    checkPerformanceIssues,
};
//# sourceMappingURL=metrics.js.map