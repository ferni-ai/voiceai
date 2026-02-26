/**
 * Embedding Worker
 *
 * Background worker for CPU/API-intensive embedding operations.
 * Offloads embedding generation from the main conversation thread.
 *
 * Operations handled:
 * - Batch embedding generation (user messages, memories)
 * - Memory vector indexing
 * - Similarity search pre-computation
 * - Embedding cache warming
 *
 * This prevents embedding operations from adding 50-200ms latency
 * to conversation turns.
 */

/* eslint-disable no-restricted-imports -- Workers need direct service imports */
/* eslint-disable no-await-in-loop -- Sequential processing required for embedding batches */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import { AsyncEvents, type EventPayload } from '../services/async-events/index.js';
import { createLogger } from '../utils/safe-logger.js';

const _log = createLogger({ module: 'EmbeddingWorker' });

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingJob {
  type: 'single' | 'batch' | 'index' | 'warmup';
  texts: string[];
  userId?: string;
  sessionId?: string;
  priority: 'high' | 'normal' | 'low';
  callback?: string; // Event to emit when done
}

export interface EmbeddingResult {
  jobId: string;
  embeddings: number[][];
  durationMs: number;
  cacheHits: number;
  apiCalls: number;
}

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

// Backpressure: max jobs in queue before rejecting new ones
const MAX_QUEUE_DEPTH = 500;

export class EmbeddingWorker extends LocalWorker {
  private jobQueue: Array<EmbeddingJob & { jobId: string }> = [];
  private isProcessing = false;
  private batchSize = 10; // Process 10 texts per API call
  private concurrentBatches = 3; // Max concurrent API calls
  private embeddingStats = {
    totalJobs: 0,
    totalTexts: 0,
    cacheHits: 0,
    apiCalls: 0,
    avgLatencyMs: 0,
    latencies: [] as number[],
  };

  constructor(config?: Partial<WorkerConfig>) {
    super({
      name: 'EmbeddingWorker',
      subscriptionName: 'ferni-embedding-sub',
      handleTypes: [
        'embedding:generate',
        'embedding:batch-generate',
      ] as WorkerConfig['handleTypes'],
      ...config,
    });
  }

  protected async process(payload: EventPayload): Promise<void> {
    const { type, data, sessionId, userId } = payload;

    switch (type) {
      case 'embedding:generate':
        await this.handleSingleGeneration(data as { text: string }, userId, sessionId);
        break;

      case 'embedding:batch-generate':
        await this.handleBatchGeneration(data as { texts: string[] }, userId, sessionId);
        break;

      default:
        this.log.debug({ type }, 'Unhandled embedding event type');
    }
  }

  /**
   * Queue a single embedding generation
   */
  private async handleSingleGeneration(
    data: { text: string },
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    // Backpressure check
    if (this.jobQueue.length >= MAX_QUEUE_DEPTH) {
      this.log.warn({ queueDepth: this.jobQueue.length }, 'Backpressure: dropping embedding job');
      return;
    }

    const jobId = `single_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.jobQueue.push({
      jobId,
      type: 'single',
      texts: [data.text],
      userId,
      sessionId,
      priority: 'high',
    });

    this.embeddingStats.totalJobs++;
    this.embeddingStats.totalTexts++;

    await this.processQueue();
  }

  /**
   * Queue a batch embedding generation
   *
   * NOTE: The data object can include callback and batchId for async result delivery.
   * This enables the embedding-worker-integration to receive results via AsyncEvents.
   */
  private async handleBatchGeneration(
    data: { texts: string[]; callback?: string; batchId?: string },
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    // Backpressure check
    if (this.jobQueue.length >= MAX_QUEUE_DEPTH) {
      this.log.warn(
        { queueDepth: this.jobQueue.length },
        'Backpressure: dropping batch embedding job'
      );
      // If callback specified, notify of rejection
      if (data.callback && data.batchId) {
        AsyncEvents.emit(data.callback as never, {
          batchId: data.batchId,
          embeddings: [],
          error: 'Queue full - job rejected due to backpressure',
        });
      }
      return;
    }

    // Use provided batchId or generate one
    const jobId = data.batchId || `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.jobQueue.push({
      jobId,
      type: 'batch',
      texts: data.texts,
      userId,
      sessionId,
      priority: 'normal',
      callback: data.callback, // CRITICAL: Pass callback through for async result delivery
    });

    this.embeddingStats.totalJobs++;
    this.embeddingStats.totalTexts += data.texts.length;

    await this.processQueue();
  }

  /**
   * Process queued embedding jobs
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (this.jobQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // Sort by priority
      this.jobQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Process in batches
      while (this.jobQueue.length > 0) {
        // Take up to `concurrentBatches` jobs
        const jobs = this.jobQueue.splice(0, this.concurrentBatches);

        // Process all jobs in parallel
        await Promise.all(jobs.map(async (job) => this.processJob(job)));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single embedding job
   */
  private async processJob(job: EmbeddingJob & { jobId: string }): Promise<void> {
    const startTime = Date.now();
    let cacheHits = 0;
    let apiCalls = 0;

    try {
      const { embedCached, getEmbeddingCache } =
        await import('../memory/embedding-cache.js');
      const cache = getEmbeddingCache();

      const embeddings: number[][] = [];

      // Check cache first
      const uncached: string[] = [];
      for (const text of job.texts) {
        const cachedResult = await cache.get(text);
        if (cachedResult.ok) {
          embeddings.push(cachedResult.value);
          cacheHits++;
        } else {
          uncached.push(text);
        }
      }

      // Generate embeddings for uncached texts
      if (uncached.length > 0) {
        // Batch into chunks of `batchSize`
        for (let i = 0; i < uncached.length; i += this.batchSize) {
          const batch = uncached.slice(i, i + this.batchSize);
          const batchEmbeddings = await Promise.all(
            batch.map(async (text) => {
              const result = await embedCached(text);
              return result.ok ? result.value : [];
            })
          );
          embeddings.push(...batchEmbeddings);
          apiCalls++;
        }
      }

      const durationMs = Date.now() - startTime;

      // Update stats
      this.embeddingStats.cacheHits += cacheHits;
      this.embeddingStats.apiCalls += apiCalls;
      this.embeddingStats.latencies.push(durationMs);
      if (this.embeddingStats.latencies.length > 100) {
        this.embeddingStats.latencies.shift();
      }
      this.embeddingStats.avgLatencyMs =
        this.embeddingStats.latencies.reduce((a, b) => a + b, 0) /
        this.embeddingStats.latencies.length;

      this.log.debug(
        {
          jobId: job.jobId,
          texts: job.texts.length,
          cacheHits,
          apiCalls,
          durationMs,
        },
        'Embedding job complete'
      );

      // Emit completion event if callback specified
      if (job.callback) {
        AsyncEvents.emit(job.callback as never, {
          jobId: job.jobId,
          batchId: job.jobId, // Alias for embedding-worker-integration compatibility
          embeddings,
          durationMs,
          cacheHits,
          apiCalls,
        });
      }
    } catch (error) {
      this.log.warn({ jobId: job.jobId, error: String(error) }, 'Embedding job failed');
      // Emit error callback if specified
      if (job.callback) {
        AsyncEvents.emit(job.callback as never, {
          jobId: job.jobId,
          batchId: job.jobId,
          embeddings: [],
          error: String(error),
        });
      }
    }
  }

  /**
   * Get worker stats
   */
  getEmbeddingStats(): typeof this.embeddingStats {
    return { ...this.embeddingStats };
  }
}

// ============================================================================
// SINGLETON & STARTUP
// ============================================================================

let embeddingWorkerInstance: EmbeddingWorker | null = null;

export function getEmbeddingWorker(): EmbeddingWorker {
  if (!embeddingWorkerInstance) {
    embeddingWorkerInstance = new EmbeddingWorker();
  }
  return embeddingWorkerInstance;
}

export async function startEmbeddingWorker(): Promise<EmbeddingWorker> {
  const worker = getEmbeddingWorker();
  await worker.start();
  return worker;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Queue embedding generation (fire-and-forget)
 */
export function queueEmbedding(
  text: string,
  context?: { userId?: string; sessionId?: string }
): void {
  AsyncEvents.emit('embedding:generate' as never, { text }, context);
}

/**
 * Queue batch embedding generation (fire-and-forget)
 */
export function queueBatchEmbeddings(
  texts: string[],
  context?: { userId?: string; sessionId?: string }
): void {
  AsyncEvents.emit('embedding:batch' as never, { texts }, context);
}

/**
 * Queue memory indexing (fire-and-forget)
 */
export function queueMemoryIndexing(userId: string, memoryIds: string[]): void {
  AsyncEvents.emit('embedding:index' as never, { userId, memoryIds });
}

export default EmbeddingWorker;
