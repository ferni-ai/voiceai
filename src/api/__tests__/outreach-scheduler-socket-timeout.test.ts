/**
 * The outreach scheduler runs through the real route handler on a hardened server.
 *
 * Prod: POST /api/outreach/scheduler/daily got 503 at 30.0 s on 2026-10-25, -26,
 * -27 and -30 and the daily run never finished. The 30 s is hardenServer's socket
 * idle timeout, which lives in libuv, not JS timers, so (as in job-run-guard.test.ts)
 * the server timeout is scaled down to 200 ms and the slow work takes 600 ms.
 */
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hardenServer } from '../../utils/ddos-protection.js';

const SLOW_MS = 600;
const SCALED_SOCKET_TIMEOUT_MS = 200;
const slow = <T>(value: T) =>
  new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), SLOW_MS);
  });

const handleSchedulerTrigger = vi.fn(() => slow({ sent: 0 }));
const getEngagementStats = vi.fn(() => slow({ opens: 0 }));
const requireAuth = vi.fn();

vi.mock('../../services/outreach/automated-scheduler.js', () => ({
  handleSchedulerTrigger,
  runDailyOutreach: vi.fn(),
}));
vi.mock('../../services/outreach/engagement-tracking.js', () => ({ getEngagementStats }));
vi.mock('../scheduled-jobs/scheduler-auth.js', () => ({
  verifySchedulerRequest: vi.fn(async (req: IncomingMessage) =>
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

type Reply = { status: number } | { error: string };

function send(method: string, path: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve) => {
    const req = request(
      { port, path: `/api/outreach${path}`, method, agent: false, headers },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      }
    );
    req.on('error', (error: NodeJS.ErrnoException) =>
      resolve({ error: error.code ?? error.message })
    );
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

const SCHEDULER = { authorization: 'Bearer valid-scheduler-token' };
const user = (isAdmin: boolean) => ({
  userId: isAdmin ? 'admin' : 'u1',
  isAdmin,
  isDevMode: false,
  authMethod: 'firebase',
});

let server: Server;
let port = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  hardenServer(server);
  server.setTimeout(SCALED_SOCKET_TIMEOUT_MS);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  ({ port } = server.address() as AddressInfo);
});
afterAll(() => server?.close());

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue(user(false));
});

describe('outreach scheduler runs on a hardened server', () => {
  it("answers the scheduler's daily run that outlasts the socket timeout", async () => {
    const reply = await send('POST', '/scheduler/daily', SCHEDULER);

    expect(reply).toEqual({ status: 200 });
    expect(handleSchedulerTrigger).toHaveBeenCalledWith({ dryRun: false });
  });

  it("answers an admin's daily run that outlasts the socket timeout", async () => {
    requireAuth.mockResolvedValue(user(true));
    expect(await send('POST', '/scheduler/daily')).toEqual({ status: 200 });
  });

  it("still cuts off an admin's slow request that is not a scheduler run", async () => {
    requireAuth.mockResolvedValue(user(true));
    expect(await send('GET', '/engagement/stats')).toEqual({ error: 'ECONNRESET' });
    expect(getEngagementStats).toHaveBeenCalledTimes(1);
  });

  it('gives a request without a valid token no extra time while auth is pending', async () => {
    // requireAuth is slow and then refuses: the socket must die at the old
    // timeout, so the lift can't be reached before the caller is authorized.
    requireAuth.mockImplementation(async (_req: IncomingMessage, res: ServerResponse) => {
      await slow(null);
      if (!res.destroyed) res.writeHead(401).end();
      return null;
    });
    expect(await send('POST', '/scheduler/daily', { authorization: 'Bearer forged' })).toEqual({
      error: 'ECONNRESET',
    });
    expect(handleSchedulerTrigger).not.toHaveBeenCalled();
  });

  it("refuses a logged-in user's daily run quickly, as before", async () => {
    expect(await send('POST', '/scheduler/daily')).toEqual({ status: 403 });
    expect(handleSchedulerTrigger).not.toHaveBeenCalled();
  });
});
