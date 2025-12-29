/**
 * Embedding Worker Integration for Semantic Router
 *
 * Bridges the EmbeddingWorker (background processing) with the semantic router.
 * - Real-time queries: Direct embedding calls (latency-sensitive)
 * - Background tasks: Worker-based batch processing
 *
 * @module tools/semantic-router/embedding-worker-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { AsyncEvents } from '../../services/async-events/index.js';
import { isFeatureEnabled } from '../../config/feature-flags.js';

const log = createLogger({ module: 'semantic-router:embedding-worker' });

// ============================================================================
// TYPES
// ============================================================================

interface PendingEmbedding {
  text: string;
  resolve: (embedding: number[]) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface EmbeddingBatch {
  texts: string[];
  resolvers: Array<(embedding: number[]) => void>;
  rejecters: Array<(error: Error) => void>;
}

// ============================================================================
// WORKER INTEGRATION STATE
// ============================================================================

/** Pending embeddings waiting for worker response */
const pendingEmbeddings = new Map<string, PendingEmbedding>();

/** Batch accumulator for worker-based processing */
let currentBatch: EmbeddingBatch | null = null;
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/** Configuration */
const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 50; // Max wait before flushing batch
const EMBEDDING_TIMEOUT_MS = 10000; // 10s timeout per embedding

// ============================================================================
// BATCH EMBEDDING FUNCTIONS
// ============================================================================

/**
 * Queue an embedding for batch processing via worker.
 * Accumulates embeddings and sends them in batches for efficiency.
 *
 * @param text - Text to embed
 * @returns Promise resolving to embedding vector
 */
export async function queueEmbeddingForWorker(text: string): Promise<number[]> {
  // Feature flag check
  if (!isFeatureEnabled('embeddingWorkerIntegration')) {
    // Fall back to direct embedding
    const { generateEmbedding } = await import('../../memory/embeddings.js');
    return generateEmbedding(text);
  }

  return new Promise<number[]>((resolve, reject) => {
    // Initialize batch if needed
    if (!currentBatch) {
      currentBatch = {
        texts: [],
        resolvers: [],
        rejecters: [],
      };
    }

    // Add to batch
    currentBatch.texts.push(text);
    currentBatch.resolvers.push(resolve);
    currentBatch.rejecters.push(reject);

    // Set timeout to flush batch
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_TIMEOUT_MS);
    }

    // Flush if batch is full
    if (currentBatch.texts.length >= BATCH_SIZE) {
      flushBatch();
    }
  });
}

/**
 * Flush the current batch to the embedding worker.
 */
function flushBatch(): void {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (!currentBatch || currentBatch.texts.length === 0) {
    return;
  }

  const batch = currentBatch;
  currentBatch = null;

  // Generate batch ID
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Store pending resolvers
  batch.texts.forEach((text, index) => {
    const key = `${batchId}_${index}`;
    pendingEmbeddings.set(key, {
      text,
      resolve: batch.resolvers[index],
      reject: batch.rejecters[index],
      timestamp: Date.now(),
    });

    // Set timeout
    setTimeout(() => {
      const pending = pendingEmbeddings.get(key);
      if (pending) {
        pendingEmbeddings.delete(key);
        pending.reject(new Error(`Embedding timeout for: ${text.substring(0, 50)}...`));
      }
    }, EMBEDDING_TIMEOUT_MS);
  });

  // Send to worker
  log.debug(
    { batchId, count: batch.texts.length },
    'Flushing embedding batch to worker'
  );

  AsyncEvents.emit('embedding:batch-generate' as never, {
    texts: batch.texts,
    batchId,
    callback: 'embedding:batch-complete',
  });
}

/**
 * Handle batch completion from worker.
 */
function handleBatchComplete(data: {
  batchId: string;
  embeddings: number[][];
  error?: string;
}): void {
  const { batchId, embeddings, error } = data;

  if (error) {
    log.warn({ batchId, error }, 'Embedding batch failed');
    // Reject all pending in this batch
    for (let i = 0; pendingEmbeddings.has(`${batchId}_${i}`); i++) {
      const pending = pendingEmbeddings.get(`${batchId}_${i}`);
      if (pending) {
        pendingEmbeddings.delete(`${batchId}_${i}`);
        pending.reject(new Error(error));
      }
    }
    return;
  }

  // Resolve each embedding
  embeddings.forEach((embedding, index) => {
    const key = `${batchId}_${index}`;
    const pending = pendingEmbeddings.get(key);
    if (pending) {
      pendingEmbeddings.delete(key);
      pending.resolve(embedding);
    }
  });

  log.debug(
    { batchId, count: embeddings.length },
    'Embedding batch completed'
  );
}

// ============================================================================
// BACKGROUND WARM-UP
// ============================================================================

/**
 * Pre-warm embeddings for tool definitions in background.
 * Uses worker to avoid blocking startup.
 *
 * @param texts - Texts to pre-embed (tool descriptions, triggers, etc.)
 */
export function warmupEmbeddingsInBackground(texts: string[]): void {
  if (!isFeatureEnabled('embeddingWorkerIntegration')) {
    log.debug('Embedding worker integration disabled, skipping warmup');
    return;
  }

  if (texts.length === 0) return;

  log.info({ count: texts.length }, 'Warming up embeddings in background');

  // Fire-and-forget - don't await
  AsyncEvents.emit('embedding:warmup' as never, {
    texts,
    priority: 'low',
  });
}

// ============================================================================
// RUST-ACCELERATED SIMILARITY
// ============================================================================

/**
 * Batch cosine similarity using Rust SIMD acceleration.
 * Falls back to JS if Rust module unavailable.
 *
 * @param query - Query embedding
 * @param candidates - Array of candidate embeddings
 * @returns Array of similarity scores
 */
export async function batchSimilarityOptimized(
  query: number[],
  candidates: number[][]
): Promise<number[]> {
  const { batchCosineSimilarityOptimized } = await import('../../memory/rust-accelerator.js');
  return batchCosineSimilarityOptimized(query, candidates);
}

/**
 * Top-K similarity search using Rust SIMD acceleration.
 *
 * @param query - Query embedding
 * @param candidates - Array of candidate embeddings
 * @param k - Number of top results
 * @param minSimilarity - Minimum similarity threshold
 * @returns TopKResult with indices and similarities
 */
export async function topKSimilarityOptimized(
  query: number[],
  candidates: number[][],
  k: number,
  minSimilarity = 0
): Promise<{ indices: number[]; similarities: number[] }> {
  const { topKSimilar } = await import('../../memory/rust-accelerator.js');
  return topKSimilar(query, candidates, k, minSimilarity);
}

// ============================================================================
// INTEGRATION METRICS
// ============================================================================

interface IntegrationMetrics {
  batchesFlushed: number;
  embeddingsProcessed: number;
  avgBatchSize: number;
  timeoutCount: number;
  workerFailures: number;
}

const metrics: IntegrationMetrics = {
  batchesFlushed: 0,
  embeddingsProcessed: 0,
  avgBatchSize: 0,
  timeoutCount: 0,
  workerFailures: 0,
};

/**
 * Get integration metrics.
 */
export function getIntegrationMetrics(): IntegrationMetrics {
  return { ...metrics };
}

/**
 * Reset integration metrics.
 */
export function resetIntegrationMetrics(): void {
  metrics.batchesFlushed = 0;
  metrics.embeddingsProcessed = 0;
  metrics.avgBatchSize = 0;
  metrics.timeoutCount = 0;
  metrics.workerFailures = 0;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize worker integration.
 * Sets up event listeners for batch completion.
 */
export function initializeWorkerIntegration(): void {
  if (initialized) return;

  // Listen for batch completion
  AsyncEvents.on('embedding:batch-complete' as never, handleBatchComplete as never);

  initialized = true;
  log.info('Embedding worker integration initialized');
}

/**
 * Check if integration is ready.
 */
export function isWorkerIntegrationReady(): boolean {
  return initialized && isFeatureEnabled('embeddingWorkerIntegration');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  queueEmbeddingForWorker,
  warmupEmbeddingsInBackground,
  batchSimilarityOptimized,
  topKSimilarityOptimized,
  initializeWorkerIntegration,
  isWorkerIntegrationReady,
  getIntegrationMetrics,
};
