/**
 * The analytics summary and concurrency routes return usage numbers (unique
 * users, subscribers vs free, persona use, peak hours). The handler used to
 * serve them to any caller the server let through (in the running server the
 * engagement gate only asks for a signed-in user), so any account could read
 * them; they are admin-only now. The health check carries no usage data and
 * the handler adds no check to it.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.hoisted(() => vi.fn());
vi.mock('../auth-middleware.js', () => ({ requireAdmin }));

const analytics = vi.hoisted(() => ({
  getAnalyticsSummary: vi.fn(async () => ({ uniqueUsersToday: 42, subscriberSessions: 7 })),
  getCurrentConcurrent: vi.fn(() => 3),
  initializeAnalytics: vi.fn(async () => true), // the Firestore store is up
}));
vi.mock('../../services/analytics/user-analytics.js', () => analytics);

import { handleAnalyticsRoutes } from '../user-analytics-routes.js';

async function call(path: string) {
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
  const handled = await handleAnalyticsRoutes(req, res as unknown as ServerResponse, path);
  return { handled, status: res.statusCode, body: res.body };
}

const signedOut = () =>
  requireAdmin.mockImplementation(async (_req, res: ServerResponse) => {
    res.writeHead(401);
    res.end('{"error":"Authentication required"}');
    return null;
  });
const signedInNotAdmin = () =>
  requireAdmin.mockImplementation(async (_req, res: ServerResponse) => {
    res.writeHead(403);
    res.end('{"error":"Admin access required"}');
    return null;
  });
const signedInAdmin = () => requireAdmin.mockResolvedValue({ userId: 'admin-1', isAdmin: true });

beforeEach(() => vi.clearAllMocks());

describe.each(['/api/analytics/summary', '/api/analytics/concurrent'])('GET %s', (path) => {
  it('refuses a caller with no credentials and reads nothing', async () => {
    signedOut();
    const r = await call(path);
    expect(r.handled).toBe(true);
    expect(r.status).toBe(401);
    expect(r.body).not.toContain('42');
    expect(analytics.getAnalyticsSummary).not.toHaveBeenCalled();
    expect(analytics.getCurrentConcurrent).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not an admin', async () => {
    signedInNotAdmin();
    const r = await call(path);
    expect(r.status).toBe(403);
    expect(analytics.getAnalyticsSummary).not.toHaveBeenCalled();
    expect(analytics.getCurrentConcurrent).not.toHaveBeenCalled();
  });

  it('serves an admin', async () => {
    signedInAdmin();
    const r = await call(path);
    expect(r.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });
});

it('the summary an admin gets is the real summary', async () => {
  signedInAdmin();
  const r = await call('/api/analytics/summary');
  expect(JSON.parse(r.body).data).toEqual({ uniqueUsersToday: 42, subscriberSessions: 7 });
});

it('the health check stays public and reveals no usage numbers', async () => {
  signedOut();
  const r = await call('/api/analytics/health');
  expect(r.status).toBe(200);
  expect(requireAdmin).not.toHaveBeenCalled();
  expect(JSON.parse(r.body)).toMatchObject({ status: 'ok', service: 'user-analytics' });
  expect(analytics.getAnalyticsSummary).not.toHaveBeenCalled();
});

it('leaves other paths to other handlers without asking for credentials', async () => {
  const r = await call('/api/other');
  expect(r.handled).toBe(false);
  expect(requireAdmin).not.toHaveBeenCalled();
});
