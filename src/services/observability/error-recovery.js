/**
 * Error & Recovery Metrics
 *
 * Tracks error rates and recovery patterns:
 * - Error frequency by type
 * - Retry success rates
 * - Fallback activations
 * - Recovery time
 * - Error clusters
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// STATE
// ============================================================================
const errorEvents = [];
const MAX_EVENTS = 1000;
// ============================================================================
// RECORDING
// ============================================================================
export function recordError(error, category, context) {
    const message = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    const event = {
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        category,
        code: context?.code,
        message,
        stack,
        userId: context?.userId,
        sessionId: context?.sessionId,
        recovered: false,
    };
    errorEvents.push(event);
    if (errorEvents.length > MAX_EVENTS) {
        errorEvents.shift();
    }
    log.warn({ category, message, code: context?.code }, 'Error recorded');
    return event.id;
}
export function recordRecovery(errorId, method, recoveryTimeMs, retryCount) {
    const event = errorEvents.find((e) => e.id === errorId);
    if (event) {
        event.recovered = true;
        event.recoveryMethod = method;
        event.recoveryTimeMs = recoveryTimeMs;
        event.retryCount = retryCount;
        log.info({ errorId, method, recoveryTimeMs, retryCount }, 'Error recovered');
    }
}
export function recordRetry(category, success, attemptNumber, latencyMs, context) {
    if (!success) {
        recordError(`Retry attempt ${attemptNumber} failed`, category, context);
    }
    else {
        log.debug({ category, attemptNumber, latencyMs }, 'Retry succeeded');
    }
}
export function recordFallback(fromService, toService, reason, context) {
    const errorId = recordError(`Fallback: ${fromService} -> ${toService}: ${reason}`, 'api', context);
    recordRecovery(errorId, 'fallback', 0);
    log.info({ from: fromService, to: toService, reason }, 'Fallback activated');
}
// ============================================================================
// SNAPSHOT
// ============================================================================
export function getSnapshot() {
    const now = Date.now();
    const lastHour = errorEvents.filter((e) => e.timestamp > now - 60 * 60 * 1000);
    const last5Min = errorEvents.filter((e) => e.timestamp > now - 5 * 60 * 1000);
    // By category
    const categories = [
        'network',
        'api',
        'llm',
        'tts',
        'stt',
        'memory',
        'handoff',
        'auth',
        'unknown',
    ];
    const errorsByCategory = {};
    const errorRateByCategory = {};
    for (const cat of categories) {
        const catErrors = lastHour.filter((e) => e.category === cat);
        errorsByCategory[cat] = catErrors.length;
        errorRateByCategory[cat] = catErrors.length / Math.max(1, lastHour.length);
    }
    // Recovery metrics
    const recovered = lastHour.filter((e) => e.recovered);
    const recoveryRate = lastHour.length > 0 ? recovered.length / lastHour.length : 1;
    const recoveryTimes = recovered.filter((e) => e.recoveryTimeMs).map((e) => e.recoveryTimeMs);
    const avgRecoveryTimeMs = recoveryTimes.length > 0 ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length : 0;
    const retries = recovered.filter((e) => e.recoveryMethod === 'retry');
    const retrySuccessRate = retries.length > 0 ? 1 : 0; // All recorded retries are successful
    const fallbackActivations = recovered.filter((e) => e.recoveryMethod === 'fallback').length;
    // Most common errors
    const messageCounts = new Map();
    for (const event of lastHour) {
        const key = event.message.slice(0, 100);
        messageCounts.set(key, (messageCounts.get(key) || 0) + 1);
    }
    const mostCommonErrors = Array.from(messageCounts.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    // Error clusters (by 5-minute windows)
    const clusters = [];
    for (let i = 0; i < 12; i++) {
        const windowStart = now - (i + 1) * 5 * 60 * 1000;
        const windowEnd = now - i * 5 * 60 * 1000;
        const count = errorEvents.filter((e) => e.timestamp >= windowStart && e.timestamp < windowEnd).length;
        const timeWindow = `${i * 5}-${(i + 1) * 5}min ago`;
        clusters.push({ timeWindow, count });
    }
    // Health score (100 = no errors, 0 = critical)
    const errorHealthScore = Math.max(0, Math.min(100, 100 - last5Min.length * 10 - lastHour.length));
    return {
        totalErrors: errorEvents.length,
        errorsLastHour: lastHour.length,
        errorsLast5Min: last5Min.length,
        errorsByCategory,
        errorRateByCategory,
        recoveryRate,
        avgRecoveryTimeMs,
        retrySuccessRate,
        fallbackActivations,
        mostCommonErrors,
        errorClusters: clusters,
        errorHealthScore,
    };
}
// ============================================================================
// EXPORT
// ============================================================================
export const errorMetrics = {
    recordError,
    recordRecovery,
    recordRetry,
    recordFallback,
    getSnapshot,
};
//# sourceMappingURL=error-recovery.js.map