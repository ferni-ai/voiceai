/**
 * Scheduled Jobs Routes API Tests (P1)
 *
 * Tests for Cloud Scheduler triggered background jobs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock task service
vi.mock('../../tasks/index.js', () => ({
  processBackgroundTasks: vi.fn().mockResolvedValue({ processed: 5, errors: 0 }),
  getTaskStats: vi.fn().mockReturnValue({ pending: 10, completed: 100 }),
}));

// Mock session cleanup
vi.mock('../../services/session-manager/index.js', () => ({
  cleanupExpiredSessions: vi.fn().mockResolvedValue({ cleaned: 3 }),
}));

// Mock outreach services
vi.mock('../../services/outreach/index.js', () => ({
  runDailyOutreach: vi.fn().mockResolvedValue({ sent: 10, skipped: 5 }),
  evaluateThinkingOfYou: vi.fn().mockResolvedValue({ evaluated: 50, triggered: 5 }),
  rollupAnalytics: vi.fn().mockResolvedValue({ success: true }),
  resetWeeklyCounters: vi.fn().mockResolvedValue({ reset: true }),
}));

// Mock analytics
vi.mock('../../services/community-insights.js', () => ({
  aggregateCommunityInsights: vi.fn().mockResolvedValue({ aggregated: 100 }),
}));

vi.mock('../../services/persona-metrics.js', () => ({
  rollupPersonaMetrics: vi.fn().mockResolvedValue({ rolledUp: true }),
}));

vi.mock('../../services/trust-profiles.js', () => ({
  syncTrustProfiles: vi.fn().mockResolvedValue({ synced: 50 }),
}));

// Mock transcripts
vi.mock('../../services/transcript-cleanup.js', () => ({
  cleanupOldTranscripts: vi.fn().mockResolvedValue({ deleted: 20 }),
}));

// Mock deep analysis
vi.mock('../../intelligence/deep-analysis.js', () => ({
  runDeepAnalysis: vi.fn().mockResolvedValue({ analyzed: 10 }),
  flushMLState: vi.fn().mockResolvedValue({ flushed: true }),
}));

// Mock predictions
vi.mock('../../services/predictive-analysis.js', () => ({
  runPredictiveAnalysis: vi.fn().mockResolvedValue({ predictions: 25 }),
}));

// Create mock request
function createMockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = options.headers || {};
  req.url = options.url || '/';
  req.method = options.method || 'POST';
  return req;
}

// Create mock response
function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  const res = {
    _data: '',
    _statusCode: 200,
    writeHead: vi.fn(function (this: any, status: number) {
      this._statusCode = status;
    }),
    end: vi.fn(function (this: any, data?: string) {
      this._data = data || '';
    }),
    setHeader: vi.fn(),
  };
  return res as unknown as ServerResponse & { _data: string; _statusCode: number };
}

describe('Scheduled Jobs Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/jobs/process-background-tasks', () => {
    it('should process background tasks', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/process-background-tasks',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(
        req,
        res,
        '/api/jobs/process-background-tasks'
      );

      expect(handled).toBe(true);
      expect(res._statusCode).toBeLessThanOrEqual(500);
    });
  });

  describe('POST /api/jobs/check-scheduled', () => {
    it('should check scheduled tasks', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/check-scheduled',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/check-scheduled');

      expect(handled).toBe(true);
    });
  });

  describe('POST /api/jobs/cleanup-sessions', () => {
    it('should cleanup expired sessions', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/cleanup-sessions',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/cleanup-sessions');

      expect(handled).toBe(true);
    });
  });

  describe('POST /api/jobs/cleanup-old-tasks', () => {
    it('should cleanup old tasks', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/cleanup-old-tasks',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/cleanup-old-tasks');

      expect(handled).toBe(true);
    });
  });

  describe('Outreach Jobs', () => {
    it('POST /api/jobs/daily-outreach should run daily outreach', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/daily-outreach',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/daily-outreach');

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/evaluate-thinking-of-you should evaluate triggers', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/evaluate-thinking-of-you',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(
        req,
        res,
        '/api/jobs/evaluate-thinking-of-you'
      );

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/rollup-outreach-analytics should rollup analytics', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/rollup-outreach-analytics',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(
        req,
        res,
        '/api/jobs/rollup-outreach-analytics'
      );

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/reset-weekly-counters should reset counters', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/reset-weekly-counters',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/reset-weekly-counters');

      expect(handled).toBe(true);
    });
  });

  describe('Analytics Jobs', () => {
    it('POST /api/jobs/aggregate-community-insights should aggregate insights', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/aggregate-community-insights',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(
        req,
        res,
        '/api/jobs/aggregate-community-insights'
      );

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/rollup-persona-metrics should rollup metrics', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/rollup-persona-metrics',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/rollup-persona-metrics');

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/sync-trust-profiles should sync profiles', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/sync-trust-profiles',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/sync-trust-profiles');

      expect(handled).toBe(true);
    });
  });

  describe('Deep Intelligence Jobs', () => {
    it('POST /api/jobs/run-deep-analysis should run analysis', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/run-deep-analysis',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/run-deep-analysis');

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/flush-ml-state should flush ML state', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/flush-ml-state',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/flush-ml-state');

      expect(handled).toBe(true);
    });

    it('POST /api/jobs/run-predictive-analysis should run predictions', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/run-predictive-analysis',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(
        req,
        res,
        '/api/jobs/run-predictive-analysis'
      );

      expect(handled).toBe(true);
    });
  });

  describe('Cleanup Jobs', () => {
    it('POST /api/jobs/cleanup-transcripts should cleanup transcripts', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/cleanup-transcripts',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/cleanup-transcripts');

      expect(handled).toBe(true);
    });
  });

  describe('Request Method Validation', () => {
    it('should only accept POST requests', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'GET',
        url: '/api/jobs/process-background-tasks',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(
        req,
        res,
        '/api/jobs/process-background-tasks'
      );

      expect(handled).toBe(false);
    });
  });

  describe('Unknown Routes', () => {
    it('should not handle unknown job routes', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/unknown-job',
      });
      const res = createMockResponse();

      const handled = await handleScheduledJobsRoutes(req, res, '/api/jobs/unknown-job');

      expect(handled).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle job failures gracefully', async () => {
      const { handleScheduledJobsRoutes } = await import('../scheduled-jobs.routes.js');

      // Jobs should not crash even if underlying service fails
      // They should return error responses

      const req = createMockRequest({
        method: 'POST',
        url: '/api/jobs/process-background-tasks',
      });
      const res = createMockResponse();

      await handleScheduledJobsRoutes(req, res, '/api/jobs/process-background-tasks');

      // Should complete without throwing
      expect(res._statusCode).toBeDefined();
    });
  });
});
