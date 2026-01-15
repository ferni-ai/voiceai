/**
 * Job Queue Service
 *
 * Background job processing infrastructure:
 * - Priority-based job queue
 * - Concurrent job execution
 * - Job persistence and recovery
 * - Dead letter handling
 * - Monitoring and metrics
 *
 * @module services/workflows/jobs/job-queue
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { randomUUID } from 'crypto';

const log = createLogger({ module: 'job-queue' });

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';

export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: JobStatus;
  priority: JobPriority;

  // Timing
  createdAt: Date;
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Execution
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  result?: unknown;

  // Metadata
  userId?: string;
  correlationId?: string;
  tags: string[];

  // Processing
  workerId?: string;
  timeout: number; // milliseconds
}

export interface JobHandler<T = unknown, R = unknown> {
  type: string;
  handler: (job: Job<T>) => Promise<R>;
  options?: {
    concurrency?: number;
    timeout?: number;
    maxAttempts?: number;
    backoffMs?: number;
  };
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  throughput: number; // Jobs per minute
}

// ============================================================================
// JOB QUEUE CLASS
// ============================================================================

export class JobQueue {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private pendingQueue: string[] = [];
  private processingJobs: Set<string> = new Set();
  private completedCount = 0;
  private failedCount = 0;
  private startTime = Date.now();
  private workerInterval: NodeJS.Timeout | null = null;
  private concurrency = 5;
  private isProcessing = false;

  constructor(options?: { concurrency?: number }) {
    if (options?.concurrency) {
      this.concurrency = options.concurrency;
    }
    log.info({ concurrency: this.concurrency }, 'Job queue initialized');
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

    this.jobs.set(job.id, job as Job);
    this.insertIntoQueue(job.id, job.priority);

    log.info({ jobId: job.id, type: job.type, priority: job.priority }, 'Job enqueued');

    return job;
  }

  /**
   * Insert job into priority queue
   */
  private insertIntoQueue(jobId: string, priority: JobPriority): void {
    const priorityOrder: Record<JobPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const newPriority = priorityOrder[priority];
    let insertIndex = this.pendingQueue.length;

    for (let i = 0; i < this.pendingQueue.length; i++) {
      const existingJob = this.jobs.get(this.pendingQueue[i]);
      if (existingJob) {
        const existingPriority = priorityOrder[existingJob.priority];
        if (newPriority < existingPriority) {
          insertIndex = i;
          break;
        }
      }
    }

    this.pendingQueue.splice(insertIndex, 0, jobId);
  }

  /**
   * Get a job by ID
   */
  getJob<T>(jobId: string): Job<T> | undefined {
    return this.jobs.get(jobId) as Job<T> | undefined;
  }

  /**
   * Cancel a pending job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'pending') {
      return false;
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    // Remove from queue
    const index = this.pendingQueue.indexOf(jobId);
    if (index !== -1) {
      this.pendingQueue.splice(index, 1);
    }

    log.info({ jobId }, 'Job cancelled');
    return true;
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || (job.status !== 'failed' && job.status !== 'dead_letter')) {
      return false;
    }

    job.status = 'pending';
    job.attempts = 0;
    job.lastError = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;

    this.insertIntoQueue(jobId, job.priority);

    log.info({ jobId }, 'Job scheduled for retry');
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
    log.info('Job queue processing started');
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
    log.info('Job queue processing stopped');
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (!this.isProcessing) return;

    // Check how many slots are available
    const availableSlots = this.concurrency - this.processingJobs.size;
    if (availableSlots <= 0) return;

    // Get jobs that are ready to process
    const now = new Date();
    const readyJobs: string[] = [];

    for (const jobId of this.pendingQueue) {
      if (readyJobs.length >= availableSlots) break;

      const job = this.jobs.get(jobId);
      if (!job) continue;

      // Check if scheduled
      if (job.scheduledFor && job.scheduledFor > now) continue;

      readyJobs.push(jobId);
    }

    // Process ready jobs
    for (const jobId of readyJobs) {
      // Remove from pending queue
      const index = this.pendingQueue.indexOf(jobId);
      if (index !== -1) {
        this.pendingQueue.splice(index, 1);
      }

      // Process in background
      this.processJob(jobId).catch((error) => {
        log.error({ error: String(error), jobId }, 'Job processing error');
      });
    }
  }

  /**
   * Process a single job
   */
  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'failed';
      job.lastError = `No handler registered for job type: ${job.type}`;
      this.failedCount++;
      return;
    }

    // Mark as processing
    job.status = 'processing';
    job.startedAt = new Date();
    job.attempts++;
    job.workerId = `worker-${process.pid}`;
    this.processingJobs.add(jobId);

    log.debug({ jobId, type: job.type, attempt: job.attempts }, 'Processing job');

    try {
      // Execute with timeout
      const result = await Promise.race([
        handler.handler(job),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Job timeout')), job.timeout)),
      ]);

      // Success
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      this.completedCount++;

      log.info(
        { jobId, type: job.type, duration: Date.now() - job.startedAt!.getTime() },
        'Job completed'
      );
    } catch (error) {
      const errorMsg = String(error);
      job.lastError = errorMsg;

      // Check if should retry
      if (job.attempts < job.maxAttempts) {
        job.status = 'pending';

        // Exponential backoff
        const backoffMs = handler.options?.backoffMs || 1000;
        const delay = backoffMs * Math.pow(2, job.attempts - 1);
        job.scheduledFor = new Date(Date.now() + delay);

        this.insertIntoQueue(jobId, job.priority);

        log.warn(
          { jobId, type: job.type, attempt: job.attempts, nextRetry: job.scheduledFor },
          'Job failed, scheduling retry'
        );
      } else {
        job.status = 'dead_letter';
        job.completedAt = new Date();
        this.failedCount++;

        log.error(
          { jobId, type: job.type, attempts: job.attempts, error: errorMsg },
          'Job moved to dead letter'
        );
      }
    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): Job[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === status);
  }

  /**
   * Get jobs by user
   */
  getJobsByUser(userId: string): Job[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get jobs by type
   */
  getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter((j) => j.type === type);
  }

  /**
   * Get dead letter jobs
   */
  getDeadLetterJobs(): Job[] {
    return this.getJobsByStatus('dead_letter');
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const jobs = Array.from(this.jobs.values());
    const elapsedMinutes = (Date.now() - this.startTime) / 60000;

    return {
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: this.processingJobs.size,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      deadLetter: jobs.filter((j) => j.status === 'dead_letter').length,
      throughput: elapsedMinutes > 0 ? Math.round(this.completedCount / elapsedMinutes) : 0,
    };
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.pendingQueue.length;
  }

  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================

  /**
   * Clean up old completed jobs
   */
  cleanup(maxAge: number = 3600000): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;

    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'completed' || job.status === 'cancelled') &&
        job.completedAt &&
        job.completedAt.getTime() < cutoff
      ) {
        this.jobs.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      log.info({ removed }, 'Old jobs cleaned up');
    }

    return removed;
  }

  /**
   * Clear all jobs (for testing)
   */
  clear(): void {
    this.jobs.clear();
    this.pendingQueue = [];
    this.processingJobs.clear();
    this.completedCount = 0;
    this.failedCount = 0;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let jobQueueInstance: JobQueue | null = null;

export function getJobQueue(): JobQueue {
  if (!jobQueueInstance) {
    jobQueueInstance = new JobQueue();
  }
  return jobQueueInstance;
}

export function resetJobQueue(): void {
  if (jobQueueInstance) {
    jobQueueInstance.stop();
    jobQueueInstance.clear();
  }
  jobQueueInstance = null;
}
