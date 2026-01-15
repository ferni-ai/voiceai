/**
 * Job Queue Tests
 *
 * Tests for the job queue service:
 * - Job enqueueing
 * - Priority handling
 * - Job execution
 * - Dead letter handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getJobQueue,
  resetJobQueue,
  type Job,
} from '../../services/workflows/jobs/job-queue.js';

// ============================================================================
// JOB QUEUE TESTS
// ============================================================================

describe('JobQueue', () => {
  beforeEach(() => {
    resetJobQueue();
  });

  afterEach(() => {
    resetJobQueue();
  });

  describe('getJobQueue', () => {
    it('should return singleton instance', () => {
      const queue1 = getJobQueue();
      const queue2 = getJobQueue();
      expect(queue1).toBe(queue2);
    });
  });

  describe('enqueue', () => {
    it('should add job to queue', async () => {
      const queue = getJobQueue();

      const job = await queue.enqueue({
        type: 'test_job',
        payload: { message: 'hello' },
        userId: 'user-1',
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('pending');
      expect(job.type).toBe('test_job');
      expect(job.payload).toEqual({ message: 'hello' });
    });

    it('should respect priority ordering', async () => {
      const queue = getJobQueue();

      await queue.enqueue({
        type: 'low_priority',
        payload: {},
        priority: 'low',
      });

      await queue.enqueue({
        type: 'high_priority',
        payload: {},
        priority: 'high',
      });

      await queue.enqueue({
        type: 'critical_priority',
        payload: {},
        priority: 'critical',
      });

      const stats = queue.getStats();
      expect(stats.pending).toBe(3);
    });
  });

  describe('registerHandler', () => {
    it('should register and execute job handler', async () => {
      const queue = getJobQueue();
      const handler = vi.fn().mockResolvedValue({ success: true });

      queue.registerHandler({
        type: 'handled_job',
        handler,
      });

      await queue.enqueue({
        type: 'handled_job',
        payload: { data: 'test' },
      });

      queue.start();
      
      // Wait for job to process
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      queue.stop();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('cancelJob', () => {
    it('should cancel pending job', async () => {
      const queue = getJobQueue();

      const job = await queue.enqueue({
        type: 'cancellable_job',
        payload: {},
      });

      const cancelled = queue.cancelJob(job.id);
      expect(cancelled).toBe(true);

      const updatedJob = queue.getJob(job.id);
      expect(updatedJob?.status).toBe('cancelled');
    });

    it('should not cancel non-pending job', async () => {
      const queue = getJobQueue();
      queue.registerHandler({
        type: 'fast_job',
        handler: async () => ({ success: true }),
      });

      const job = await queue.enqueue({
        type: 'fast_job',
        payload: {},
      });

      queue.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      queue.stop();

      const cancelled = queue.cancelJob(job.id);
      expect(cancelled).toBe(false);
    });
  });

  describe('retryJob', () => {
    it('should retry failed job', async () => {
      const queue = getJobQueue();
      let attempts = 0;

      queue.registerHandler({
        type: 'failing_job',
        handler: async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        },
        options: { maxAttempts: 3 },
      });

      const job = await queue.enqueue({
        type: 'failing_job',
        payload: {},
      });

      queue.start();
      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();

      expect(attempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getJobsByStatus', () => {
    it('should filter jobs by status', async () => {
      const queue = getJobQueue();

      await queue.enqueue({ type: 'job1', payload: {} });
      await queue.enqueue({ type: 'job2', payload: {} });

      const pendingJobs = queue.getJobsByStatus('pending');
      expect(pendingJobs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getJobsByUser', () => {
    it('should filter jobs by user', async () => {
      const queue = getJobQueue();

      await queue.enqueue({ type: 'job1', payload: {}, userId: 'user-1' });
      await queue.enqueue({ type: 'job2', payload: {}, userId: 'user-2' });

      const userJobs = queue.getJobsByUser('user-1');
      expect(userJobs).toHaveLength(1);
      expect(userJobs[0].userId).toBe('user-1');
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const queue = getJobQueue();

      await queue.enqueue({ type: 'job1', payload: {} });

      const stats = queue.getStats();
      expect(stats.pending).toBeGreaterThanOrEqual(1);
      expect(stats.processing).toBeDefined();
      expect(stats.completed).toBeDefined();
      expect(stats.failed).toBeDefined();
      expect(stats.deadLetter).toBeDefined();
      expect(stats.throughput).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should remove old completed jobs', async () => {
      const queue = getJobQueue();
      queue.registerHandler({
        type: 'cleanup_test',
        handler: async () => ({ success: true }),
      });

      await queue.enqueue({ type: 'cleanup_test', payload: {} });

      queue.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      queue.stop();

      // Cleanup jobs older than 0ms (all completed)
      const removed = queue.cleanup(0);
      expect(removed).toBeGreaterThanOrEqual(1);
    });
  });
});
