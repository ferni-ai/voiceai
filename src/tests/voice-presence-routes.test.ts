/**
 * Voice Presence Routes Tests
 *
 * Tests for voice presence API endpoints:
 * - Dashboard data
 * - Metrics
 * - Configuration
 * - Recommendations
 * - Auto-tuning
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock auth middleware
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'test-user', tier: 'friend' })),
  requireAdmin: vi.fn(() => ({ userId: 'admin-user', tier: 'admin' })),
  rateLimit: vi.fn(() => false),
}));

// Mock voice presence analytics service
const mockAnalytics = {
  getDashboardData: vi.fn(),
  getAllMetrics: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  generateRecommendations: vi.fn(),
  applyRecommendation: vi.fn(),
};

vi.mock('../services/voice-presence-analytics.js', () => ({
  getVoicePresenceAnalytics: vi.fn(() => mockAnalytics),
}));

import { handleVoicePresenceRoutes } from '../api/voice-presence-routes.js';
import { requireAdmin } from '../api/auth-middleware.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): IncomingMessage {
  const { method = 'GET', url = '/', headers = {}, body = '' } = options;

  const req = {
    method,
    url,
    headers: { 'x-user-id': 'test-user', ...headers },
    on: vi.fn((event: string, callback: (chunk?: unknown) => void) => {
      if (event === 'data' && body) {
        setTimeout(() => callback(Buffer.from(body)), 0);
      }
      if (event === 'end') {
        setTimeout(() => callback(), 1);
      }
      return req;
    }),
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;

  return req;
}

function createMockResponse(): {
  res: ServerResponse;
  getWrittenData: () => { status?: number; headers?: Record<string, string>; body?: string };
} {
  let status: number | undefined;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: vi.fn((s: number, h?: Record<string, string>) => {
      status = s;
      if (h) headers = { ...headers, ...h };
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) body = data;
    }),
  } as unknown as ServerResponse;

  return {
    res,
    getWrittenData: () => ({ status, headers, body }),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Voice Presence Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalytics.getDashboardData.mockReturnValue({
      metrics: { fillerWords: 0.15, breathing: 0.1 },
      trends: { fillerWords: 'stable', breathing: 'up' },
      overallHealth: 'good',
    });
    mockAnalytics.getAllMetrics.mockReturnValue({
      fillerWords: { count: 150, rate: 0.15, trend: 'stable' },
      breathing: { count: 100, rate: 0.1, trend: 'up' },
      emotionalMirroring: { count: 80, rate: 0.08, trend: 'down' },
    });
    mockAnalytics.getConfig.mockReturnValue({
      fillerWordsEnabled: true,
      fillerWordsFrequency: 0.15,
      breathingEnabled: true,
      emotionalMirroringEnabled: true,
    });
    mockAnalytics.generateRecommendations.mockReturnValue([
      {
        feature: 'fillerWords',
        parameter: 'frequency',
        currentValue: 0.15,
        suggestedValue: 0.12,
        confidence: 0.85,
        reason: 'Slightly reduce for more natural flow',
      },
    ]);
  });

  describe('Route Matching', () => {
    it('should not handle non-voice-presence routes', async () => {
      const req = createMockRequest({ url: '/api/other' });
      const { res } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/other');

      expect(handled).toBe(false);
    });

    it('should handle CORS preflight', async () => {
      const req = createMockRequest({ method: 'OPTIONS', url: '/api/voice-presence/dashboard' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/voice-presence/dashboard');

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(204);
    });
  });

  describe('GET /api/voice-presence/dashboard', () => {
    it('should return dashboard data', async () => {
      const req = createMockRequest({ url: '/api/voice-presence/dashboard' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/voice-presence/dashboard');

      expect(handled).toBe(true);
      expect(mockAnalytics.getDashboardData).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.metrics).toBeDefined();
      expect(data.overallHealth).toBe('good');
    });
  });

  describe('GET /api/voice-presence/metrics', () => {
    it('should return all metrics', async () => {
      const req = createMockRequest({ url: '/api/voice-presence/metrics' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/voice-presence/metrics');

      expect(handled).toBe(true);
      expect(mockAnalytics.getAllMetrics).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.fillerWords).toBeDefined();
      expect(data.breathing).toBeDefined();
    });
  });

  describe('GET /api/voice-presence/config', () => {
    it('should return current configuration', async () => {
      const req = createMockRequest({ url: '/api/voice-presence/config' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/voice-presence/config');

      expect(handled).toBe(true);
      expect(mockAnalytics.getConfig).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.fillerWordsEnabled).toBe(true);
      expect(data.fillerWordsFrequency).toBe(0.15);
    });
  });

  describe('POST /api/voice-presence/config', () => {
    it('should update configuration', async () => {
      mockAnalytics.getConfig.mockReturnValue({
        fillerWordsEnabled: false,
        fillerWordsFrequency: 0.1,
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/voice-presence/config',
        body: JSON.stringify({
          fillerWordsEnabled: false,
          fillerWordsFrequency: 0.1,
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/voice-presence/config');

      expect(handled).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
      expect(mockAnalytics.updateConfig).toHaveBeenCalledWith({
        fillerWordsEnabled: false,
        fillerWordsFrequency: 0.1,
      });
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
    });

    it('should reject invalid frequency values', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/voice-presence/config',
        body: JSON.stringify({
          fillerWordsFrequency: 1.5, // Invalid: must be 0-1
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      await handleVoicePresenceRoutes(req, res, '/api/voice-presence/config');

      expect(getWrittenData().status).toBe(400);
    });
  });

  describe('GET /api/voice-presence/recommendations', () => {
    it('should return tuning recommendations', async () => {
      const req = createMockRequest({ url: '/api/voice-presence/recommendations' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(
        req,
        res,
        '/api/voice-presence/recommendations'
      );

      expect(handled).toBe(true);
      expect(mockAnalytics.generateRecommendations).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '[]');
      expect(data).toHaveLength(1);
      expect(data[0].feature).toBe('fillerWords');
    });
  });

  describe('POST /api/voice-presence/apply-recommendation', () => {
    it('should apply a recommendation successfully', async () => {
      mockAnalytics.applyRecommendation.mockReturnValue(true);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/voice-presence/apply-recommendation',
        body: JSON.stringify({
          feature: 'fillerWords',
          parameter: 'frequency',
          suggestedValue: 0.12,
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(
        req,
        res,
        '/api/voice-presence/apply-recommendation'
      );

      expect(handled).toBe(true);
      expect(mockAnalytics.applyRecommendation).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
    });

    it('should handle failed recommendation application', async () => {
      mockAnalytics.applyRecommendation.mockReturnValue(false);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/voice-presence/apply-recommendation',
        body: JSON.stringify({
          feature: 'invalidFeature',
          parameter: 'frequency',
          suggestedValue: 0.5,
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      await handleVoicePresenceRoutes(req, res, '/api/voice-presence/apply-recommendation');

      expect(getWrittenData().status).toBe(400);
    });
  });

  describe('POST /api/voice-presence/auto-tune', () => {
    it('should toggle auto-tuning on', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/voice-presence/auto-tune',
        body: JSON.stringify({ enabled: true }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleVoicePresenceRoutes(req, res, '/api/voice-presence/auto-tune');

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.autoTuneEnabled).toBe(true);
    });

    it('should toggle auto-tuning off', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/voice-presence/auto-tune',
        body: JSON.stringify({ enabled: false }),
      });
      const { res, getWrittenData } = createMockResponse();

      await handleVoicePresenceRoutes(req, res, '/api/voice-presence/auto-tune');

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.autoTuneEnabled).toBe(false);
    });
  });

  describe('Unknown Endpoints', () => {
    it('should return 404 for unknown voice-presence endpoints', async () => {
      const req = createMockRequest({ url: '/api/voice-presence/unknown' });
      const { res, getWrittenData } = createMockResponse();

      await handleVoicePresenceRoutes(req, res, '/api/voice-presence/unknown');

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('Authentication', () => {
    it('should require admin for POST operations', async () => {
      const writeOps = [
        { path: '/api/voice-presence/config' },
        { path: '/api/voice-presence/apply-recommendation' },
        { path: '/api/voice-presence/auto-tune' },
      ];

      for (const op of writeOps) {
        vi.clearAllMocks();
        const req = createMockRequest({ method: 'POST', url: op.path, body: '{}' });
        const { res } = createMockResponse();

        await handleVoicePresenceRoutes(req, res, op.path);

        expect(requireAdmin).toHaveBeenCalled();
      }
    });
  });
});
