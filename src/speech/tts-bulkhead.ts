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
import { createManagedInterval, type ManagedInterval } from '../utils/managed-interval.js';
import type { ResilienceMetricsService } from '../services/observability/resilience-metrics.js';

const log = createLogger({ module: 'TTS-Bulkhead' });

// ============================================================================
// TYPES
// ============================================================================

export interface TTSBulkheadConfig {
  /** Maximum concurrent TTS operations globally (default: 20) */
  maxGlobalConcurrent: number;
  /** Maximum concurrent TTS operations per session (default: 3) */
  maxPerSession: number;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs: number;
  /** Maximum queue size per session (default: 5) */
  maxQueuePerSession: number;
  /** Whether to enable metrics reporting */
  enableMetrics: boolean;
}

export interface TTSRequest<T> {
  /** Session ID for isolation */
  sessionId: string;
  /** Priority (higher = processed first) */
  priority: 'high' | 'normal' | 'low';
  /** The TTS operation to execute */
  operation: () => Promise<T>;
  /** Operation name for metrics/logging */
  name?: string;
}

export interface TTSBulkheadResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result (if success) */
  result?: T;
  /** Error message (if failed) */
  error?: string;
  /** Time spent queued in ms */
  queueTimeMs: number;
  /** Time spent executing in ms */
  executionTimeMs: number;
  /** Whether request was rejected due to limits */
  rejected: boolean;
  /** Rejection reason if rejected */
  rejectionReason?: 'global_limit' | 'session_limit' | 'queue_full' | 'timeout';
}

interface QueuedRequest<T> {
  request: TTSRequest<T>;
  enqueuedAt: number;
  resolve: (result: TTSBulkheadResult<T>) => void;
}

interface SessionState {
  /** Current concurrent operations */
  concurrent: number;
  /** Queued requests */
  queue: Array<QueuedRequest<unknown>>;
  /** Total requests processed */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Rejected requests */
  rejectedRequests: number;
  /** Last activity timestamp */
  lastActivity: number;
}

export interface TTSBulkheadStats {
  /** Current global concurrent operations */
  globalConcurrent: number;
  /** Maximum global concurrent allowed */
  maxGlobalConcurrent: number;
  /** Number of active sessions */
  activeSessions: number;
  /** Total queued requests across all sessions */
  totalQueued: number;
  /** Total requests processed */
  totalRequests: number;
  /** Total successful requests */
  successfulRequests: number;
  /** Total rejected requests */
  rejectedRequests: number;
  /** Average execution time in ms */
  avgExecutionTimeMs: number;
  /** Average queue time in ms */
  avgQueueTimeMs: number;
  /** Is under pressure (near limits) */
  isUnderPressure: boolean;
}

// ============================================================================
// TTS BULKHEAD CLASS
// ============================================================================

const DEFAULT_CONFIG: TTSBulkheadConfig = {
  maxGlobalConcurrent: 20,
  maxPerSession: 3,
  timeoutMs: 10000,
  maxQueuePerSession: 5,
  enableMetrics: true,
};

export class TTSBulkhead {
  private config: TTSBulkheadConfig;
  private sessions = new Map<string, SessionState>();
  private globalConcurrent = 0;
  private executionTimes: number[] = [];
  private queueTimes: number[] = [];
  private metricsService: ResilienceMetricsService | null = null;
  private cleanupInterval: ManagedInterval;

  // Aggregate stats
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    rejectedRequests: 0,
  };

  constructor(config: Partial<TTSBulkheadConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info(
      {
        maxGlobal: this.config.maxGlobalConcurrent,
        maxPerSession: this.config.maxPerSession,
        timeoutMs: this.config.timeoutMs,
      },
      'TTS Bulkhead initialized'
    );

    // Clean up stale sessions periodically
    this.cleanupInterval = createManagedInterval(
      () => this.cleanupStaleSessions(),
      60_000,
      { unref: true, label: 'tts-bulkhead-cleanup' }
    );
  }

  /**
   * Dispose the bulkhead and its cleanup interval
   */
  dispose(): void {
    this.cleanupInterval.dispose();
  }

  /**
   * Set metrics service for reporting
   */
  setMetricsService(service: ResilienceMetricsService): void {
    this.metricsService = service;
  }

  /**
   * Execute a TTS operation with bulkhead isolation
   */
  async execute<T>(request: TTSRequest<T>): Promise<TTSBulkheadResult<T>> {
    const { sessionId, priority, operation, name = 'tts' } = request;
    const enqueuedAt = Date.now();

    this.stats.totalRequests++;

    // Get or create session state
    const session = this.getOrCreateSession(sessionId);
    session.totalRequests++;
    session.lastActivity = Date.now();

    // Check global limit
    if (this.globalConcurrent >= this.config.maxGlobalConcurrent) {
      return this.reject<T>(session, 'global_limit', enqueuedAt, name);
    }

    // Check session limit
    if (session.concurrent >= this.config.maxPerSession) {
      // Queue if possible
      if (session.queue.length >= this.config.maxQueuePerSession) {
        return this.reject<T>(session, 'queue_full', enqueuedAt, name);
      }

      // Queue the request
      return this.enqueue<T>(request, session, enqueuedAt);
    }

    // Execute immediately
    return this.executeOperation<T>(request, session, enqueuedAt);
  }

  /**
   * Check if we can accept more requests (for pre-flight checks)
   */
  canAcceptRequest(sessionId: string): boolean {
    if (this.globalConcurrent >= this.config.maxGlobalConcurrent) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (!session) return true;

    return (
      session.concurrent < this.config.maxPerSession ||
      session.queue.length < this.config.maxQueuePerSession
    );
  }

  /**
   * Check if system is under pressure
   */
  isUnderPressure(): boolean {
    const globalUsage = this.globalConcurrent / this.config.maxGlobalConcurrent;
    return globalUsage >= 0.8;
  }

  /**
   * Get bulkhead statistics
   */
  getStats(): TTSBulkheadStats {
    let totalQueued = 0;
    for (const session of this.sessions.values()) {
      totalQueued += session.queue.length;
    }

    const avgExecution =
      this.executionTimes.length > 0
        ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
        : 0;

    const avgQueue =
      this.queueTimes.length > 0
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
  getSessionStats(sessionId: string): Omit<SessionState, 'queue'> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

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
  cleanupSession(sessionId: string): void {
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

  private getOrCreateSession(sessionId: string): SessionState {
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

  private reject<T>(
    session: SessionState,
    reason: 'global_limit' | 'session_limit' | 'queue_full',
    enqueuedAt: number,
    name: string
  ): TTSBulkheadResult<T> {
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

  private async enqueue<T>(
    request: TTSRequest<T>,
    session: SessionState,
    enqueuedAt: number
  ): Promise<TTSBulkheadResult<T>> {
    return new Promise<TTSBulkheadResult<T>>((resolve) => {
      const queued: QueuedRequest<T> = {
        request,
        enqueuedAt,
        resolve: resolve as (result: TTSBulkheadResult<unknown>) => void,
      };

      // Insert by priority
      const index = session.queue.findIndex(
        (q) => this.getPriorityValue(q.request.priority) < this.getPriorityValue(request.priority)
      );
      if (index === -1) {
        session.queue.push(queued as QueuedRequest<unknown>);
      } else {
        session.queue.splice(index, 0, queued as QueuedRequest<unknown>);
      }

      log.debug(
        { sessionId: request.sessionId, queueSize: session.queue.length },
        'TTS request queued'
      );
    });
  }

  private async executeOperation<T>(
    request: TTSRequest<T>,
    session: SessionState,
    enqueuedAt: number
  ): Promise<TTSBulkheadResult<T>> {
    const queueTimeMs = Date.now() - enqueuedAt;
    this.queueTimes.push(queueTimeMs);
    if (this.queueTimes.length > 100) this.queueTimes.shift();

    // Increment counters
    session.concurrent++;
    this.globalConcurrent++;

    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(request.operation, this.config.timeoutMs);

      const executionTimeMs = Date.now() - startTime;
      this.executionTimes.push(executionTimeMs);
      if (this.executionTimes.length > 100) this.executionTimes.shift();

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
    } catch (error) {
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
    } finally {
      // Decrement counters
      session.concurrent--;
      this.globalConcurrent--;

      // Process next queued request for this session
      this.processQueue(request.sessionId, session);
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
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

  private processQueue(sessionId: string, session: SessionState): void {
    if (session.queue.length === 0) return;
    if (session.concurrent >= this.config.maxPerSession) return;
    if (this.globalConcurrent >= this.config.maxGlobalConcurrent) return;

    const queued = session.queue.shift();
    if (!queued) return;

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

  private getPriorityValue(priority: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
    }
  }

  private cleanupStaleSessions(): void {
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
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: TTSBulkhead | null = null;

/**
 * Get the TTS bulkhead singleton instance
 */
export function getTTSBulkhead(config?: Partial<TTSBulkheadConfig>): TTSBulkhead {
  if (!instance) {
    instance = new TTSBulkhead(config);
  }
  return instance;
}

/**
 * Reset the TTS bulkhead (for testing)
 */
export function resetTTSBulkhead(): void {
  instance = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute TTS with bulkhead protection
 */
export async function executeWithBulkhead<T>(
  sessionId: string,
  operation: () => Promise<T>,
  options: { priority?: 'high' | 'normal' | 'low'; name?: string } = {}
): Promise<TTSBulkheadResult<T>> {
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
export function canAcceptTTSRequest(sessionId: string): boolean {
  return getTTSBulkhead().canAcceptRequest(sessionId);
}

/**
 * Check if TTS system is under pressure
 */
export function isTTSUnderPressure(): boolean {
  return getTTSBulkhead().isUnderPressure();
}

/**
 * Get TTS bulkhead statistics
 */
export function getTTSBulkheadStats(): TTSBulkheadStats {
  return getTTSBulkhead().getStats();
}

/**
 * Clean up TTS session state
 */
export function cleanupTTSSession(sessionId: string): void {
  getTTSBulkhead().cleanupSession(sessionId);
}

export default TTSBulkhead;
