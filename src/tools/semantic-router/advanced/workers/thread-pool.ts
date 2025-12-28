/**
 * Thread Pool - Node.js Worker Threads for CPU-bound operations
 *
 * Uses actual OS threads for parallel computation:
 * - TF-IDF vectorization
 * - Cosine similarity calculations
 * - Pattern matching across 1000s of tools
 *
 * NOTE: This is a design pattern - actual Worker implementation
 * requires separate worker files and more setup. This shows the
 * architecture for when we need true parallelism.
 *
 * @module tools/semantic-router/advanced/workers/thread-pool
 */

import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'semantic-router:thread-pool' });

// ============================================================================
// TYPES
// ============================================================================

interface WorkerTask<T = unknown> {
  id: string;
  type: 'tfidf' | 'similarity' | 'pattern-batch' | 'embedding-batch';
  payload: unknown;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  startTime: number;
}

interface PoolConfig {
  minWorkers: number;
  maxWorkers: number;
  idleTimeoutMs: number;
  taskTimeoutMs: number;
}

interface PoolStats {
  activeWorkers: number;
  idleWorkers: number;
  pendingTasks: number;
  completedTasks: number;
  avgTaskTimeMs: number;
}

// ============================================================================
// MOCK WORKER (In-process fallback when threads unavailable)
// ============================================================================

/**
 * In-process worker for environments without Worker Threads
 * (e.g., some cloud functions, browsers via bundler)
 */
class MockWorker {
  private busy = false;

  async execute<T>(task: WorkerTask<T>): Promise<T> {
    this.busy = true;

    try {
      // Simulate work based on task type
      const result = await this.processTask(task);
      return result as T;
    } finally {
      this.busy = false;
    }
  }

  private async processTask<T>(task: WorkerTask<T>): Promise<unknown> {
    switch (task.type) {
      case 'tfidf':
        return this.computeTfIdf(task.payload as { document: string; vocabulary: string[] });

      case 'similarity':
        return this.computeSimilarity(task.payload as { vectorA: number[]; vectorB: number[] });

      case 'pattern-batch':
        return this.matchPatterns(task.payload as { text: string; patterns: string[] });

      case 'embedding-batch':
        // This would delegate to embedding service
        return { embeddings: [] };

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private computeTfIdf(payload: { document: string; vocabulary: string[] }): {
    vector: number[];
  } {
    const { document, vocabulary } = payload;
    const tokens = document.toLowerCase().split(/\s+/);
    const termFreq = new Map<string, number>();

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    const vector = vocabulary.map((term) => {
      const tf = (termFreq.get(term) || 0) / tokens.length;
      // Simplified IDF (would need corpus stats in real impl)
      const idf = 1;
      return tf * idf;
    });

    return { vector };
  }

  private computeSimilarity(payload: { vectorA: number[]; vectorB: number[] }): {
    similarity: number;
  } {
    const { vectorA, vectorB } = payload;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    const similarity =
      normA > 0 && normB > 0 ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

    return { similarity };
  }

  private matchPatterns(payload: { text: string; patterns: string[] }): {
    matches: Array<{ pattern: string; matched: boolean }>;
  } {
    const { text, patterns } = payload;

    const matches = patterns.map((pattern) => {
      try {
        const regex = new RegExp(pattern, 'i');
        return { pattern, matched: regex.test(text) };
      } catch {
        return { pattern, matched: false };
      }
    });

    return { matches };
  }

  isBusy(): boolean {
    return this.busy;
  }
}

// ============================================================================
// THREAD POOL
// ============================================================================

export class ThreadPool {
  private config: PoolConfig = {
    minWorkers: 2,
    maxWorkers: 4, // Usually # of CPU cores
    idleTimeoutMs: 30000,
    taskTimeoutMs: 5000,
  };

  private workers: MockWorker[] = [];
  private taskQueue: WorkerTask[] = [];
  private completedCount = 0;
  private totalTaskTime = 0;

  constructor(customConfig?: Partial<PoolConfig>) {
    if (customConfig) {
      Object.assign(this.config, customConfig);
    }

    // Initialize minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.workers.push(new MockWorker());
    }

    log.info({ workers: this.workers.length }, 'Thread pool initialized');
  }

  /**
   * Submit task to pool
   */
  async submit<T>(type: WorkerTask['type'], payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<T> = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        payload,
        resolve,
        reject,
        startTime: Date.now(),
      };

      // Try to find available worker
      const availableWorker = this.workers.find((w) => !w.isBusy());

      if (availableWorker) {
        this.executeTask(availableWorker, task);
      } else if (this.workers.length < this.config.maxWorkers) {
        // Spawn new worker
        const newWorker = new MockWorker();
        this.workers.push(newWorker);
        this.executeTask(newWorker, task);
      } else {
        // Queue the task
        this.taskQueue.push(task as WorkerTask<unknown>);
      }
    });
  }

  /**
   * Batch submit for parallel execution
   */
  async submitBatch<T>(tasks: Array<{ type: WorkerTask['type']; payload: unknown }>): Promise<T[]> {
    return Promise.all(tasks.map((task) => this.submit<T>(task.type, task.payload)));
  }

  /**
   * Compute TF-IDF vector
   */
  async computeTfIdf(document: string, vocabulary: string[]): Promise<number[]> {
    const result = await this.submit<{ vector: number[] }>('tfidf', {
      document,
      vocabulary,
    });
    return result.vector;
  }

  /**
   * Compute batch similarities
   */
  async computeSimilarities(queryVector: number[], targetVectors: number[][]): Promise<number[]> {
    const tasks = targetVectors.map((target) => ({
      type: 'similarity' as const,
      payload: { vectorA: queryVector, vectorB: target },
    }));

    const results = await this.submitBatch<{ similarity: number }>(tasks);
    return results.map((r) => r.similarity);
  }

  /**
   * Match patterns in batch
   */
  async matchPatternsBatch(text: string, patterns: string[]): Promise<Map<string, boolean>> {
    const result = await this.submit<{
      matches: Array<{ pattern: string; matched: boolean }>;
    }>('pattern-batch', { text, patterns });

    const matchMap = new Map<string, boolean>();
    for (const match of result.matches) {
      matchMap.set(match.pattern, match.matched);
    }

    return matchMap;
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const activeWorkers = this.workers.filter((w) => w.isBusy()).length;

    return {
      activeWorkers,
      idleWorkers: this.workers.length - activeWorkers,
      pendingTasks: this.taskQueue.length,
      completedTasks: this.completedCount,
      avgTaskTimeMs: this.completedCount > 0 ? this.totalTaskTime / this.completedCount : 0,
    };
  }

  /**
   * Shutdown pool
   */
  async shutdown(): Promise<void> {
    // Wait for pending tasks
    while (this.taskQueue.length > 0) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 100); });
    }

    // Clear workers
    this.workers = [];
    log.info('Thread pool shutdown complete');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async executeTask<T>(worker: MockWorker, task: WorkerTask<T>): Promise<void> {
    try {
      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Task ${task.id} timed out`)), this.config.taskTimeoutMs);
      });

      const result = await Promise.race([worker.execute(task), timeoutPromise]);

      // Record stats
      this.completedCount++;
      this.totalTaskTime += Date.now() - task.startTime;

      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      // Process next task in queue
      this.processNextTask(worker);
    }
  }

  private processNextTask(worker: MockWorker): void {
    const nextTask = this.taskQueue.shift();
    if (nextTask) {
      this.executeTask(worker, nextTask);
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let poolInstance: ThreadPool | null = null;

export function getThreadPool(): ThreadPool {
  if (!poolInstance) {
    poolInstance = new ThreadPool();
  }
  return poolInstance;
}
