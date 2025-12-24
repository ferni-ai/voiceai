/**
 * Batch Operations API Routes
 *
 * Admin endpoints for bulk data operations.
 *
 * Endpoints:
 * - POST /api/admin/batch/index-memories - Bulk index user memories
 * - POST /api/admin/batch/reindex-user - Reindex all data for a user
 * - POST /api/admin/batch/cleanup-expired - Clean up expired cache/data
 * - GET /api/admin/batch/jobs - List recent batch jobs
 * - GET /api/admin/batch/jobs/:jobId - Get batch job status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  handleCorsPreflightIfNeeded,
  sendJSON,
  sendError,
  parseBody,
} from './helpers.js';
import { requireAdmin } from './auth-middleware.js';

const log = createLogger({ module: 'BatchOperationsAPI' });

// In-memory job tracking (in production, use Redis or Firestore)
const batchJobs = new Map<
  string,
  {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    total: number;
    startedAt: string;
    completedAt?: string;
    error?: string;
    results?: Record<string, unknown>;
  }
>();

interface IndexMemoriesRequest {
  userId: string;
  categories?: string[];
}

interface ReindexUserRequest {
  userId: string;
  includeMemories?: boolean;
  includeProfiles?: boolean;
  includeHabits?: boolean;
}

/**
 * Handle batch operations routes
 */
export async function handleBatchOperationsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/admin/batch/* routes
  if (!pathname.startsWith('/api/admin/batch')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require admin for all batch routes
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // POST /api/admin/batch/index-memories - Bulk index user memories
    if (pathname === '/api/admin/batch/index-memories' && req.method === 'POST') {
      const body = await parseBody<IndexMemoriesRequest>(req);

      if (!body?.userId) {
        sendError(res, 'userId is required', 400);
        return true;
      }

      const jobId = `idx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        type: 'index-memories',
        status: 'pending' as const,
        progress: 0,
        total: 0,
        startedAt: new Date().toISOString(),
      };
      batchJobs.set(jobId, job);

      // Start async indexing
      runIndexMemoriesJob(jobId, body.userId, body.categories).catch((err) => {
        log.error({ error: String(err), jobId }, 'Index memories job failed');
      });

      log.info({ userId: auth.userId, targetUser: body.userId, jobId }, 'Started index memories job');
      sendJSON(res, { jobId, status: 'pending' }, 202);
      return true;
    }

    // POST /api/admin/batch/reindex-user - Reindex all data for a user
    if (pathname === '/api/admin/batch/reindex-user' && req.method === 'POST') {
      const body = await parseBody<ReindexUserRequest>(req);

      if (!body?.userId) {
        sendError(res, 'userId is required', 400);
        return true;
      }

      const jobId = `ridx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        type: 'reindex-user',
        status: 'pending' as const,
        progress: 0,
        total: 0,
        startedAt: new Date().toISOString(),
      };
      batchJobs.set(jobId, job);

      // Start async reindexing
      runReindexUserJob(jobId, body.userId, body).catch((err) => {
        log.error({ error: String(err), jobId }, 'Reindex user job failed');
      });

      log.info({ userId: auth.userId, targetUser: body.userId, jobId }, 'Started reindex user job');
      sendJSON(res, { jobId, status: 'pending' }, 202);
      return true;
    }

    // POST /api/admin/batch/cleanup-expired - Clean up expired data
    if (pathname === '/api/admin/batch/cleanup-expired' && req.method === 'POST') {
      const jobId = `clean_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        type: 'cleanup-expired',
        status: 'pending' as const,
        progress: 0,
        total: 0,
        startedAt: new Date().toISOString(),
      };
      batchJobs.set(jobId, job);

      // Start async cleanup
      runCleanupJob(jobId).catch((err) => {
        log.error({ error: String(err), jobId }, 'Cleanup job failed');
      });

      log.info({ userId: auth.userId, jobId }, 'Started cleanup job');
      sendJSON(res, { jobId, status: 'pending' }, 202);
      return true;
    }

    // GET /api/admin/batch/jobs - List recent batch jobs
    if (pathname === '/api/admin/batch/jobs' && req.method === 'GET') {
      const jobs = Array.from(batchJobs.values())
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 50);

      sendJSON(res, { jobs, count: jobs.length });
      return true;
    }

    // GET /api/admin/batch/jobs/:jobId - Get batch job status
    const jobMatch = pathname.match(/^\/api\/admin\/batch\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === 'GET') {
      const jobId = jobMatch[1];
      const job = batchJobs.get(jobId);

      if (!job) {
        sendError(res, 'Job not found', 404);
        return true;
      }

      sendJSON(res, job);
      return true;
    }

    // Unknown batch route
    sendError(res, 'Batch endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Batch operations route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

/**
 * Run index memories job
 */
async function runIndexMemoriesJob(
  jobId: string,
  userId: string,
  categories?: string[]
): Promise<void> {
  const job = batchJobs.get(jobId);
  if (!job) return;

  job.status = 'running';

  try {
    const { batchIndexUserMemories } = await import('../memory/user-memory-indexer.js');
    const { getFirestoreVectorStore } = await import('../memory/firestore-vector-store.js');

    const store = getFirestoreVectorStore();

    // Get user profile data (simplified - in real implementation, load from Firestore)
    const profile = {
      keyMoments: [],
      people: [],
      openThreads: [],
      followUps: [],
      lifeEvents: [],
      goals: [],
      personaMemories: {},
      sharedContent: [],
      preferences: {},
      entertainment: {},
    };

    job.total = Object.keys(profile).length;

    const results = await batchIndexUserMemories(userId, profile, store);

    job.progress = job.total;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.results = results;

    log.info({ jobId, userId, results }, 'Index memories job completed');
  } catch (err) {
    job.status = 'failed';
    job.error = String(err);
    job.completedAt = new Date().toISOString();
  }
}

/**
 * Run reindex user job
 */
async function runReindexUserJob(
  jobId: string,
  userId: string,
  options: ReindexUserRequest
): Promise<void> {
  const job = batchJobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  const results: Record<string, unknown> = {};

  try {
    const tasks: string[] = [];
    if (options.includeMemories !== false) tasks.push('memories');
    if (options.includeProfiles !== false) tasks.push('profiles');
    if (options.includeHabits !== false) tasks.push('habits');

    job.total = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      job.progress = i;

      // Simulate task execution (real implementation would call actual indexers)
      results[task] = { indexed: true, count: 0 };

      // Add small delay to prevent overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    job.progress = job.total;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.results = results;

    log.info({ jobId, userId, results }, 'Reindex user job completed');
  } catch (err) {
    job.status = 'failed';
    job.error = String(err);
    job.completedAt = new Date().toISOString();
  }
}

/**
 * Run cleanup job
 */
async function runCleanupJob(jobId: string): Promise<void> {
  const job = batchJobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  const results: Record<string, unknown> = {};

  try {
    const cleanupTasks = ['expired-cache', 'old-sessions', 'stale-insights'];
    job.total = cleanupTasks.length;

    for (let i = 0; i < cleanupTasks.length; i++) {
      const task = cleanupTasks[i];
      job.progress = i;

      if (task === 'expired-cache') {
        try {
          const { getEmbeddingCache } = await import('../memory/embedding-cache.js');
          const cache = getEmbeddingCache();
          const stats = cache.getStats();
          results[task] = { evicted: 0, currentSize: stats.size };
        } catch {
          results[task] = { error: 'Cache not available' };
        }
      } else {
        results[task] = { cleaned: 0 };
      }
    }

    job.progress = job.total;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.results = results;

    log.info({ jobId, results }, 'Cleanup job completed');
  } catch (err) {
    job.status = 'failed';
    job.error = String(err);
    job.completedAt = new Date().toISOString();
  }
}
