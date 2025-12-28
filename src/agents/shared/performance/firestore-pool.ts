/**
 * Firestore Connection Pool
 *
 * Centralized connection management for Firestore to optimize
 * performance under high load.
 *
 * Key Features:
 * - Single shared connection with proper settings
 * - Request queuing during initialization
 * - Automatic retry with exponential backoff
 * - Health monitoring and metrics
 * - Graceful degradation to in-memory fallback
 *
 * @module FirestorePool
 */

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { resilienceMetrics } from '../../../services/observability/resilience-metrics.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'FirestorePool' });

// ============================================================================
// BACKPRESSURE ERROR
// ============================================================================

/**
 * Error thrown when the Firestore pool is under backpressure.
 * Callers should handle this by retrying later or degrading gracefully.
 */
export class BackpressureError extends Error {
  readonly queueDepth: number;
  readonly maxQueueSize: number;

  constructor(message: string, queueDepth: number, maxQueueSize: number) {
    super(message);
    this.name = 'BackpressureError';
    this.queueDepth = queueDepth;
    this.maxQueueSize = maxQueueSize;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface FirestorePoolConfig {
  /** GCP Project ID */
  projectId?: string;
  /** Firestore database ID (default: '(default)') */
  databaseId?: string;
  /** Maximum concurrent operations (default: 100) */
  maxConcurrent?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable request queuing (default: true) */
  enableQueueing?: boolean;
  /** Max queue size before rejecting (default: 1000) */
  maxQueueSize?: number;
  /** Retry configuration */
  retry?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
}

export interface PoolMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retriedRequests: number;
  currentConcurrent: number;
  currentQueueSize: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  connectionHealthy: boolean;
  backpressureActive: boolean;
  backpressureEvents: number;
}

interface QueuedRequest<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  startTime: number;
}

// ============================================================================
// FIRESTORE POOL CLASS
// ============================================================================

class FirestorePool {
  private db: FirestoreType | null = null;
  private initPromise: Promise<FirestoreType | null> | null = null;
  private config: Required<FirestorePoolConfig>;

  // Concurrency management
  private currentConcurrent = 0;
  private requestQueue: Array<QueuedRequest<unknown>> = [];

  // Metrics
  private metrics: PoolMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retriedRequests: 0,
    currentConcurrent: 0,
    currentQueueSize: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    connectionHealthy: false,
    backpressureActive: false,
    backpressureEvents: 0,
  };
  private latencies: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 1000;

  // Backpressure thresholds
  private readonly BACKPRESSURE_WARN_THRESHOLD = 0.7; // 70% of max queue
  private readonly METRICS_INTERVAL_MS = 10_000; // Report metrics every 10s
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: FirestorePoolConfig = {}) {
    this.config = {
      projectId:
        config.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '',
      databaseId: config.databaseId ?? process.env.FIRESTORE_DATABASE ?? '(default)',
      maxConcurrent: config.maxConcurrent ?? 100,
      timeout: config.timeout ?? 30000,
      enableQueueing: config.enableQueueing ?? true,
      maxQueueSize: config.maxQueueSize ?? 1000,
      retry: {
        maxRetries: config.retry?.maxRetries ?? 3,
        initialDelayMs: config.retry?.initialDelayMs ?? 100,
        maxDelayMs: config.retry?.maxDelayMs ?? 5000,
      },
    };

    // Start periodic metrics reporting
    this.startMetricsReporting();
  }

  /**
   * Check if the pool can accept a new request without queueing.
   * Use this before making a request to avoid backpressure errors.
   */
  canAcceptRequest(): boolean {
    return this.currentConcurrent < this.config.maxConcurrent;
  }

  /**
   * Check if the pool is under backpressure (queue is filling up).
   * Returns true when queue depth exceeds warning threshold.
   */
  isUnderPressure(): boolean {
    const threshold = this.config.maxQueueSize * this.BACKPRESSURE_WARN_THRESHOLD;
    return this.requestQueue.length >= threshold;
  }

  /**
   * Get the current queue depth for monitoring.
   */
  getQueueDepth(): number {
    return this.requestQueue.length;
  }

  /**
   * Start periodic metrics reporting to resilience metrics.
   */
  private startMetricsReporting(): void {
    if (this.metricsInterval) return;

    this.metricsInterval = setInterval(() => {
      this.reportMetrics();
    }, this.METRICS_INTERVAL_MS);

    // Don't prevent process from exiting
    if (this.metricsInterval.unref) {
      this.metricsInterval.unref();
    }
  }

  /**
   * Stop metrics reporting (for cleanup).
   */
  stopMetricsReporting(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  /**
   * Report current metrics to resilience monitoring.
   */
  private reportMetrics(): void {
    const backpressureActive = this.isUnderPressure();
    this.metrics.backpressureActive = backpressureActive;

    resilienceMetrics.recordQueueMetric(
      'firestore-pool',
      this.requestQueue.length,
      0, // oldest message age not tracked for Firestore
      this.metrics.successfulRequests / (this.METRICS_INTERVAL_MS / 1000), // rough rate
      backpressureActive
    );

    if (backpressureActive) {
      log.warn(
        {
          queueDepth: this.requestQueue.length,
          maxQueueSize: this.config.maxQueueSize,
          currentConcurrent: this.currentConcurrent,
        },
        'Firestore pool under backpressure'
      );
    }
  }

  /**
   * Get the Firestore instance (initializes if needed)
   */
  async getConnection(): Promise<FirestoreType | null> {
    if (this.db) return this.db;

    // Deduplicate initialization calls
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initialize();
    return this.initPromise;
  }

  /**
   * Initialize Firestore connection
   */
  private async initialize(): Promise<FirestoreType | null> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');

      this.db = new Firestore({
        projectId: this.config.projectId,
        databaseId: this.config.databaseId,
        // Optimize settings for connection pooling
        maxIdleChannels: 10,
        minChannels: 2,
        // Retry settings are handled by our wrapper
      });

      // Test connection
      await this.db.listCollections();

      this.metrics.connectionHealthy = true;
      log.info(
        {
          projectId: this.config.projectId,
          databaseId: this.config.databaseId,
        },
        '🔥 Firestore pool initialized'
      );

      return this.db;
    } catch (error) {
      log.warn({ error: String(error) }, 'Firestore pool initialization failed');
      this.metrics.connectionHealthy = false;
      return null;
    }
  }

  /**
   * Execute an operation with connection pooling and retry.
   * Throws BackpressureError if the queue is full.
   */
  async execute<T>(operation: (db: FirestoreType) => Promise<T>): Promise<T | null> {
    this.metrics.totalRequests++;
    const startTime = Date.now();

    try {
      // Check if we need to queue
      if (this.currentConcurrent >= this.config.maxConcurrent) {
        if (!this.config.enableQueueing) {
          this.metrics.failedRequests++;
          this.metrics.backpressureEvents++;
          throw new BackpressureError(
            'Max concurrent operations reached - queueing disabled',
            0,
            this.config.maxQueueSize
          );
        }

        if (this.requestQueue.length >= this.config.maxQueueSize) {
          this.metrics.failedRequests++;
          this.metrics.backpressureEvents++;
          log.error(
            {
              queueDepth: this.requestQueue.length,
              maxQueueSize: this.config.maxQueueSize,
            },
            'Firestore pool backpressure - rejecting request'
          );
          throw new BackpressureError(
            `Request queue full (${this.requestQueue.length}/${this.config.maxQueueSize})`,
            this.requestQueue.length,
            this.config.maxQueueSize
          );
        }

        // Queue the request
        return await this.queueRequest(() => this.executeInternal(operation));
      }

      return await this.executeInternal(operation);
    } finally {
      this.recordLatency(Date.now() - startTime);
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeInternal<T>(
    operation: (db: FirestoreType) => Promise<T>
  ): Promise<T | null> {
    this.currentConcurrent++;
    this.metrics.currentConcurrent = this.currentConcurrent;

    try {
      const db = await this.getConnection();
      if (!db) {
        this.metrics.failedRequests++;
        return null;
      }

      let lastError: Error | null = null;
      const maxRetries = this.config.retry.maxRetries ?? 3;
      const initialDelayMs = this.config.retry.initialDelayMs ?? 100;
      const maxDelayMs = this.config.retry.maxDelayMs ?? 5000;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await Promise.race([
            operation(db),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout);
            }),
          ]);

          this.metrics.successfulRequests++;
          if (attempt > 0) {
            this.metrics.retriedRequests++;
          }

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Don't retry on certain errors
          if (this.isNonRetryableError(lastError)) {
            break;
          }

          if (attempt < maxRetries) {
            const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
            await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
          }
        }
      }

      this.metrics.failedRequests++;
      log.warn({ error: lastError?.message }, 'Firestore operation failed after retries');
      throw lastError;
    } finally {
      this.currentConcurrent--;
      this.metrics.currentConcurrent = this.currentConcurrent;

      // Process queued requests
      this.processQueue();
    }
  }

  /**
   * Queue a request for later execution
   */
  private queueRequest<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from queue
        const index = this.requestQueue.findIndex((r) => r.timeout === timeout);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
          this.metrics.currentQueueSize = this.requestQueue.length;
        }
        reject(new Error('Request timeout while queued'));
      }, this.config.timeout);

      this.requestQueue.push({
        operation,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        startTime: Date.now(),
      });

      this.metrics.currentQueueSize = this.requestQueue.length;
    });
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (this.requestQueue.length > 0 && this.currentConcurrent < this.config.maxConcurrent) {
      const request = this.requestQueue.shift();
      if (!request) break;

      clearTimeout(request.timeout);
      this.metrics.currentQueueSize = this.requestQueue.length;

      request.operation().then(request.resolve).catch(request.reject);
    }
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('permission denied') ||
      message.includes('not found') ||
      message.includes('invalid argument') ||
      message.includes('already exists')
    );
  }

  /**
   * Record latency sample
   */
  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);

    // Keep bounded
    if (this.latencies.length > this.MAX_LATENCY_SAMPLES) {
      this.latencies.shift();
    }

    // Update metrics
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    this.metrics.avgLatencyMs = Math.round(sum / sorted.length);
    this.metrics.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    this.metrics.p99LatencyMs = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const db = await this.getConnection();
      if (!db) return false;

      await db.listCollections();
      this.metrics.connectionHealthy = true;
      return true;
    } catch {
      this.metrics.connectionHealthy = false;
      return false;
    }
  }

  /**
   * Close connections (for shutdown)
   */
  async close(): Promise<void> {
    // Stop metrics reporting
    this.stopMetricsReporting();

    if (this.db) {
      await this.db.terminate();
      this.db = null;
      this.initPromise = null;
      this.metrics.connectionHealthy = false;
      log.info('Firestore pool closed');
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let poolInstance: FirestorePool | null = null;

/**
 * Get the shared Firestore pool instance
 */
export function getFirestorePool(config?: FirestorePoolConfig): FirestorePool {
  if (!poolInstance) {
    poolInstance = new FirestorePool(config);
  }
  return poolInstance;
}

/**
 * Execute a Firestore operation using the pool
 *
 * @example
 * ```ts
 * const users = await executeWithPool(async (db) => {
 *   const snapshot = await db.collection('users').limit(10).get();
 *   return snapshot.docs.map(doc => doc.data());
 * });
 * ```
 */
export async function executeWithPool<T>(
  operation: (db: FirestoreType) => Promise<T>
): Promise<T | null> {
  return getFirestorePool().execute(operation);
}

/**
 * Reset pool (for testing)
 */
export async function resetFirestorePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.close();
    poolInstance = null;
  }
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Get a document with pooling
 */
export async function getDocument<T>(collection: string, docId: string): Promise<T | null> {
  return executeWithPool(async (db) => {
    const doc = await db.collection(collection).doc(docId).get();
    return doc.exists ? (doc.data() as T) : null;
  });
}

/**
 * Set a document with pooling
 */
export async function setDocument<T extends Record<string, unknown>>(
  collection: string,
  docId: string,
  data: T,
  options?: { merge?: boolean }
): Promise<boolean> {
  const result = await executeWithPool(async (db) => {
    await db
      .collection(collection)
      .doc(docId)
      .set(cleanForFirestore(data), options ?? {});
    return true;
  });
  return result ?? false;
}

/**
 * Query documents with pooling
 */
export async function queryDocuments<T>(
  collection: string,
  queryFn: (ref: FirebaseFirestore.CollectionReference) => FirebaseFirestore.Query
): Promise<T[]> {
  const result = await executeWithPool(async (db) => {
    const ref = db.collection(collection);
    const query = queryFn(ref as unknown as FirebaseFirestore.CollectionReference);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
  });
  return result ?? [];
}

/**
 * Batch write with pooling
 */
export async function batchWrite(
  operations: Array<{
    type: 'set' | 'update' | 'delete';
    collection: string;
    docId: string;
    data?: Record<string, unknown>;
  }>
): Promise<boolean> {
  if (operations.length === 0) return true;

  const result = await executeWithPool(async (db) => {
    const batch = db.batch();

    for (const op of operations) {
      const ref = db.collection(op.collection).doc(op.docId);

      switch (op.type) {
        case 'set':
          batch.set(ref, op.data ?? {});
          break;
        case 'update':
          batch.update(ref, op.data ?? {});
          break;
        case 'delete':
          batch.delete(ref);
          break;
      }
    }

    await batch.commit();
    return true;
  });

  return result ?? false;
}

export { FirestorePool };
