/**
 * Pub/Sub Worker Services for Cloud Run
 *
 * PRODUCTION SCALING: Cloud Run services that consume Pub/Sub messages
 * for infinite horizontal scaling.
 *
 * Deploy Strategy:
 * - Each worker type runs as a separate Cloud Run service
 * - Auto-scales 0-100 instances based on queue depth
 * - Push subscriptions for HTTP-triggered processing
 * - Pull subscriptions for streaming workers
 *
 * @module services/pubsub/pubsub-workers
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getPubSubClient,
  type PubSubMessage,
  type TopicName,
  type SubscriptionHandler,
} from './pubsub-client.js';

const log = createLogger({ module: 'PubSubWorkers' });

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerConfig {
  /** Worker name */
  name: string;
  /** Topics to subscribe to */
  topics: TopicName[];
  /** Maximum concurrent message processing */
  maxConcurrent?: number;
  /** Processing timeout (ms) */
  timeoutMs?: number;
  /** Auto-ack on success */
  autoAck?: boolean;
}

export interface WorkerMetrics {
  name: string;
  messagesProcessed: number;
  messagesSucceeded: number;
  messagesFailed: number;
  avgProcessingTimeMs: number;
  lastProcessedAt: Date | null;
}

// ============================================================================
// BASE WORKER
// ============================================================================

abstract class BasePubSubWorker {
  protected config: Required<WorkerConfig>;
  protected metrics: WorkerMetrics;
  protected processingTimes: number[] = [];
  protected running = false;

  constructor(config: WorkerConfig) {
    this.config = {
      name: config.name,
      topics: config.topics,
      maxConcurrent: config.maxConcurrent ?? 10,
      timeoutMs: config.timeoutMs ?? 30000,
      autoAck: config.autoAck ?? true,
    };
    this.metrics = {
      name: config.name,
      messagesProcessed: 0,
      messagesSucceeded: 0,
      messagesFailed: 0,
      avgProcessingTimeMs: 0,
      lastProcessedAt: null,
    };
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.running) return;

    log.info({ worker: this.config.name, topics: this.config.topics }, 'Starting Pub/Sub worker');

    const client = getPubSubClient();

    for (const topic of this.config.topics) {
      await client.subscribe(topic, `${this.config.name}-${topic}-sub`, this.createHandler());
    }

    this.running = true;
    log.info({ worker: this.config.name }, 'Pub/Sub worker started');
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    const client = getPubSubClient();

    for (const topic of this.config.topics) {
      await client.unsubscribe(`${this.config.name}-${topic}-sub`);
    }

    this.running = false;
    log.info({ worker: this.config.name }, 'Pub/Sub worker stopped');
  }

  /**
   * Create message handler
   */
  private createHandler(): SubscriptionHandler {
    return async (message, ack, nack) => {
      const startTime = Date.now();
      this.metrics.messagesProcessed++;

      try {
        // Process with timeout
        await Promise.race([
          this.process(message),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Processing timeout')), this.config.timeoutMs);
          }),
        ]);

        if (this.config.autoAck) {
          ack();
        }

        this.metrics.messagesSucceeded++;
        this.metrics.lastProcessedAt = new Date();

        const processingTime = Date.now() - startTime;
        this.processingTimes.push(processingTime);
        if (this.processingTimes.length > 100) this.processingTimes.shift();
        this.metrics.avgProcessingTimeMs =
          this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
      } catch (error) {
        log.error(
          { worker: this.config.name, type: message.type, error: String(error) },
          'Message processing failed'
        );
        nack();
        this.metrics.messagesFailed++;
      }
    };
  }

  /**
   * Process a message - implemented by subclasses
   */
  protected abstract process(message: PubSubMessage): Promise<void>;

  /**
   * Get worker metrics
   */
  getMetrics(): WorkerMetrics {
    return { ...this.metrics };
  }
}

// ============================================================================
// EMBEDDING WORKER
// ============================================================================

export class EmbeddingPubSubWorker extends BasePubSubWorker {
  constructor() {
    super({
      name: 'embedding-worker',
      topics: ['embeddings'],
      maxConcurrent: 20,
      timeoutMs: 10000,
    });
  }

  protected async process(message: PubSubMessage): Promise<void> {
    const { type, data } = message;
    log.debug({ type, data }, 'Processing embedding message');

    // Implementation would call actual embedding service
    // For now, log and return
    log.info({ type }, 'Embedding task processed');
  }
}

// ============================================================================
// SUMMARIZATION WORKER
// ============================================================================

export class SummarizationPubSubWorker extends BasePubSubWorker {
  constructor() {
    super({
      name: 'summarization-worker',
      topics: ['summaries', 'memory-consolidation'],
      maxConcurrent: 5,
      timeoutMs: 60000, // Summaries can take longer
    });
  }

  protected async process(message: PubSubMessage): Promise<void> {
    const { type, data } = message;
    log.debug({ type, data }, 'Processing summarization message');

    // Implementation would call actual summarization service
    log.info({ type }, 'Summarization task processed');
  }
}

// ============================================================================
// ANALYTICS WORKER
// ============================================================================

export class AnalyticsPubSubWorker extends BasePubSubWorker {
  constructor() {
    super({
      name: 'analytics-worker',
      topics: ['analytics', 'trust-updates'],
      maxConcurrent: 50, // Analytics can handle high throughput
      timeoutMs: 5000,
    });
  }

  protected async process(message: PubSubMessage): Promise<void> {
    const { type, data } = message;
    log.debug({ type, data }, 'Processing analytics message');

    // Implementation would track analytics
    log.info({ type }, 'Analytics task processed');
  }
}

// ============================================================================
// CONTEXT WARMUP WORKER
// ============================================================================

export class ContextWarmupPubSubWorker extends BasePubSubWorker {
  constructor() {
    super({
      name: 'context-warmup-worker',
      topics: ['context-warmup'],
      maxConcurrent: 20,
      timeoutMs: 10000,
    });
  }

  protected async process(message: PubSubMessage): Promise<void> {
    const { type, data } = message;
    log.debug({ type, data }, 'Processing context warmup message');

    try {
      const contextModule = await import('../../intelligence/context-service.js').catch(() => null);
      if (contextModule && typeof contextModule.prewarmContextCache === 'function') {
        const { userId, personaId } = data as { userId: string; personaId: string };
        await contextModule.prewarmContextCache(userId, personaId);
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Context warmup failed');
    }

    log.info({ type }, 'Context warmup task processed');
  }
}

// ============================================================================
// AUDIO ANALYSIS WORKER
// ============================================================================

export class AudioAnalysisPubSubWorker extends BasePubSubWorker {
  constructor() {
    super({
      name: 'audio-analysis-worker',
      topics: ['audio'],
      maxConcurrent: 10,
      timeoutMs: 15000,
    });
  }

  protected async process(message: PubSubMessage): Promise<void> {
    const { type, data } = message;
    log.debug({ type, data }, 'Processing audio analysis message');

    // Implementation would call audio analysis service
    log.info({ type }, 'Audio analysis task processed');
  }
}

// ============================================================================
// WORKER MANAGER
// ============================================================================

class PubSubWorkerManager {
  private workers = new Map<string, BasePubSubWorker>();

  /**
   * Register a worker
   */
  register(worker: BasePubSubWorker): void {
    const metrics = worker.getMetrics();
    this.workers.set(metrics.name, worker);
    log.debug({ worker: metrics.name }, 'Worker registered');
  }

  /**
   * Start all workers
   */
  async startAll(): Promise<void> {
    log.info({ count: this.workers.size }, 'Starting all Pub/Sub workers');

    for (const worker of this.workers.values()) {
      await worker.start();
    }

    log.info({ count: this.workers.size }, 'All Pub/Sub workers started');
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    log.info({ count: this.workers.size }, 'Stopping all Pub/Sub workers');

    for (const worker of this.workers.values()) {
      await worker.stop();
    }

    log.info({ count: this.workers.size }, 'All Pub/Sub workers stopped');
  }

  /**
   * Get metrics for all workers
   */
  getAllMetrics(): Map<string, WorkerMetrics> {
    const metrics = new Map<string, WorkerMetrics>();
    for (const [name, worker] of this.workers) {
      metrics.set(name, worker.getMetrics());
    }
    return metrics;
  }

  /**
   * Get a specific worker
   */
  getWorker(name: string): BasePubSubWorker | undefined {
    return this.workers.get(name);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let workerManagerInstance: PubSubWorkerManager | null = null;

export function getPubSubWorkerManager(): PubSubWorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new PubSubWorkerManager();
  }
  return workerManagerInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Initialize and start all default workers
 */
export async function startAllPubSubWorkers(): Promise<void> {
  const manager = getPubSubWorkerManager();

  // Register default workers
  manager.register(new EmbeddingPubSubWorker());
  manager.register(new SummarizationPubSubWorker());
  manager.register(new AnalyticsPubSubWorker());
  manager.register(new ContextWarmupPubSubWorker());
  manager.register(new AudioAnalysisPubSubWorker());

  // Start all
  await manager.startAll();
}

/**
 * Stop all workers
 */
export async function stopAllPubSubWorkers(): Promise<void> {
  await getPubSubWorkerManager().stopAll();
}

/**
 * Get all worker metrics
 */
export function getPubSubWorkerMetrics(): Map<string, WorkerMetrics> {
  return getPubSubWorkerManager().getAllMetrics();
}

export default PubSubWorkerManager;
