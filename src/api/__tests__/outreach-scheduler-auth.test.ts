/**
 * The outreach scheduler endpoints run a send for every eligible user. They
 * used to trust headers any logged-in user could set; now only Cloud
 * Scheduler's verified OIDC token or an admin may run them.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const runDailyOutreachJob = vi.fn(async () => ({
  usersEvaluated: 0,
  outreachSent: 0,
  byType: {},
  durationMs: 0,
  errors: [],
}));
const handleSchedulerTrigger = vi.fn(async () => ({ sent: 0 }));
const runDailyOutreach = vi.fn(async () => ({ sent: 0 }));
const requireAuth = vi.fn();

vi.mock('../../services/outreach/daily-outreach-job.js', () => ({ runDailyOutreachJob }));
vi.mock('../../services/outreach/automated-scheduler.js', () => ({
  handleSchedulerTrigger,
  runDailyOutreach,
}));
vi.mock('../scheduled-jobs/scheduler-auth.js', () => ({
  verifySchedulerRequest: vi.fn(async (req: { headers: Record<string, string> }) =>
    req.headers.authorization === 'Bearer valid-scheduler-token'
      ? { ok: true, caller: 'scheduler-invoker@johnb-2025.iam.gserviceaccount.com' }
      : { ok: false, reason: 'missing bearer token' }
  ),
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: vi.fn(() => false),
  requireAuth,
}));

const { handleOutreachRoutes } = await import('../outreach.routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a logged-in, non-admin user.
  requireAuth.mockResolvedValue({
    userId: 'u1',
    isAdmin: false,
    isDevMode: false,
    authMethod: 'firebase',
  });
});

const post = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/outreach${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });

describe('outreach scheduler endpoints', () => {
  it("refuse a logged-in user's X-CloudScheduler header on /daily-job", async () => {
    const res = await post('/daily-job', { 'x-cloudscheduler': 'true' });
    expect(res.status).toBe(403);
    expect(runDailyOutreachJob).not.toHaveBeenCalled();
  });

  it('refuse a "Cloud-Scheduler" header on /scheduler/daily', async () => {
    const res = await post('/scheduler/daily', { 'x-cloudscheduler-jobname': 'Cloud-Scheduler' });
    expect(res.status).toBe(403);
    expect(handleSchedulerTrigger).not.toHaveBeenCalled();
  });

  it('refuse an x-admin-key header from a non-admin on /scheduler/test', async () => {
    const res = await post('/scheduler/test', { 'x-admin-key': 'anything' });
    expect(res.status).toBe(403);
    expect(runDailyOutreach).not.toHaveBeenCalled();
  });

  it("run for Cloud Scheduler's verified token, without a user login", async () => {
    const res = await post('/scheduler/daily', { authorization: 'Bearer valid-scheduler-token' });
    expect(res.status).toBe(200);
    expect(handleSchedulerTrigger).toHaveBeenCalledTimes(1);
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it('previews instead of sending when the scheduler asks for a dry run', async () => {
    const auth = { authorization: 'Bearer valid-scheduler-token' };
    await fetch(`${base}/api/outreach/scheduler/daily`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(handleSchedulerTrigger).toHaveBeenLastCalledWith({ dryRun: true });
    await post('/scheduler/daily', auth); // body {}: a real run
    expect(handleSchedulerTrigger).toHaveBeenLastCalledWith({ dryRun: false });
  });

  it('run for an admin', async () => {
    requireAuth.mockResolvedValue({
      userId: 'admin',
      isAdmin: true,
      isDevMode: false,
      authMethod: 'firebase',
    });
    const res = await post('/daily-job');
    expect(res.status).toBe(200);
    expect(runDailyOutreachJob).toHaveBeenCalledTimes(1);
  });
});
