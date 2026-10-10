/**
 * The team-insights debug-panel endpoints read and clear process-wide state
 * (the superhuman performance log and every user's context cache). They used
 * to answer any signed-in user. These tests drive the real route handler over
 * a real HTTP server, behind the real identity layer, as the API server mounts
 * it. Only the Firebase verifier and the data services are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKENS: Record<string, { uid: string; admin?: boolean }> = {
  'tok-user': { uid: 'user-A' },
  'tok-admin': { uid: 'admin-1', admin: true },
};
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const who = TOKENS[token];
    return who ? { uid: who.uid, claims: { admin: who.admin === true } } : null;
  }),
}));

const superhuman = vi.hoisted(() => ({
  getPerformanceStats: vi.fn(() => ({ totalCalls: 7, averageDurationMs: 12, cacheHitRate: 0.5 })),
  clearPerformanceLog: vi.fn(),
  clearAllSuperhumanCache: vi.fn(),
}));
vi.mock(
  '../../../intelligence/context-builders/superhuman/superhuman-integration.js',
  () => superhuman
);
vi.mock('../../../services/cross-persona-insights.js', () => ({
  buildInsightBriefingForHandoff: vi.fn(async () => ({
    incomingInsights: [],
    proactiveDiscoveries: [],
  })),
  generateTeamStatus: vi.fn(async () => ({})),
  acknowledgeInsight: vi.fn(async () => undefined),
  scanForCrossPersonaInsights: vi.fn(async () => undefined),
}));

const { bindVerifiedIdentity } = await import('../../../servers/api/request-identity.js');
const { handleTeamInsightsRoutes } = await import('../team-insights.js');

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      const handled = await handleTeamInsightsRoutes(req, res, url.pathname, url);
      if (!handled) res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
beforeEach(() => {
  vi.clearAllMocks();
});

function call(method: 'GET' | 'POST', path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base}${path}`, { method, headers, body: method === 'POST' ? '{}' : undefined });
}

describe('team-insights performance endpoints are admin only', () => {
  it('refuses a signed-in non-admin clear with 403 and clears nothing', async () => {
    const res = await call('POST', '/api/team-insights/performance/clear', 'tok-user');
    expect(res.status).toBe(403);
    expect(superhuman.clearPerformanceLog).not.toHaveBeenCalled();
    expect(superhuman.clearAllSuperhumanCache).not.toHaveBeenCalled();
  });

  it('refuses a signed-in non-admin stats read with 403', async () => {
    const res = await call('GET', '/api/team-insights/performance', 'tok-user');
    expect(res.status).toBe(403);
    expect(superhuman.getPerformanceStats).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller with 401', async () => {
    const res = await call('POST', '/api/team-insights/performance/clear');
    expect(res.status).toBe(401);
    expect(superhuman.clearAllSuperhumanCache).not.toHaveBeenCalled();
  });

  it('lets an admin clear the log and caches', async () => {
    const res = await call('POST', '/api/team-insights/performance/clear', 'tok-admin');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean }).success).toBe(true);
    expect(superhuman.clearPerformanceLog).toHaveBeenCalledTimes(1);
    expect(superhuman.clearAllSuperhumanCache).toHaveBeenCalledTimes(1);
  });

  it('lets an admin read the stats', async () => {
    const res = await call('GET', '/api/team-insights/performance', 'tok-admin');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { totalCalls: number }).totalCalls).toBe(7);
  });

  it('still serves the non-debug insights route to a signed-in non-admin', async () => {
    const res = await call('GET', '/api/team-insights', 'tok-user');
    expect(res.status).toBe(200);
  });
});
