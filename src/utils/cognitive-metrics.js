/**
 * Cognitive Intelligence Performance Metrics
 *
 * Tracks performance of cognitive processing to ensure
 * it doesn't add latency to voice responses.
 *
 * Key metrics:
 * - Cognitive context building time
 * - Speech adjustment calculation time
 * - User style detection time
 * - Total cognitive overhead
 */
import { getLogger } from './safe-logger.js';
let broadcastCallback = null;
/**
 * Register a callback to receive cognitive metrics broadcasts.
 * This allows the services layer to hook into metrics broadcasts.
 *
 * @example
 * // In services/cognitive-broadcast.ts:
 * import { registerCognitiveMetricsBroadcast } from '../utils/cognitive-metrics.js';
 *
 * registerCognitiveMetricsBroadcast((metrics) => {
 *   broadcastMetrics(metrics);
 * });
 */
export function registerCognitiveMetricsBroadcast(callback) {
    broadcastCallback = callback;
}
/**
 * Clear the registered callback (for testing).
 */
export function clearCognitiveMetricsBroadcast() {
    broadcastCallback = null;
}
// ============================================================================
// METRICS TRACKER
// ============================================================================
class CognitiveMetricsTracker {
    metrics = [];
    maxSamples = 1000;
    currentMetric = {};
    startTimes = new Map();
    /**
     * Start timing a cognitive operation
     */
    startTiming(operation) {
        this.startTimes.set(operation, performance.now());
    }
    /**
     * End timing a cognitive operation
     */
    endTiming(operation) {
        const startTime = this.startTimes.get(operation);
        if (!startTime)
            return 0;
        const duration = performance.now() - startTime;
        this.currentMetric[operation] = duration;
        this.startTimes.delete(operation);
        return duration;
    }
    /**
     * Record the current metrics and reset
     */
    recordMetrics() {
        const metric = {
            contextBuildTime: this.currentMetric.contextBuildTime || 0,
            speechAdjustTime: this.currentMetric.speechAdjustTime || 0,
            userStyleDetectTime: this.currentMetric.userStyleDetectTime || 0,
            quirkActivationTime: this.currentMetric.quirkActivationTime || 0,
            voiceEmotionTime: this.currentMetric.voiceEmotionTime || 0,
            totalOverhead: 0,
            timestamp: new Date(),
        };
        // Calculate total overhead
        metric.totalOverhead =
            metric.contextBuildTime +
                metric.speechAdjustTime +
                metric.userStyleDetectTime +
                metric.quirkActivationTime +
                metric.voiceEmotionTime;
        // Store metric
        this.metrics.push(metric);
        if (this.metrics.length > this.maxSamples) {
            this.metrics.shift();
        }
        // Log if overhead is high
        if (metric.totalOverhead > 100) {
            getLogger().warn({
                totalOverhead: metric.totalOverhead,
                contextBuildTime: metric.contextBuildTime,
                speechAdjustTime: metric.speechAdjustTime,
            }, '⚠️ High cognitive overhead detected');
        }
        // Reset current metric
        this.currentMetric = {};
        return metric;
    }
    /**
     * Get metrics summary
     */
    getSummary() {
        if (this.metrics.length === 0) {
            return {
                sampleCount: 0,
                avgTotalOverhead: 0,
                p95TotalOverhead: 0,
                maxTotalOverhead: 0,
                avgContextBuildTime: 0,
                avgSpeechAdjustTime: 0,
                under50msPercentage: 0,
                under100msPercentage: 0,
            };
        }
        const totalOverheads = this.metrics.map((m) => m.totalOverhead).sort((a, b) => a - b);
        const contextTimes = this.metrics.map((m) => m.contextBuildTime);
        const speechTimes = this.metrics.map((m) => m.speechAdjustTime);
        const sum = (arr) => arr.reduce((a, b) => a + b, 0);
        const avg = (arr) => sum(arr) / arr.length;
        const p95Index = Math.floor(totalOverheads.length * 0.95);
        return {
            sampleCount: this.metrics.length,
            avgTotalOverhead: avg(totalOverheads),
            p95TotalOverhead: totalOverheads[p95Index] || 0,
            maxTotalOverhead: Math.max(...totalOverheads),
            avgContextBuildTime: avg(contextTimes),
            avgSpeechAdjustTime: avg(speechTimes),
            under50msPercentage: (totalOverheads.filter((t) => t < 50).length / totalOverheads.length) * 100,
            under100msPercentage: (totalOverheads.filter((t) => t < 100).length / totalOverheads.length) * 100,
        };
    }
    /**
     * Get recent metrics
     */
    getRecentMetrics(count = 10) {
        return this.metrics.slice(-count);
    }
    /**
     * Clear all metrics (for testing)
     */
    clear() {
        this.metrics = [];
        this.currentMetric = {};
        this.startTimes.clear();
    }
    /**
     * Log metrics summary
     */
    logSummary() {
        const summary = this.getSummary();
        getLogger().info({
            sampleCount: summary.sampleCount,
            avgOverhead: `${summary.avgTotalOverhead.toFixed(1)}ms`,
            p95Overhead: `${summary.p95TotalOverhead.toFixed(1)}ms`,
            maxOverhead: `${summary.maxTotalOverhead.toFixed(1)}ms`,
            under50ms: `${summary.under50msPercentage.toFixed(1)}%`,
            under100ms: `${summary.under100msPercentage.toFixed(1)}%`,
        }, '🧠 Cognitive Metrics Summary');
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const cognitiveMetrics = new CognitiveMetricsTracker();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Time a function and record its duration
 */
export async function timeCognitiveOperation(operation, fn) {
    cognitiveMetrics.startTiming(operation);
    try {
        return await fn();
    }
    finally {
        cognitiveMetrics.endTiming(operation);
    }
}
/**
 * Time a synchronous function
 */
export function timeCognitiveOperationSync(operation, fn) {
    cognitiveMetrics.startTiming(operation);
    try {
        return fn();
    }
    finally {
        cognitiveMetrics.endTiming(operation);
    }
}
/**
 * Record metrics for this turn and get summary
 */
export function recordTurnMetrics() {
    return cognitiveMetrics.recordMetrics();
}
/**
 * Get current cognitive metrics summary
 */
export function getCognitiveMetricsSummary() {
    return cognitiveMetrics.getSummary();
}
/**
 * Log cognitive metrics periodically (e.g., every 50 turns)
 */
let turnsSinceLog = 0;
const LOG_INTERVAL = 50;
const BROADCAST_INTERVAL = 10;
export function maybeLogMetrics() {
    turnsSinceLog++;
    if (turnsSinceLog >= LOG_INTERVAL) {
        cognitiveMetrics.logSummary();
        turnsSinceLog = 0;
    }
}
/**
 * Broadcast metrics to dashboard (every 10 turns)
 */
let turnsSinceBroadcast = 0;
export function maybeBroadcastMetrics() {
    turnsSinceBroadcast++;
    if (turnsSinceBroadcast >= BROADCAST_INTERVAL) {
        if (broadcastCallback) {
            const summary = cognitiveMetrics.getSummary();
            broadcastCallback({
                avgTotalOverhead: summary.avgTotalOverhead,
                p95TotalOverhead: summary.p95TotalOverhead,
                maxTotalOverhead: summary.maxTotalOverhead,
                under50msPercentage: summary.under50msPercentage,
                under100msPercentage: summary.under100msPercentage,
                samplesCount: summary.sampleCount,
            });
        }
        turnsSinceBroadcast = 0;
    }
}
export default {
    cognitiveMetrics,
    timeCognitiveOperation,
    timeCognitiveOperationSync,
    recordTurnMetrics,
    getCognitiveMetricsSummary,
    maybeLogMetrics,
    maybeBroadcastMetrics,
    registerCognitiveMetricsBroadcast,
    clearCognitiveMetricsBroadcast,
};
//# sourceMappingURL=cognitive-metrics.js.map