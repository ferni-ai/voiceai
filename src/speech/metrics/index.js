/**
 * Speech Pipeline Metrics & Observability
 *
 * Provides metrics collection and observability for the speech pipeline:
 * - Latency tracking for analysis operations
 * - Quality metrics for emotion detection
 * - Usage metrics for session management
 * - Performance tracking over time
 *
 * @module speech/metrics
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger().child({ module: 'SpeechMetrics' });
// ============================================================================
// METRICS COLLECTOR
// ============================================================================
class SpeechMetricsCollector {
    latencySamples = [];
    emotionConfidenceSamples = [];
    backchannelResults = [];
    turnPredictionResults = [];
    sessionStarts = new Map();
    sessionDurations = [];
    operations = new Map();
    totalSessionsCreated = 0;
    totalSessionsCleaned = 0;
    cleanupFailures = 0;
    startTime = Date.now();
    lastReset = Date.now();
    maxSamples = 1000;
    /**
     * Record a latency sample
     */
    recordLatency(operationName, latencyMs) {
        this.latencySamples.push(latencyMs);
        if (this.latencySamples.length > this.maxSamples) {
            this.latencySamples.shift();
        }
        this.recordOperation(operationName, latencyMs, true);
    }
    /**
     * Record an emotion detection result
     */
    recordEmotionDetection(confidence) {
        this.emotionConfidenceSamples.push(confidence);
        if (this.emotionConfidenceSamples.length > this.maxSamples) {
            this.emotionConfidenceSamples.shift();
        }
    }
    /**
     * Record a backchannel timing result
     * @param wasTimely - True if backchannel was well-timed
     */
    recordBackchannelResult(wasTimely) {
        this.backchannelResults.push(wasTimely);
        if (this.backchannelResults.length > this.maxSamples) {
            this.backchannelResults.shift();
        }
    }
    /**
     * Record a turn prediction result
     * @param wasCorrect - True if prediction was correct
     */
    recordTurnPrediction(wasCorrect) {
        this.turnPredictionResults.push(wasCorrect);
        if (this.turnPredictionResults.length > this.maxSamples) {
            this.turnPredictionResults.shift();
        }
    }
    /**
     * Record session start
     */
    recordSessionStart(sessionId) {
        this.sessionStarts.set(sessionId, Date.now());
        this.totalSessionsCreated++;
    }
    /**
     * Record session end
     */
    recordSessionEnd(sessionId, success) {
        const startTime = this.sessionStarts.get(sessionId);
        if (startTime) {
            const duration = (Date.now() - startTime) / 1000;
            this.sessionDurations.push(duration);
            if (this.sessionDurations.length > 100) {
                this.sessionDurations.shift();
            }
            this.sessionStarts.delete(sessionId);
        }
        if (success) {
            this.totalSessionsCleaned++;
        }
        else {
            this.cleanupFailures++;
        }
    }
    /**
     * Record an operation execution
     */
    recordOperation(name, durationMs, success) {
        let op = this.operations.get(name);
        if (!op) {
            op = {
                operation: name,
                invocations: 0,
                successes: 0,
                failures: 0,
                avgDurationMs: 0,
                lastInvoked: 0,
            };
            this.operations.set(name, op);
        }
        op.invocations++;
        if (success) {
            op.successes++;
        }
        else {
            op.failures++;
        }
        // Update average duration
        op.avgDurationMs = (op.avgDurationMs * (op.invocations - 1) + durationMs) / op.invocations;
        op.lastInvoked = Date.now();
    }
    /**
     * Get latency metrics
     */
    getLatencyMetrics() {
        if (this.latencySamples.length === 0) {
            return {
                avgAnalysisLatencyMs: 0,
                p50LatencyMs: 0,
                p95LatencyMs: 0,
                p99LatencyMs: 0,
                maxLatencyMs: 0,
                sampleCount: 0,
            };
        }
        const sorted = [...this.latencySamples].sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        return {
            avgAnalysisLatencyMs: Math.round(avg * 100) / 100,
            p50LatencyMs: this.percentile(sorted, 50),
            p95LatencyMs: this.percentile(sorted, 95),
            p99LatencyMs: this.percentile(sorted, 99),
            maxLatencyMs: Math.max(...sorted),
            sampleCount: sorted.length,
        };
    }
    /**
     * Get quality metrics
     */
    getQualityMetrics() {
        const avgConfidence = this.emotionConfidenceSamples.length > 0
            ? this.emotionConfidenceSamples.reduce((a, b) => a + b, 0) /
                this.emotionConfidenceSamples.length
            : 0;
        const highConfidenceRate = this.emotionConfidenceSamples.length > 0
            ? this.emotionConfidenceSamples.filter((c) => c > 0.7).length /
                this.emotionConfidenceSamples.length
            : 0;
        const backchannelAccuracy = this.backchannelResults.length > 0
            ? this.backchannelResults.filter(Boolean).length / this.backchannelResults.length
            : 0;
        const turnPredictionAccuracy = this.turnPredictionResults.length > 0
            ? this.turnPredictionResults.filter(Boolean).length / this.turnPredictionResults.length
            : 0;
        return {
            avgEmotionConfidence: Math.round(avgConfidence * 1000) / 1000,
            highConfidenceRate: Math.round(highConfidenceRate * 1000) / 1000,
            backchannelAccuracy: Math.round(backchannelAccuracy * 1000) / 1000,
            turnPredictionAccuracy: Math.round(turnPredictionAccuracy * 1000) / 1000,
            sampleCount: this.emotionConfidenceSamples.length,
        };
    }
    /**
     * Get usage metrics
     */
    getUsageMetrics() {
        const avgDuration = this.sessionDurations.length > 0
            ? this.sessionDurations.reduce((a, b) => a + b, 0) / this.sessionDurations.length
            : 0;
        const maxDuration = this.sessionDurations.length > 0 ? Math.max(...this.sessionDurations) : 0;
        return {
            activeSessionCount: this.sessionStarts.size,
            totalSessionsCreated: this.totalSessionsCreated,
            totalSessionsCleaned: this.totalSessionsCleaned,
            cleanupFailures: this.cleanupFailures,
            avgSessionDurationSec: Math.round(avgDuration * 10) / 10,
            maxSessionDurationSec: Math.round(maxDuration * 10) / 10,
        };
    }
    /**
     * Get all metrics
     */
    getAllMetrics() {
        return {
            latency: this.getLatencyMetrics(),
            quality: this.getQualityMetrics(),
            usage: this.getUsageMetrics(),
            operations: new Map(this.operations),
            startTime: this.startTime,
            lastReset: this.lastReset,
        };
    }
    /**
     * Get a JSON-serializable snapshot of all metrics
     */
    getSnapshot() {
        const metrics = this.getAllMetrics();
        return {
            timestamp: Date.now(),
            uptimeSec: Math.round((Date.now() - this.startTime) / 1000),
            metrics: {
                ...metrics,
                operations: Object.fromEntries(metrics.operations),
            },
        };
    }
    /**
     * Reset all metrics
     */
    reset() {
        this.latencySamples = [];
        this.emotionConfidenceSamples = [];
        this.backchannelResults = [];
        this.turnPredictionResults = [];
        this.sessionDurations = [];
        this.operations.clear();
        this.totalSessionsCreated = 0;
        this.totalSessionsCleaned = 0;
        this.cleanupFailures = 0;
        // Keep session starts for active sessions
        this.lastReset = Date.now();
        log.info('📊 Speech metrics reset');
    }
    /**
     * Calculate percentile
     */
    percentile(sorted, p) {
        if (sorted.length === 0)
            return 0;
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
const globalMetrics = new SpeechMetricsCollector();
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Record a latency sample for an operation
 */
export function recordLatency(operation, latencyMs) {
    globalMetrics.recordLatency(operation, latencyMs);
}
/**
 * Record an emotion detection confidence score
 */
export function recordEmotionConfidence(confidence) {
    globalMetrics.recordEmotionDetection(confidence);
}
/**
 * Record whether a backchannel was well-timed
 */
export function recordBackchannelTiming(wasTimely) {
    globalMetrics.recordBackchannelResult(wasTimely);
}
/**
 * Record whether a turn prediction was correct
 */
export function recordTurnPredictionAccuracy(wasCorrect) {
    globalMetrics.recordTurnPrediction(wasCorrect);
}
/**
 * Record a session start
 */
export function recordSessionStart(sessionId) {
    globalMetrics.recordSessionStart(sessionId);
}
/**
 * Record a session end
 */
export function recordSessionEnd(sessionId, success = true) {
    globalMetrics.recordSessionEnd(sessionId, success);
}
/**
 * Record an operation execution
 */
export function recordOperation(name, durationMs, success = true) {
    globalMetrics.recordOperation(name, durationMs, success);
}
/**
 * Get current latency metrics
 */
export function getLatencyMetrics() {
    return globalMetrics.getLatencyMetrics();
}
/**
 * Get current quality metrics
 */
export function getQualityMetrics() {
    return globalMetrics.getQualityMetrics();
}
/**
 * Get current usage metrics
 */
export function getUsageMetrics() {
    return globalMetrics.getUsageMetrics();
}
/**
 * Get all speech pipeline metrics
 */
export function getSpeechMetrics() {
    return globalMetrics.getAllMetrics();
}
/**
 * Get a JSON-serializable snapshot of all metrics
 */
export function getSpeechMetricsSnapshot() {
    return globalMetrics.getSnapshot();
}
/**
 * Reset all metrics
 */
export function resetSpeechMetrics() {
    globalMetrics.reset();
}
/**
 * Create a timing wrapper for measuring operation duration
 *
 * @example
 * ```typescript
 * const result = await withTiming('humanListening.analyze', async () => {
 *   return await pipeline.analyze(context);
 * });
 * ```
 */
export async function withTiming(operationName, fn) {
    const start = performance.now();
    try {
        const result = await fn();
        const duration = performance.now() - start;
        recordLatency(operationName, duration);
        return result;
    }
    catch (error) {
        const duration = performance.now() - start;
        globalMetrics.recordOperation(operationName, duration, false);
        throw error;
    }
}
/**
 * Create a sync timing wrapper
 */
export function withTimingSync(operationName, fn) {
    const start = performance.now();
    try {
        const result = fn();
        const duration = performance.now() - start;
        recordLatency(operationName, duration);
        return result;
    }
    catch (error) {
        const duration = performance.now() - start;
        globalMetrics.recordOperation(operationName, duration, false);
        throw error;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordLatency,
    recordEmotionConfidence,
    recordBackchannelTiming,
    recordTurnPredictionAccuracy,
    recordSessionStart,
    recordSessionEnd,
    recordOperation,
    getLatencyMetrics,
    getQualityMetrics,
    getUsageMetrics,
    getSpeechMetrics,
    getSpeechMetricsSnapshot,
    resetSpeechMetrics,
    withTiming,
    withTimingSync,
};
//# sourceMappingURL=index.js.map