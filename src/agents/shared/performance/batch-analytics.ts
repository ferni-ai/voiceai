/**
 * Batch Analytics Writer
 *
 * Groups non-critical analytics writes for efficiency.
 * Reduces database pressure and improves response times.
 *
 * Key Features:
 * - Automatic batching with configurable thresholds
 * - Priority-based flushing
 * - Graceful degradation on failures
 * - Memory pressure handling
 *
 * @module BatchAnalytics
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'BatchAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface BatchConfig {
  /** Max events before auto-flush (default: 100) */
  maxBatchSize?: number;
  /** Max time before auto-flush in ms (default: 60000 = 1 minute) */
  flushIntervalMs?: number;
  /** Max memory for buffer in bytes (default: 10MB) */
  maxMemoryBytes?: number;
  /** Number of retries on failure (default: 3) */
  maxRetries?: number;
  /** Enable persistence for failed batches (default: true) */
  persistOnFailure?: boolean;
}

export interface AnalyticsEvent {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** Session ID */
  sessionId?: string;
  /** User ID */
  userId?: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Priority (lower = more important) */
  priority?: number;
}

export interface BatchStats {
  totalEventsQueued: number;
  totalEventsFlushed: number;
  totalBatchesFlushed: number;
  failedFlushes: number;
  currentQueueSize: number;
  avgBatchSize: number;
  avgFlushLatencyMs: number;
  lastFlushAt: number | null;
}

type FlushHandler = (events: AnalyticsEvent[]) => Promise<void>;

// ============================================================================
// BATCH WRITER CLASS
// ============================================================================

/**
 * Batches analytics events for efficient writing
 *
 * @example
 * ```ts
 * const batchWriter = new BatchAnalyticsWriter({
 *   maxBatchSize: 50,
 *   flushIntervalMs: 30000,
 * });
 *
 * // Set the flush handler
 * batchWriter.setFlushHandler(async (events) => {
 *   await firestore.collection('analytics').add(cleanForFirestore({ events }));
 * });
 *
 * // Queue events
 * batchWriter.queue({
 *   type: 'page_view',
 *   timestamp: new Date(),
 *   data: { page: '/home' },
 * });
 *
 * // Shutdown (flushes remaining)
 * await batchWriter.shutdown();
 * ```
 */
export class BatchAnalyticsWriter {
  private config: Required<BatchConfig>;
  private buffer: AnalyticsEvent[] = [];
  private flushHandler: FlushHandler | null = null;
  private flushInterval: NodeJS.Timeout | null = null;
  private flushing = false;
  private failedBatches: AnalyticsEvent[][] = [];
  private currentMemoryEstimate = 0;

  // Stats
  private stats: BatchStats = {
    totalEventsQueued: 0,
    totalEventsFlushed: 0,
    totalBatchesFlushed: 0,
    failedFlushes: 0,
    currentQueueSize: 0,
    avgBatchSize: 0,
    avgFlushLatencyMs: 0,
    lastFlushAt: null,
  };
  private flushLatencies: number[] = [];
  private batchSizes: number[] = [];

  constructor(config: BatchConfig = {}) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 60000,
      maxMemoryBytes: config.maxMemoryBytes ?? 10 * 1024 * 1024, // 10MB
      maxRetries: config.maxRetries ?? 3,
      persistOnFailure: config.persistOnFailure ?? true,
    };

    this.startFlushInterval();
  }

  /**
   * Set the handler that processes batched events
   */
  setFlushHandler(handler: FlushHandler): void {
    this.flushHandler = handler;
  }

  /**
   * Queue an analytics event
   */
  queue(event: AnalyticsEvent): void {
    // Estimate memory size
    const eventSize = this.estimateSize(event);

    // Check memory pressure
    if (this.currentMemoryEstimate + eventSize > this.config.maxMemoryBytes) {
      log.warn('Memory pressure - forcing flush');
      void this.flush();
    }

    this.buffer.push({
      ...event,
      priority: event.priority ?? 50,
    });
    this.currentMemoryEstimate += eventSize;
    this.stats.totalEventsQueued++;
    this.stats.currentQueueSize = this.buffer.length;

    // Check if we should flush
    if (this.buffer.length >= this.config.maxBatchSize) {
      void this.flush();
    }
  }

  /**
   * Queue multiple events at once
   */
  queueAll(events: AnalyticsEvent[]): void {
    for (const event of events) {
      this.queue(event);
    }
  }

  /**
   * Manually trigger a flush
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const startTime = Date.now();

    // Get events to flush (sorted by priority)
    const toFlush = this.buffer.splice(0, this.config.maxBatchSize);
    toFlush.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

    this.currentMemoryEstimate = this.estimateTotalSize(this.buffer);
    this.stats.currentQueueSize = this.buffer.length;

    try {
      if (this.flushHandler) {
        await this.flushWithRetry(toFlush);
        this.recordFlushSuccess(toFlush.length, Date.now() - startTime);
      } else {
        // No handler - just log
        log.debug({ count: toFlush.length }, 'Batch flush (no handler)');
        this.recordFlushSuccess(toFlush.length, Date.now() - startTime);
      }
    } catch (error) {
      this.recordFlushFailure(toFlush);
      log.error({ error: String(error), count: toFlush.length }, 'Batch flush failed');
    } finally {
      this.flushing = false;
    }

    // Retry failed batches if any
    if (this.failedBatches.length > 0) {
      void this.retryFailedBatches();
    }
  }

  /**
   * Flush with retry logic
   */
  private async flushWithRetry(events: AnalyticsEvent[]): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.flushHandler!(events);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries - 1) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
        }
      }
    }

    throw lastError;
  }

  /**
   * Retry failed batches
   */
  private async retryFailedBatches(): Promise<void> {
    if (this.failedBatches.length === 0 || !this.flushHandler) return;

    const batch = this.failedBatches.shift();
    if (!batch) return;

    try {
      await this.flushHandler(batch);
      this.stats.totalEventsFlushed += batch.length;
      log.info({ count: batch.length }, 'Recovered failed batch');
    } catch (error) {
      // Put back at end of queue
      this.failedBatches.push(batch);
      log.warn({ error: String(error) }, 'Failed batch retry failed');
    }
  }

  /**
   * Shutdown and flush remaining events
   */
  async shutdown(): Promise<void> {
    // Stop interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining buffer
    while (this.buffer.length > 0) {
      await this.flush();
    }

    // Try to flush failed batches
    while (this.failedBatches.length > 0) {
      await this.retryFailedBatches();
    }

    log.info(this.getStats(), '📊 Batch analytics shutdown');
  }

  /**
   * Get current statistics
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.buffer.length;
  }

  /**
   * Check if there are pending events
   */
  hasPendingEvents(): boolean {
    return this.buffer.length > 0 || this.failedBatches.length > 0;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  private recordFlushSuccess(count: number, latencyMs: number): void {
    this.stats.totalEventsFlushed += count;
    this.stats.totalBatchesFlushed++;
    this.stats.lastFlushAt = Date.now();

    // Track for averages
    this.flushLatencies.push(latencyMs);
    this.batchSizes.push(count);

    // Keep bounded
    if (this.flushLatencies.length > 100) {
      this.flushLatencies.shift();
      this.batchSizes.shift();
    }

    // Update averages
    this.stats.avgFlushLatencyMs = Math.round(
      this.flushLatencies.reduce((a, b) => a + b, 0) / this.flushLatencies.length
    );
    this.stats.avgBatchSize = Math.round(
      this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length
    );
  }

  private recordFlushFailure(events: AnalyticsEvent[]): void {
    this.stats.failedFlushes++;

    if (this.config.persistOnFailure) {
      this.failedBatches.push(events);
    }
  }

  private estimateSize(event: AnalyticsEvent): number {
    try {
      return JSON.stringify(event).length * 2; // UTF-16
    } catch {
      return 1000;
    }
  }

  private estimateTotalSize(events: AnalyticsEvent[]): number {
    return events.reduce((sum, e) => sum + this.estimateSize(e), 0);
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

let globalWriter: BatchAnalyticsWriter | null = null;

/**
 * Get the global batch analytics writer
 */
export function getBatchAnalyticsWriter(config?: BatchConfig): BatchAnalyticsWriter {
  if (!globalWriter) {
    globalWriter = new BatchAnalyticsWriter(config);
  }
  return globalWriter;
}

/**
 * Initialize the global batch writer with a flush handler
 */
export function initBatchAnalytics(
  flushHandler: FlushHandler,
  config?: BatchConfig
): BatchAnalyticsWriter {
  const writer = getBatchAnalyticsWriter(config);
  writer.setFlushHandler(flushHandler);
  return writer;
}

/**
 * Queue an analytics event (uses global writer)
 */
export function queueAnalyticsEvent(event: AnalyticsEvent): void {
  getBatchAnalyticsWriter().queue(event);
}

/**
 * Queue multiple analytics events (uses global writer)
 */
export function queueAnalyticsEvents(events: AnalyticsEvent[]): void {
  getBatchAnalyticsWriter().queueAll(events);
}

/**
 * Shutdown the global batch writer
 */
export async function shutdownBatchAnalytics(): Promise<void> {
  if (globalWriter) {
    await globalWriter.shutdown();
    globalWriter = null;
  }
}

// ============================================================================
// CONVENIENCE EVENT BUILDERS
// ============================================================================

/**
 * Create a session event
 */
export function createSessionEvent(
  type: 'session_start' | 'session_end' | 'session_activity',
  sessionId: string,
  userId: string,
  data: Record<string, unknown> = {}
): AnalyticsEvent {
  return {
    type,
    timestamp: new Date(),
    sessionId,
    userId,
    data,
    priority: type === 'session_start' ? 20 : type === 'session_end' ? 30 : 50,
  };
}

/**
 * Create a tool usage event
 */
export function createToolEvent(
  toolId: string,
  sessionId: string,
  data: Record<string, unknown> = {}
): AnalyticsEvent {
  return {
    type: 'tool_usage',
    timestamp: new Date(),
    sessionId,
    data: { toolId, ...data },
    priority: 60, // Lower priority
  };
}

/**
 * Create an emotion detection event
 */
export function createEmotionEvent(
  emotion: string,
  sessionId: string,
  data: Record<string, unknown> = {}
): AnalyticsEvent {
  return {
    type: 'emotion_detected',
    timestamp: new Date(),
    sessionId,
    data: { emotion, ...data },
    priority: 40, // Medium priority
  };
}

/**
 * Create a performance metric event
 */
export function createPerformanceEvent(
  metricName: string,
  value: number,
  sessionId?: string,
  data: Record<string, unknown> = {}
): AnalyticsEvent {
  return {
    type: 'performance_metric',
    timestamp: new Date(),
    sessionId,
    data: { metricName, value, ...data },
    priority: 70, // Lower priority - batched
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(
  errorType: string,
  message: string,
  sessionId?: string,
  data: Record<string, unknown> = {}
): AnalyticsEvent {
  return {
    type: 'error',
    timestamp: new Date(),
    sessionId,
    data: { errorType, message, ...data },
    priority: 10, // High priority - flush soon
  };
}
