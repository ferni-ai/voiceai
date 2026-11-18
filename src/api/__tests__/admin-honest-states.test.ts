/**
 * #4069 honest states, server side: a value the server could not measure is
 * sent as null or as an error, never as a zero or a made-up constant.
 *
 * - Dashboard stats (DB4): when the latency/activity read fails, response time,
 *   error rate and sessions are null, not 0. When it works, the values nothing measures
 *   (error rate, conversations) are still null, not a constant 2% or sessions x10.
 * - Analytics summary (BM2): without Firestore the summary is a 503, not
 *   zeros read from empty in-memory maps.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async () => ({ userId: 'admin-1' })),
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', isAdmin: true })),
}));

const latency = vi.hoisted(() => ({ down: true }));
vi.mock('../../services/analytics/latency-tracker.js', () => ({
  getAverageLatency: () => {
    if (latency.down) throw new Error('latency store down');
    return 420;
  },
  getLatencySummary: () => ({ services: [] }),
}));
vi.mock('../../services/admin-activity.js', () => ({
  getActivityByType: vi.fn(async () => []),
  getRecentActivity: vi.fn(async () => []),
  initializeActivityLog: vi.fn(async () => undefined),
  recordActivity: vi.fn(),
}));
vi.mock('../../services/outreach/index.js', () => ({
  calculatePeriodAnalytics: () => ({ totalOutreach: 0, responseRate: 0 }),
}));
vi.mock('../../services/analytics/better-than-human-telemetry.js', () => ({
  getBetterThanHumanTelemetry: () => ({ getSummary: () => undefined }),
}));
vi.mock('../../personas/registry/unified-registry.js', () => ({
  AgentRegistry: { getEnabledAgents: async () => [{ id: 'ferni' }] },
}));
vi.mock('../../services/evalops/automation.js', () => ({
  getEvalMetrics: () => ({ totalEvaluations: 0, averageScore: 0, flaggedResponses: 0 }),
}));
vi.mock('../../services/trust-systems/index.js', () => ({
  getTrustAggregates: () => ({ totalProfiles: 0, avgTrustScore: 0, activeRelationships: 0 }),
}));

const analytics = vi.hoisted(() => ({
  getAnalyticsSummary: vi.fn(async () => ({ uniqueUsersToday: 0 })),
  getCurrentConcurrent: vi.fn(() => 0),
  initializeAnalytics: vi.fn(async () => false),
}));
vi.mock('../../services/analytics/user-analytics.js', () => analytics);

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  url: URL
) => Promise<boolean>;

async function get(handler: Handler, path: string) {
  const req = { method: 'GET', url: path, headers: { host: 'x' } } as unknown as IncomingMessage;
  const res = {
    statusCode: 200,
    body: '',
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    setHeader() {},
    end(data?: string) {
      this.body = data ?? '';
    },
  };
  await handler(req, res as unknown as ServerResponse, path, new URL(`http://x${path}`));
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') as Record<string, unknown> };
}

beforeEach(() => vi.clearAllMocks());

describe('dashboard stats (DB4)', () => {
  it('sends null for what it could not measure, not 0', async () => {
    const { handleAdminDashboardRoutes } = await import('../v1/admin/dashboard.js');
    const { status, json } = await get(handleAdminDashboardRoutes, '/api/v1/admin/dashboard/stats');
    expect(status).toBe(200);
    expect(json.system).toMatchObject({
      responseTime: null,
      errorRate: null,
      activeSessions: null,
    });
    expect(json.conversations).toMatchObject({ today: null, thisWeek: null });
  });

  it('sends null, not a constant, for what nothing measures even when the reads work', async () => {
    latency.down = false;
    try {
      const { handleAdminDashboardRoutes } = await import('../v1/admin/dashboard.js');
      const { json } = await get(handleAdminDashboardRoutes, '/api/v1/admin/dashboard/stats');
      expect(json.system).toMatchObject({ responseTime: 420, errorRate: null, activeSessions: 0 });
      expect(json.conversations).toEqual({ today: null, thisWeek: null, trend: 'neutral' });
    } finally {
      latency.down = true;
    }
  });
});

describe('analytics summary (BM2)', () => {
  it('without the Firestore store it answers 503 and sends no numbers', async () => {
    const { handleAnalyticsRoutes } = await import('../user-analytics-routes.js');
    const { status, json } = await get(
      (req, res, path) => handleAnalyticsRoutes(req, res, path),
      '/api/analytics/summary'
    );
    expect(status).toBe(503);
    expect(json).toEqual({ success: false, error: 'Analytics store unavailable' });
    expect(analytics.getAnalyticsSummary).not.toHaveBeenCalled();
  });
});
