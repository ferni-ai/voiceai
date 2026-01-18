/**
 * Workflow Jobs
 *
 * Background job processing infrastructure.
 *
 * Two implementations:
 * - JobQueue: In-memory (fast, no persistence)
 * - RedisJobQueue: Redis-backed (persistent, distributed)
 *
 * Use RedisJobQueue for production workloads that need:
 * - Persistence across restarts
 * - Distributed processing across workers
 * - Job visibility and monitoring
 *
 * @module services/workflows/jobs
 */

// In-memory job queue (original)
export {
  JobQueue,
  getJobQueue,
  resetJobQueue,
  type Job,
  type JobStatus,
  type JobPriority,
  type JobHandler,
  type QueueStats,
} from './job-queue.js';

// Redis-backed job queue (persistent, distributed)
export {
  RedisJobQueue,
  getRedisJobQueue,
  initializeRedisJobQueue,
  shutdownRedisJobQueue,
} from './redis-job-queue.js';
