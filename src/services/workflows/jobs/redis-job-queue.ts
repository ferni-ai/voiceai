/**
 * Redis-Backed Job Queue
 *
 * Persistent job queue using Redis for background worker processing.
 * Provides distributed job processing across multiple workers with:
 * - Priority-based ordering (Sorted Sets)
 * - Job persistence (Hashes)
 * - Distributed locking (SETNX)
 * - Graceful fallback to in-memory when Redis unavailable
 *
 * ARCHITECTURE:
 * - Jobs stored in Redis Hash: jobs:{jobId} -> Job JSON
 * - Queue stored in Sorted Set: queue:{priority} -> jobId with score = timestamp
 * - Processing lock: lock:{jobId} -> workerId with TTL
 * - Stats in Hash: stats:queue -> counters
 *
 * @module services/workflows/jobs/redis-job-queue
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { randomUUID } from 'crypto';
import type { Job, JobStatus, JobPriority, JobHandler, QueueStats } from './job-queue.js';

const log = createLogger({ module: 'redis-job-queue' });

// ============================================================================
// REDIS KEY PATTERNS
// ============================================================================

const KEYS = {
  job: (id: string) => `ferni:jobs:${id}`,
  queue: (priority: JobPriority) => `ferni:queue:${priority}`,
  processing: () => `ferni:processing`,
  lock: (id: string) => `ferni:lock:${id}`,
  stats: () => `ferni:stats:queue`,
  deadLetter: () => `ferni:deadletter`,
} as const;

// Priority scores (lower = higher priority)
const PRIORITY_SCORES: Record<JobPriority, number> = {
  critical: 0,
  high: 1000,
  normal: 2000,
  low: 3000,
};

// ============================================================================
// REDIS JOB QUEUE
// ============================================================================

export class RedisJobQueue {
  private handlers: Map<string, JobHandler> = new Map();
  private workerId: string;
  private isProcessing = false;
  private workerInterval: NodeJS.Timeout | null = null;
  private concurrency: number;
  private redisAvailable = false;
  private redis: RedisClient | null = null;

  // Fallback in-memory queue
  private memoryJobs: Map<string, Job> = new Map();
  private memoryQueue: string[] = [];
  private memoryProcessing: Set<string> = new Set();

  constructor(options?: { concurrency?: number }) {
    this.concurrency = options?.concurrency ?? 5;
    this.workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
    log.info({ workerId: this.workerId, concurrency: this.concurrency }, 'Redis job queue created');
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize Redis connection
   * Creates a dedicated ioredis connection for job queue operations
   */
  async initialize(): Promise<boolean> {
    try {
      // Dynamic import of ioredis
      const Redis = (await import('ioredis')).default;

      const redisUrl = process.env.REDIS_URL;
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
      const redisPassword = process.env.REDIS_PASSWORD;

      let redisClient: InstanceType<typeof Redis>;

      if (redisUrl) {
        redisClient = new Redis(redisUrl, {
          keyPrefix: 'ferni:',
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
      } else {
        redisClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          keyPrefix: '', // We handle prefixes ourselves in KEYS
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
      }

      // Suppress connection errors (graceful degradation)
      redisClient.on('error', (error) => {
        log.debug({ error: String(error) }, 'Redis job queue connection error (non-blocking)');
      });

      // Test connection
      await redisClient.connect();
      await redisClient.ping();

      this.redis = redisClient as unknown as RedisClient;
      this.redisAvailable = true;
      log.info('Redis job queue initialized with Redis backend');
      return true;
    } catch (error) {
      log.warn({ error: String(error) }, 'Redis unavailable, using in-memory fallback');
    }

    this.redisAvailable = false;
    log.info('Redis job queue initialized with in-memory fallback');
    return false;
  }

  // ==========================================================================
  // HANDLER REGISTRATION
  // ==========================================================================

  /**
   * Register a job handler
   */
  registerHandler<T, R>(handler: JobHandler<T, R>): void {
    this.handlers.set(handler.type, handler as JobHandler);
    log.debug({ type: handler.type }, 'Job handler registered');
  }

  /**
   * Unregister a job handler
   */
  unregisterHandler(type: string): void {
    this.handlers.delete(type);
  }

  // ==========================================================================
  // JOB MANAGEMENT
  // ==========================================================================

  /**
   * Enqueue a new job
   */
  async enqueue<T>(params: {
    type: string;
    payload: T;
    priority?: JobPriority;
    scheduledFor?: Date;
    maxAttempts?: number;
    timeout?: number;
    userId?: string;
    correlationId?: string;
    tags?: string[];
  }): Promise<Job<T>> {
    const job: Job<T> = {
      id: randomUUID(),
      type: params.type,
      payload: params.payload,
      status: 'pending',
      priority: params.priority || 'normal',
      createdAt: new Date(),
      scheduledFor: params.scheduledFor,
      attempts: 0,
      maxAttempts: params.maxAttempts || 3,
      timeout: params.timeout || 30000,
      userId: params.userId,
      correlationId: params.correlationId,
      tags: params.tags || [],
    };

    if (this.redisAvailable && this.redis) {
      await this.enqueueRedis(job);
    } else {
      this.enqueueMemory(job);
    }

    log.info(
      { jobId: job.id, type: job.type, priority: job.priority, redis: this.redisAvailable },
      'Job enqueued'
    );

    return job;
  }

  private async enqueueRedis(job: Job): Promise<void> {
    if (!this.redis) return;

    // Store job data
    await this.redis.hset(KEYS.job(job.id), 'data', JSON.stringify(job));

    // Calculate score: priority base + timestamp for FIFO within priority
    const score = PRIORITY_SCORES[job.priority] + (job.scheduledFor?.getTime() ?? Date.now());

    // Add to queue
    await this.redis.zadd(KEYS.queue(job.priority), score.toString(), job.id);

    // Update stats
    await this.redis.hincrby(KEYS.stats(), 'total_enqueued', 1);
    await this.redis.hincrby(KEYS.stats(), 'pending', 1);
  }

  private enqueueMemory(job: Job): void {
    this.memoryJobs.set(job.id, job);

    // Insert in priority order
    const priorityOrder: Record<JobPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const newPriority = priorityOrder[job.priority];
    let insertIndex = this.memoryQueue.length;

    for (let i = 0; i < this.memoryQueue.length; i++) {
      const existingJob = this.memoryJobs.get(this.memoryQueue[i]);
      if (existingJob) {
        const existingPriority = priorityOrder[existingJob.priority];
        if (newPriority < existingPriority) {
          insertIndex = i;
          break;
        }
      }
    }

    this.memoryQueue.splice(insertIndex, 0, job.id);
  }

  /**
   * Get a job by ID
   */
  async getJob<T>(jobId: string): Promise<Job<T> | undefined> {
    if (this.redisAvailable && this.redis) {
      const data = await this.redis.hget(KEYS.job(jobId), 'data');
      if (data) {
        return JSON.parse(data) as Job<T>;
      }
      return undefined;
    }

    return this.memoryJobs.get(jobId) as Job<T> | undefined;
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status !== 'pending') {
      return false;
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    if (this.redisAvailable && this.redis) {
      await this.redis.hset(KEYS.job(jobId), 'data', JSON.stringify(job));
      await this.redis.zrem(KEYS.queue(job.priority), jobId);
      await this.redis.hincrby(KEYS.stats(), 'pending', -1);
      await this.redis.hincrby(KEYS.stats(), 'cancelled', 1);
    } else {
      this.memoryJobs.set(jobId, job);
      const index = this.memoryQueue.indexOf(jobId);
      if (index !== -1) {
        this.memoryQueue.splice(index, 1);
      }
    }

    log.info({ jobId }, 'Job cancelled');
    return true;
  }

  // ==========================================================================
  // JOB PROCESSING
  // ==========================================================================

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.workerInterval) {
      return;
    }

    this.isProcessing = true;
    this.workerInterval = setInterval(() => this.processJobs(), 100);
    log.info({ workerId: this.workerId }, 'Job queue processing started');
  }

  /**
   * Stop processing jobs
   */
  stop(): void {
    this.isProcessing = false;
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
    log.info({ workerId: this.workerId }, 'Job queue processing stopped');
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (!this.isProcessing) return;

    const currentProcessing = this.redisAvailable
      ? await this.getRedisProcessingCount()
      : this.memoryProcessing.size;

    const availableSlots = this.concurrency - currentProcessing;
    if (availableSlots <= 0) return;

    // Acquire jobs
    const jobs = this.redisAvailable
      ? await this.acquireJobsRedis(availableSlots)
      : this.acquireJobsMemory(availableSlots);

    // Process in parallel
    for (const jobId of jobs) {
      this.processJob(jobId).catch((error) => {
        log.error({ error: String(error), jobId }, 'Job processing error');
      });
    }
  }

  private async getRedisProcessingCount(): Promise<number> {
    if (!this.redis) return 0;
    return await this.redis.scard(KEYS.processing());
  }

  private async acquireJobsRedis(count: number): Promise<string[]> {
    if (!this.redis) return [];

    const acquired: string[] = [];
    const now = Date.now();

    // Check each priority queue in order
    for (const priority of ['critical', 'high', 'normal', 'low'] as JobPriority[]) {
      if (acquired.length >= count) break;

      // Get ready jobs (score <= now means scheduled time passed)
      const maxScore = PRIORITY_SCORES[priority] + now;
      const jobIds = await this.redis.zrangebyscore(
        KEYS.queue(priority),
        '-inf',
        maxScore.toString(),
        'LIMIT',
        '0',
        String(count - acquired.length)
      );

      for (const jobId of jobIds) {
        // Try to acquire lock
        const lockKey = KEYS.lock(jobId);
        const locked = await this.redis.set(lockKey, this.workerId, 'NX', 'EX', 60);

        if (locked) {
          // Remove from queue
          await this.redis.zrem(KEYS.queue(priority), jobId);
          // Add to processing set
          await this.redis.sadd(KEYS.processing(), jobId);

          acquired.push(jobId);
        }
      }
    }

    return acquired;
  }

  private acquireJobsMemory(count: number): string[] {
    const acquired: string[] = [];
    const now = new Date();

    for (const jobId of [...this.memoryQueue]) {
      if (acquired.length >= count) break;

      const job = this.memoryJobs.get(jobId);
      if (!job) continue;

      // Check if scheduled
      if (job.scheduledFor && job.scheduledFor > now) continue;

      // Remove from queue
      const index = this.memoryQueue.indexOf(jobId);
      if (index !== -1) {
        this.memoryQueue.splice(index, 1);
      }

      // Add to processing
      this.memoryProcessing.add(jobId);
      acquired.push(jobId);
    }

    return acquired;
  }

  /**
   * Process a single job
   */
  private async processJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      await this.releaseJob(jobId);
      return;
    }

    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.failJob(job, `No handler registered for job type: ${job.type}`);
      return;
    }

    // Update job status
    job.status = 'processing';
    job.startedAt = new Date();
    job.attempts++;
    job.workerId = this.workerId;

    await this.updateJob(job);

    log.debug({ jobId, type: job.type, attempt: job.attempts }, 'Processing job');

    try {
      // Execute with timeout
      const result = await Promise.race([
        handler.handler(job),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Job timeout')), job.timeout)),
      ]);

      await this.completeJob(job, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (job.attempts < job.maxAttempts) {
        // Retry
        job.status = 'pending';
        job.lastError = errorMessage;
        job.startedAt = undefined;
        job.workerId = undefined;

        await this.updateJob(job);
        await this.requeueJob(job);

        log.warn(
          {
            jobId,
            type: job.type,
            attempt: job.attempts,
            maxAttempts: job.maxAttempts,
            error: errorMessage,
          },
          'Job failed, will retry'
        );
      } else {
        // Move to dead letter
        await this.failJob(job, errorMessage);
      }
    }
  }

  private async updateJob(job: Job): Promise<void> {
    if (this.redisAvailable && this.redis) {
      await this.redis.hset(KEYS.job(job.id), 'data', JSON.stringify(job));
    } else {
      this.memoryJobs.set(job.id, job);
    }
  }

  private async completeJob(job: Job, result: unknown): Promise<void> {
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result;

    await this.updateJob(job);
    await this.releaseJob(job.id);

    if (this.redisAvailable && this.redis) {
      await this.redis.hincrby(KEYS.stats(), 'completed', 1);
      await this.redis.hincrby(KEYS.stats(), 'pending', -1);
    }

    log.info(
      { jobId: job.id, type: job.type, durationMs: Date.now() - job.startedAt!.getTime() },
      'Job completed'
    );
  }

  private async failJob(job: Job, error: string): Promise<void> {
    job.status = 'dead_letter';
    job.completedAt = new Date();
    job.lastError = error;

    await this.updateJob(job);
    await this.releaseJob(job.id);

    if (this.redisAvailable && this.redis) {
      await this.redis.lpush(KEYS.deadLetter(), job.id);
      await this.redis.hincrby(KEYS.stats(), 'failed', 1);
      await this.redis.hincrby(KEYS.stats(), 'pending', -1);
    }

    log.error({ jobId: job.id, type: job.type, error }, 'Job failed permanently');
  }

  private async requeueJob(job: Job): Promise<void> {
    await this.releaseJob(job.id);

    if (this.redisAvailable && this.redis) {
      // Add back to queue with backoff
      const backoffMs = Math.min(1000 * Math.pow(2, job.attempts - 1), 60000);
      const score = PRIORITY_SCORES[job.priority] + Date.now() + backoffMs;
      await this.redis.zadd(KEYS.queue(job.priority), score.toString(), job.id);
    } else {
      // Re-add to memory queue
      this.enqueueMemory(job);
    }
  }

  private async releaseJob(jobId: string): Promise<void> {
    if (this.redisAvailable && this.redis) {
      await this.redis.del(KEYS.lock(jobId));
      await this.redis.srem(KEYS.processing(), jobId);
    } else {
      this.memoryProcessing.delete(jobId);
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (this.redisAvailable && this.redis) {
      const stats = await this.redis.hgetall(KEYS.stats());
      return {
        pending: parseInt(stats.pending || '0', 10),
        processing: await this.redis.scard(KEYS.processing()),
        completed: parseInt(stats.completed || '0', 10),
        failed: parseInt(stats.failed || '0', 10),
        deadLetter: await this.redis.llen(KEYS.deadLetter()),
        throughput: 0, // TODO: Calculate from time series
      };
    }

    return {
      pending: this.memoryQueue.length,
      processing: this.memoryProcessing.size,
      completed: 0, // Not tracked in memory mode
      failed: 0,
      deadLetter: 0,
      throughput: 0,
    };
  }

  /**
   * Check if Redis is being used
   */
  isUsingRedis(): boolean {
    return this.redisAvailable;
  }
}

// ============================================================================
// REDIS CLIENT INTERFACE
// ============================================================================

interface RedisClient {
  hset: (key: string, field: string, value: string) => Promise<number>;
  hget: (key: string, field: string) => Promise<string | null>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  hincrby: (key: string, field: string, increment: number) => Promise<number>;
  zadd: (key: string, score: string, member: string) => Promise<number>;
  zrem: (key: string, member: string) => Promise<number>;
  zrangebyscore: (key: string, min: string, max: string, ...args: string[]) => Promise<string[]>;
  sadd: (key: string, member: string) => Promise<number>;
  srem: (key: string, member: string) => Promise<number>;
  scard: (key: string) => Promise<number>;
  lpush: (key: string, value: string) => Promise<number>;
  llen: (key: string) => Promise<number>;
  set: (
    key: string,
    value: string,
    mode: string,
    type: string,
    ttl: number
  ) => Promise<string | null>;
  del: (key: string) => Promise<number>;
}

// ============================================================================
// SINGLETON
// ============================================================================

let queueInstance: RedisJobQueue | null = null;

/**
 * Get the Redis job queue singleton
 */
export function getRedisJobQueue(): RedisJobQueue {
  if (!queueInstance) {
    queueInstance = new RedisJobQueue();
  }
  return queueInstance;
}

/**
 * Initialize the Redis job queue
 */
export async function initializeRedisJobQueue(): Promise<boolean> {
  const queue = getRedisJobQueue();
  return await queue.initialize();
}

/**
 * Shutdown the Redis job queue
 */
export async function shutdownRedisJobQueue(): Promise<void> {
  if (queueInstance) {
    queueInstance.stop();
    queueInstance = null;
  }
}

export default RedisJobQueue;
