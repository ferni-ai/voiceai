/**
 * Batch Firestore Write Manager
 *
 * PERFORMANCE OPTIMIZATION: Instead of 15+ individual Firestore writes during
 * a conversation turn, this batches them into a single atomic write at turn end.
 *
 * Key Features:
 * - Queue writes during turn processing
 * - Flush all writes in a single batch at turn end
 * - Fire-and-forget mode for non-critical writes
 * - Automatic retry with exponential backoff
 * - Metrics for monitoring batch performance
 *
 * @module performance/batch-firestore
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'BatchFirestore' });

// ============================================================================
// TYPES
// ============================================================================

export interface WriteOperation {
  /** Collection path */
  collection: string;
  /** Document ID */
  docId: string;
  /** Data to write */
  data: Record<string, unknown>;
  /** Write type */
  type: 'set' | 'update' | 'merge';
  /** Priority (higher = flush earlier) */
  priority?: number;
  /** Whether this write is critical (blocks turn completion) */
  critical?: boolean;
}

export interface BatchConfig {
  /** Maximum writes to batch before auto-flush (default: 50) */
  maxBatchSize?: number;
  /** Maximum time to wait before auto-flush in ms (default: 5000) */
  maxWaitMs?: number;
  /** Enable automatic batching (default: true) */
  enabled?: boolean;
  /** Retry failed batches (default: true) */
  retryOnFailure?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
}

export interface BatchMetrics {
  totalWrites: number;
  batchedWrites: number;
  directWrites: number;
  batches: number;
  failedBatches: number;
  avgBatchSize: number;
  avgBatchLatencyMs: number;
  savedRoundTrips: number;
}

// ============================================================================
// BATCH WRITE MANAGER
// ============================================================================

/** Track failed queues with their failure time for cleanup */
interface FailedQueueInfo {
  failedAt: number;
  retryCount: number;
}

/** Maximum age for failed queues before cleanup (5 minutes) */
const MAX_FAILED_QUEUE_AGE_MS = 5 * 60 * 1000;

/** Maximum retry attempts for failed queues */
const MAX_QUEUE_RETRIES = 3;

class BatchWriteManager {
  private sessionQueues = new Map<string, WriteOperation[]>();
  private flushTimers = new Map<string, NodeJS.Timeout>();
  /** Track failed queues to prevent memory leaks */
  private failedQueues = new Map<string, FailedQueueInfo>();
  private config: Required<BatchConfig>;
  private metrics: BatchMetrics = {
    totalWrites: 0,
    batchedWrites: 0,
    directWrites: 0,
    batches: 0,
    failedBatches: 0,
    avgBatchSize: 0,
    avgBatchLatencyMs: 0,
    savedRoundTrips: 0,
  };
  private batchSizes: number[] = [];
  private batchLatencies: number[] = [];
  private firestore: FirebaseFirestore.Firestore | null = null;
  private firestorePromise: Promise<FirebaseFirestore.Firestore | null> | null = null;

  constructor(config: BatchConfig = {}) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 50,
      maxWaitMs: config.maxWaitMs ?? 5000,
      enabled: config.enabled ?? true,
      retryOnFailure: config.retryOnFailure ?? true,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  /**
   * Lazy-load Firestore to avoid blocking startup
   */
  private async getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
    if (this.firestore) return this.firestore;

    if (!this.firestorePromise) {
      this.firestorePromise = (async () => {
        try {
          const { getFirestore: getFS } = await import('firebase-admin/firestore');
          const { initializeApp, getApps, cert } = await import('firebase-admin/app');

          if (getApps().length === 0) {
            const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            if (serviceAccount) {
              initializeApp({ credential: cert(serviceAccount) });
            } else {
              initializeApp();
            }
          }

          this.firestore = getFS();
          return this.firestore;
        } catch (error) {
          log.warn({ error: String(error) }, 'Failed to initialize Firestore for batch writes');
          return null;
        }
      })();
    }

    return this.firestorePromise;
  }

  /**
   * Queue a write operation for batching
   */
  queue(sessionId: string, operation: WriteOperation): void {
    if (!this.config.enabled) {
      // Fall back to direct write if batching disabled
      void this.writeDirectly(operation);
      return;
    }

    this.metrics.totalWrites++;

    // Get or create queue for this session
    let queue = this.sessionQueues.get(sessionId);
    if (!queue) {
      queue = [];
      this.sessionQueues.set(sessionId, queue);
    }

    queue.push(operation);

    // Auto-flush if batch is full
    if (queue.length >= this.config.maxBatchSize) {
      void this.flush(sessionId);
      return;
    }

    // Set auto-flush timer if not already set
    if (!this.flushTimers.has(sessionId)) {
      const timer = setTimeout(() => {
        void this.flush(sessionId);
      }, this.config.maxWaitMs);
      this.flushTimers.set(sessionId, timer);
    }
  }

  /**
   * Queue multiple operations at once
   */
  queueMultiple(sessionId: string, operations: WriteOperation[]): void {
    for (const op of operations) {
      this.queue(sessionId, op);
    }
  }

  /**
   * Track sessions currently being flushed to prevent race conditions
   * RACE CONDITION FIX: Don't delete queue until commit completes
   */
  private flushingQueues = new Set<string>();

  /**
   * Flush all queued writes for a session
   */
  async flush(sessionId: string): Promise<{ success: boolean; count: number; durationMs: number }> {
    // Prevent concurrent flushes for the same session
    if (this.flushingQueues.has(sessionId)) {
      return { success: true, count: 0, durationMs: 0 };
    }

    // Clear any pending timer
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }

    // Get queue but DON'T delete yet - wait until commit completes
    const queue = this.sessionQueues.get(sessionId);

    if (!queue || queue.length === 0) {
      this.sessionQueues.delete(sessionId);
      return { success: true, count: 0, durationMs: 0 };
    }

    // Mark as flushing to prevent concurrent operations
    this.flushingQueues.add(cleanForFirestore(sessionId));

    const startTime = Date.now();
    const count = queue.length;

    try {
      const db = await this.getFirestore();
      if (!db) {
        // Firestore unavailable - writes will be lost
        log.warn({ sessionId, count }, 'Firestore unavailable, batch writes dropped');
        return { success: false, count, durationMs: 0 };
      }

      // Sort by priority (higher first)
      queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      // Create batch
      const batch = db.batch();

      for (const op of queue) {
        const ref = db.collection(op.collection).doc(op.docId);

        switch (op.type) {
          case 'set':
            batch.set(ref, op.data);
            break;
          case 'update':
            batch.update(ref, op.data);
            break;
          case 'merge':
            batch.set(ref, op.data, { merge: true });
            break;
        }
      }

      // Commit batch with retry
      await this.commitWithRetry(batch, sessionId);

      const durationMs = Date.now() - startTime;

      // NOW it's safe to delete the queue (after successful commit)
      this.sessionQueues.delete(sessionId);
      // Clear any failure tracking on success
      this.failedQueues.delete(sessionId);

      // Update metrics
      this.metrics.batchedWrites += count;
      this.metrics.batches++;
      this.metrics.savedRoundTrips += count - 1; // We saved (count-1) round trips
      this.batchSizes.push(count);
      this.batchLatencies.push(durationMs);
      this.updateAverages();

      log.debug(
        { sessionId, count, durationMs, savedRoundTrips: count - 1 },
        '🔥 Batch write committed'
      );

      return { success: true, count, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.metrics.failedBatches++;

      // Track failed queue for cleanup to prevent memory leaks
      const failedInfo = this.failedQueues.get(sessionId);
      if (failedInfo) {
        failedInfo.retryCount++;
        // If we've exceeded max retries, drop the queue to prevent memory leak
        if (failedInfo.retryCount >= MAX_QUEUE_RETRIES) {
          log.warn(
            { sessionId, count, retryCount: failedInfo.retryCount },
            'Batch write failed max retries, dropping queue to prevent memory leak'
          );
          this.sessionQueues.delete(sessionId);
          this.failedQueues.delete(sessionId);
        }
      } else {
        // First failure - track it
        this.failedQueues.set(cleanForFirestore(sessionId), { failedAt: Date.now(), retryCount: 1 });
      }

      // Clean up any old failed queues (older than MAX_FAILED_QUEUE_AGE_MS)
      this.cleanupOldFailedQueues();

      log.error({ sessionId, count, error: String(error) }, 'Batch write failed');
      return { success: false, count, durationMs };
    } finally {
      // Always clear the flushing flag
      this.flushingQueues.delete(sessionId);
    }
  }

  /**
   * Commit batch with retry logic
   */
  private async commitWithRetry(
    batch: FirebaseFirestore.WriteBatch,
    sessionId: string,
    attempt = 1
  ): Promise<void> {
    try {
      await batch.commit();
    } catch (error) {
      if (this.config.retryOnFailure && attempt < this.config.maxRetries) {
        const delayMs = Math.min(100 * Math.pow(2, attempt), 2000);
        log.debug({ sessionId, attempt, delayMs }, 'Retrying batch commit');
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.commitWithRetry(batch, sessionId, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Clean up old failed queues to prevent memory leaks
   * Called after each failure to ensure stale queues are removed
   */
  private cleanupOldFailedQueues(): void {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    this.failedQueues.forEach((info, sessionId) => {
      if (now - info.failedAt > MAX_FAILED_QUEUE_AGE_MS) {
        staleSessionIds.push(sessionId);
      }
    });

    if (staleSessionIds.length > 0) {
      log.info(
        { staleCount: staleSessionIds.length },
        'Cleaning up stale failed batch queues to prevent memory leak'
      );

      for (const sessionId of staleSessionIds) {
        const queue = this.sessionQueues.get(sessionId);
        const queueSize = queue?.length ?? 0;

        this.sessionQueues.delete(sessionId);
        this.failedQueues.delete(sessionId);

        // Also clear any timers
        const timer = this.flushTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          this.flushTimers.delete(sessionId);
        }

        log.warn(
          { sessionId, droppedWrites: queueSize },
          'Dropped stale failed queue (exceeded max age)'
        );
      }
    }
  }

  /**
   * Direct write (bypass batching)
   */
  private async writeDirectly(operation: WriteOperation): Promise<void> {
    this.metrics.directWrites++;
    this.metrics.totalWrites++;

    try {
      const db = await this.getFirestore();
      if (!db) return;

      const ref = db.collection(operation.collection).doc(operation.docId);

      switch (operation.type) {
        case 'set':
          await ref.set(operation.data);
          break;
        case 'update':
          await ref.update(operation.data);
          break;
        case 'merge':
          await ref.set(operation.data, { merge: true });
          break;
      }
    } catch (error) {
      log.warn({ error: String(error), operation }, 'Direct write failed');
    }
  }

  /**
   * Update running averages
   */
  private updateAverages(): void {
    if (this.batchSizes.length > 0) {
      this.metrics.avgBatchSize =
        this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length;
    }
    if (this.batchLatencies.length > 0) {
      this.metrics.avgBatchLatencyMs =
        this.batchLatencies.reduce((a, b) => a + b, 0) / this.batchLatencies.length;
    }

    // Keep only last 100 samples
    if (this.batchSizes.length > 100) {
      this.batchSizes = this.batchSizes.slice(-100);
    }
    if (this.batchLatencies.length > 100) {
      this.batchLatencies = this.batchLatencies.slice(-100);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Flush all sessions (for shutdown)
   */
  async flushAll(): Promise<void> {
    const sessions = Array.from(this.sessionQueues.keys());
    await Promise.all(sessions.map((sessionId) => this.flush(sessionId)));
  }

  /**
   * Clear queue without flushing (for cancellation)
   */
  clear(sessionId: string): void {
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }
    this.sessionQueues.delete(sessionId);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: BatchWriteManager | null = null;

/**
 * Get the batch write manager instance
 */
export function getBatchWriteManager(config?: BatchConfig): BatchWriteManager {
  if (!instance) {
    instance = new BatchWriteManager(config);
  }
  return instance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Queue a write operation for batching
 *
 * @example
 * ```ts
 * // Queue a turn persistence write
 * queueWrite(sessionId, {
 *   collection: 'bogle_users/user123/conversations',
 *   docId: 'conv_abc123',
 *   data: { turnCount: 5, lastUpdate: new Date() },
 *   type: 'merge',
 * });
 *
 * // At turn end, flush all writes
 * await flushBatchWrites(sessionId);
 * ```
 */
export function queueWrite(sessionId: string, operation: WriteOperation): void {
  getBatchWriteManager().queue(sessionId, operation);
}

/**
 * Queue multiple write operations at once
 */
export function queueWrites(sessionId: string, operations: WriteOperation[]): void {
  getBatchWriteManager().queueMultiple(sessionId, operations);
}

/**
 * Flush all queued writes for a session
 */
export async function flushBatchWrites(
  sessionId: string
): Promise<{ success: boolean; count: number; durationMs: number }> {
  return getBatchWriteManager().flush(sessionId);
}

/**
 * Get batch write metrics
 */
export function getBatchWriteMetrics(): BatchMetrics {
  return getBatchWriteManager().getMetrics();
}

/**
 * Clear queued writes for a session (on error/cancel)
 */
export function clearBatchWrites(sessionId: string): void {
  getBatchWriteManager().clear(sessionId);
}

// ============================================================================
// TYPED HELPERS FOR COMMON WRITES
// ============================================================================

/**
 * Queue a turn persistence write
 */
export function queueTurnWrite(
  sessionId: string,
  userId: string,
  conversationId: string,
  turn: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
    metadata?: Record<string, unknown>;
  }
): void {
  const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  queueWrite(sessionId, {
    collection: `bogle_users/${userId}/conversations/${conversationId}/turns`,
    docId: turnId,
    data: {
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp || new Date(),
      ...(turn.metadata && { metadata: turn.metadata }),
    },
    type: 'set',
    priority: 10, // High priority
  });
}

/**
 * Queue a trust system update
 */
export function queueTrustUpdate(
  sessionId: string,
  userId: string,
  systemName: string,
  data: Record<string, unknown>
): void {
  queueWrite(sessionId, {
    collection: `bogle_users/${userId}/trust_profiles`,
    docId: systemName,
    data: {
      ...data,
      updatedAt: new Date(),
    },
    type: 'merge',
    priority: 5, // Medium priority
  });
}

/**
 * Queue a session state update
 */
export function queueSessionUpdate(
  sessionId: string,
  userId: string,
  updates: Record<string, unknown>
): void {
  queueWrite(sessionId, {
    collection: 'bogle_users',
    docId: userId,
    data: {
      ...updates,
      lastActive: new Date(),
    },
    type: 'merge',
    priority: 3, // Lower priority
  });
}
