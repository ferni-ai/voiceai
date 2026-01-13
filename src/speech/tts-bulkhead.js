/**
 * TTS Bulkhead - Session Isolation for Voice Synthesis
 *
 * SET-17: Prevents one session's slow TTS synthesis from blocking other sessions.
 * Implements the bulkhead pattern with per-session and global limits.
 *
 * Key features:
 * 1. Per-session concurrency limits (prevent session monopolization)
 * 2. Global concurrency limits (prevent system overload)
 * 3. Request timeouts (fail fast on slow operations)
 * 4. Queue management with priority support
 * 5. Metrics for observability
 *
 * Philosophy: Voice synthesis should never block user experience.
 * If TTS is slow, fail fast and let the conversation continue.
 *
 * @module speech/tts-bulkhead
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'TTS-Bulkhead' });
// ============================================================================
// TTS BULKHEAD CLASS
// ============================================================================
const DEFAULT_CONFIG = {
    maxGlobalConcurrent: 20,
    maxPerSession: 3,
    timeoutMs: 10000,
    maxQueuePerSession: 5,
    enableMetrics: true,
};
export class TTSBulkhead {
    config;
    sessions = new Map();
    globalConcurrent = 0;
    executionTimes = [];
    queueTimes = [];
    metricsService = null;
    // Aggregate stats
    stats = {
        totalRequests: 0,
        successfulRequests: 0,
        rejectedRequests: 0,
    };
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        log.info({
            maxGlobal: this.config.maxGlobalConcurrent,
            maxPerSession: this.config.maxPerSession,
            timeoutMs: this.config.timeoutMs,
        }, 'TTS Bulkhead initialized');
        // Clean up stale sessions periodically
        setInterval(() => this.cleanupStaleSessions(), 60_000);
    }
    /**
     * Set metrics service for reporting
     */
    setMetricsService(service) {
        this.metricsService = service;
    }
    /**
     * Execute a TTS operation with bulkhead isolation
     */
    async execute(request) {
        const { sessionId, priority, operation, name = 'tts' } = request;
        const enqueuedAt = Date.now();
        this.stats.totalRequests++;
        // Get or create session state
        const session = this.getOrCreateSession(sessionId);
        session.totalRequests++;
        session.lastActivity = Date.now();
        // Check global limit
        if (this.globalConcurrent >= this.config.maxGlobalConcurrent) {
            return this.reject(session, 'global_limit', enqueuedAt, name);
        }
        // Check session limit
        if (session.concurrent >= this.config.maxPerSession) {
            // Queue if possible
            if (session.queue.length >= this.config.maxQueuePerSession) {
                return this.reject(session, 'queue_full', enqueuedAt, name);
            }
            // Queue the request
            return this.enqueue(request, session, enqueuedAt);
        }
        // Execute immediately
        return this.executeOperation(request, session, enqueuedAt);
    }
    /**
     * Check if we can accept more requests (for pre-flight checks)
     */
    canAcceptRequest(sessionId) {
        if (this.globalConcurrent >= this.config.maxGlobalConcurrent) {
            return false;
        }
        const session = this.sessions.get(sessionId);
        if (!session)
            return true;
        return (session.concurrent < this.config.maxPerSession ||
            session.queue.length < this.config.maxQueuePerSession);
    }
    /**
     * Check if system is under pressure
     */
    isUnderPressure() {
        const globalUsage = this.globalConcurrent / this.config.maxGlobalConcurrent;
        return globalUsage >= 0.8;
    }
    /**
     * Get bulkhead statistics
     */
    getStats() {
        let totalQueued = 0;
        for (const session of this.sessions.values()) {
            totalQueued += session.queue.length;
        }
        const avgExecution = this.executionTimes.length > 0
            ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
            : 0;
        const avgQueue = this.queueTimes.length > 0
            ? this.queueTimes.reduce((a, b) => a + b, 0) / this.queueTimes.length
            : 0;
        return {
            globalConcurrent: this.globalConcurrent,
            maxGlobalConcurrent: this.config.maxGlobalConcurrent,
            activeSessions: this.sessions.size,
            totalQueued,
            totalRequests: this.stats.totalRequests,
            successfulRequests: this.stats.successfulRequests,
            rejectedRequests: this.stats.rejectedRequests,
            avgExecutionTimeMs: Math.round(avgExecution),
            avgQueueTimeMs: Math.round(avgQueue),
            isUnderPressure: this.isUnderPressure(),
        };
    }
    /**
     * Get session-specific stats
     */
    getSessionStats(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        return {
            concurrent: session.concurrent,
            totalRequests: session.totalRequests,
            successfulRequests: session.successfulRequests,
            failedRequests: session.failedRequests,
            rejectedRequests: session.rejectedRequests,
            lastActivity: session.lastActivity,
        };
    }
    /**
     * Clean up a session's state
     */
    cleanupSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Reject any queued requests
            for (const queued of session.queue) {
                queued.resolve({
                    success: false,
                    error: 'Session cleaned up',
                    queueTimeMs: Date.now() - queued.enqueuedAt,
                    executionTimeMs: 0,
                    rejected: true,
                    rejectionReason: 'session_limit',
                });
            }
            this.sessions.delete(sessionId);
            log.debug({ sessionId }, 'TTS bulkhead session cleaned up');
        }
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    getOrCreateSession(sessionId) {
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = {
                concurrent: 0,
                queue: [],
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                rejectedRequests: 0,
                lastActivity: Date.now(),
            };
            this.sessions.set(sessionId, session);
        }
        return session;
    }
    reject(session, reason, enqueuedAt, name) {
        session.rejectedRequests++;
        this.stats.rejectedRequests++;
        log.warn({ reason, name }, 'TTS request rejected due to bulkhead limits');
        if (this.config.enableMetrics && this.metricsService) {
            this.metricsService.recordBulkheadRejection('tts', reason);
        }
        return {
            success: false,
            error: `Rejected: ${reason}`,
            queueTimeMs: Date.now() - enqueuedAt,
            executionTimeMs: 0,
            rejected: true,
            rejectionReason: reason,
        };
    }
    async enqueue(request, session, enqueuedAt) {
        return new Promise((resolve) => {
            const queued = {
                request,
                enqueuedAt,
                resolve: resolve,
            };
            // Insert by priority
            const index = session.queue.findIndex((q) => this.getPriorityValue(q.request.priority) < this.getPriorityValue(request.priority));
            if (index === -1) {
                session.queue.push(queued);
            }
            else {
                session.queue.splice(index, 0, queued);
            }
            log.debug({ sessionId: request.sessionId, queueSize: session.queue.length }, 'TTS request queued');
        });
    }
    async executeOperation(request, session, enqueuedAt) {
        const queueTimeMs = Date.now() - enqueuedAt;
        this.queueTimes.push(queueTimeMs);
        if (this.queueTimes.length > 100)
            this.queueTimes.shift();
        // Increment counters
        session.concurrent++;
        this.globalConcurrent++;
        const startTime = Date.now();
        try {
            // Execute with timeout
            const result = await this.executeWithTimeout(request.operation, this.config.timeoutMs);
            const executionTimeMs = Date.now() - startTime;
            this.executionTimes.push(executionTimeMs);
            if (this.executionTimes.length > 100)
                this.executionTimes.shift();
            session.successfulRequests++;
            this.stats.successfulRequests++;
            if (this.config.enableMetrics && this.metricsService) {
                this.metricsService.recordCircuitBreakerState('tts', 'closed', executionTimeMs);
            }
            return {
                success: true,
                result,
                queueTimeMs,
                executionTimeMs,
                rejected: false,
            };
        }
        catch (error) {
            const executionTimeMs = Date.now() - startTime;
            session.failedRequests++;
            const isTimeout = error instanceof TimeoutError;
            const errorMsg = error instanceof Error ? error.message : String(error);
            log.warn({ error: errorMsg, isTimeout, name: request.name }, 'TTS operation failed');
            if (this.config.enableMetrics && this.metricsService) {
                this.metricsService.recordCircuitBreakerState('tts', 'open', executionTimeMs);
            }
            return {
                success: false,
                error: errorMsg,
                queueTimeMs,
                executionTimeMs,
                rejected: isTimeout,
                rejectionReason: isTimeout ? 'timeout' : undefined,
            };
        }
        finally {
            // Decrement counters
            session.concurrent--;
            this.globalConcurrent--;
            // Process next queued request for this session
            this.processQueue(request.sessionId, session);
        }
    }
    async executeWithTimeout(operation, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new TimeoutError(`TTS operation timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            operation()
                .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    processQueue(sessionId, session) {
        if (session.queue.length === 0)
            return;
        if (session.concurrent >= this.config.maxPerSession)
            return;
        if (this.globalConcurrent >= this.config.maxGlobalConcurrent)
            return;
        const queued = session.queue.shift();
        if (!queued)
            return;
        // Execute the queued request
        this.executeOperation(queued.request, session, queued.enqueuedAt)
            .then((result) => queued.resolve(result))
            .catch((error) => {
            queued.resolve({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                queueTimeMs: Date.now() - queued.enqueuedAt,
                executionTimeMs: 0,
                rejected: false,
            });
        });
    }
    getPriorityValue(priority) {
        switch (priority) {
            case 'high':
                return 3;
            case 'normal':
                return 2;
            case 'low':
                return 1;
        }
    }
    cleanupStaleSessions() {
        const staleThreshold = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.concurrent === 0 && session.queue.length === 0) {
                if (now - session.lastActivity > staleThreshold) {
                    this.sessions.delete(sessionId);
                    log.debug({ sessionId }, 'Cleaned up stale TTS session');
                }
            }
        }
    }
}
// ============================================================================
// TIMEOUT ERROR
// ============================================================================
export class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let instance = null;
/**
 * Get the TTS bulkhead singleton instance
 */
export function getTTSBulkhead(config) {
    if (!instance) {
        instance = new TTSBulkhead(config);
    }
    return instance;
}
/**
 * Reset the TTS bulkhead (for testing)
 */
export function resetTTSBulkhead() {
    instance = null;
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Execute TTS with bulkhead protection
 */
export async function executeWithBulkhead(sessionId, operation, options = {}) {
    return getTTSBulkhead().execute({
        sessionId,
        priority: options.priority || 'normal',
        operation,
        name: options.name,
    });
}
/**
 * Check if TTS bulkhead can accept more requests
 */
export function canAcceptTTSRequest(sessionId) {
    return getTTSBulkhead().canAcceptRequest(sessionId);
}
/**
 * Check if TTS system is under pressure
 */
export function isTTSUnderPressure() {
    return getTTSBulkhead().isUnderPressure();
}
/**
 * Get TTS bulkhead statistics
 */
export function getTTSBulkheadStats() {
    return getTTSBulkhead().getStats();
}
/**
 * Clean up TTS session state
 */
export function cleanupTTSSession(sessionId) {
    getTTSBulkhead().cleanupSession(sessionId);
}
export default TTSBulkhead;
//# sourceMappingURL=tts-bulkhead.js.map