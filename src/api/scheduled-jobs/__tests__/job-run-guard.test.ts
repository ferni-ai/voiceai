/**
 * Scheduled jobs through the real route handler on a hardened server.
 *
 * Prod (john-bogle-ui): memory-consolidation 503 at 30.0 s on 3 of 3 attempts
 * on 2026-10-11, knowledge-graph-consolidation 503 at 30.0 s on 10-12. The
 * 30 s is the socket idle timeout from hardenServer. That timeout lives in
 * libuv, not in JS timers, so fake timers can't drive it: these tests use the
 * real hardenServer with the server timeout scaled down to 200 ms and a job
 * that takes 600 ms, the same ratio as a 90 s job against the 30 s timeout.
 */

import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServerResponse } from 'http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DDOS_CONFIG, hardenServer } from '../../../utils/ddos-protection.js';
import type { JobLockStore } from '../job-lock-store.js';

const JOB_MS = 600;
const SCALED_SOCKET_TIMEOUT_MS = 200;
const SCHEDULER = 'scheduler-invoker@johnb-2025.iam.gserviceaccount.com';

const jobRuns = vi.hoisted(() => ({ count: 0 }));
const lockState = vi.hoisted(() => ({ broken: false }));

vi.mock('../memory-maintenance-jobs.js', async () => {
  const { sendJson } = await import('../helpers.js');
  return {
    handleMemoryConsolidation: async (res: ServerResponse) => {
      jobRuns.count++;
      await new Promise((resolve) => {
        setTimeout(resolve, JOB_MS);
      });
      sendJson(res, 200, { success: true, job: 'memory-consolidation' });
    },
    handleMemoryDecay: vi.fn(),
    handleMemoryDeduplication: vi.fn(),
    handleMemoryHealthCheck: vi.fn(),
  };
});

// Same contract as the Firestore store (pinned on the emulator in job-lock-store.emulator.test.ts).
vi.mock('../job-lock-store.js', () => ({
  firestoreJobLockStore: (): JobLockStore => {
    const locks = new Map<string, { runId: string; expiresAt: number }>();
    return {
      acquire: async (job, runId, now, leaseMs) => {
        if (lockState.broken) throw new Error('firestore unavailable');
        const held = locks.get(job);
        if (held && held.expiresAt > now)
          return { acquired: false, holder: held.runId, expiresAt: held.expiresAt };
        locks.set(job, { runId, expiresAt: now + leaseMs });
        return { acquired: true };
      },
      release: async (job, runId) => {
        if (locks.get(job)?.runId === runId) locks.delete(job);
      },
    };
  },
}));

// The real check, with Google's token verification replaced by a known token.
vi.mock('../scheduler-auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scheduler-auth.js')>();
  return {
    ...actual,
    verifySchedulerRequest: (
      req: Parameters<typeof actual.verifySchedulerRequest>[0],
      path: string
    ) =>
      actual.verifySchedulerRequest(req, path, {
        env: { GOOGLE_CLOUD_PROJECT: 'johnb-2025' },
        verify: async (token) =>
          token === 'scheduler-token' ? { email: SCHEDULER, email_verified: true } : null,
      }),
  };
});

let server: Server;
let port: number;

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

function trigger(path: string, token?: string): Promise<Reply | { error: string }> {
  return new Promise((resolve) => {
    const req = request(
      {
        port,
        path,
        method: 'POST',
        agent: false,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw || '{}') })
        );
      }
    );
    req.on('error', (error: NodeJS.ErrnoException) =>
      resolve({ error: error.code ?? error.message })
    );
    req.end();
  });
}

beforeAll(async () => {
  const { handleScheduledJobsRoutes } = await import('../index.js');
  server = createServer((req, res) => {
    if (req.url === '/slow-non-job') {
      setTimeout(() => res.end('late'), JOB_MS);
      return;
    }
    void handleScheduledJobsRoutes(req, res, req.url ?? '/').then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
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
  jobRuns.count = 0;
  lockState.broken = false;
});

afterEach(() => {
  delete process.env.SCHEDULED_JOB_LOCK;
});

describe('scheduled job routes on a hardened server', () => {
  it('lets a job run past the socket timeout and answers when it is done', async () => {
    const reply = await trigger('/api/jobs/memory-consolidation', 'scheduler-token');

    expect(reply).toEqual({ status: 200, body: { success: true, job: 'memory-consolidation' } });
    expect(jobRuns.count).toBe(1);
  });

  it('still cuts off a slow request that is not a job', async () => {
    // The lift is per job socket: the rest of the server keeps its 30 s protection.
    const reply = await trigger('/slow-non-job');
    expect(reply).toEqual({ error: 'ECONNRESET' });
  });

  it('does not run the job twice when the scheduler retries while it is running', async () => {
    const first = trigger('/api/jobs/memory-consolidation', 'scheduler-token');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    const retry = await trigger('/api/jobs/memory-consolidation', 'scheduler-token');

    expect(retry).toEqual({
      status: 200,
      body: {
        success: true,
        job: 'memory-consolidation',
        skipped: true,
        reason: 'already_running',
      },
    });
    expect(await first).toMatchObject({ status: 200, body: { success: true } });
    expect(jobRuns.count).toBe(1);
  });

  it('runs again on the next trigger once the last run has finished', async () => {
    await trigger('/api/jobs/memory-consolidation', 'scheduler-token');
    const next = await trigger('/api/jobs/memory-consolidation', 'scheduler-token');

    expect(next).toMatchObject({ status: 200, body: { success: true } });
    expect(next).not.toMatchObject({ body: { skipped: true } });
    expect(jobRuns.count).toBe(2);
  });

  it('runs both triggers when SCHEDULED_JOB_LOCK=off', async () => {
    process.env.SCHEDULED_JOB_LOCK = 'off';
    const [a, b] = await Promise.all([
      trigger('/api/jobs/memory-consolidation', 'scheduler-token'),
      trigger('/api/jobs/memory-consolidation', 'scheduler-token'),
    ]);

    expect([a, b]).toEqual([
      { status: 200, body: { success: true, job: 'memory-consolidation' } },
      { status: 200, body: { success: true, job: 'memory-consolidation' } },
    ]);
    expect(jobRuns.count).toBe(2);
  });

  it('still runs the job when the lock store is down', async () => {
    lockState.broken = true;
    const reply = await trigger('/api/jobs/memory-consolidation', 'scheduler-token');

    expect(reply).toEqual({ status: 200, body: { success: true, job: 'memory-consolidation' } });
    expect(jobRuns.count).toBe(1);
  });

  it('refuses a trigger without the scheduler token with 401 and runs nothing', async () => {
    const none = await trigger('/api/jobs/memory-consolidation');
    const forged = await trigger('/api/jobs/memory-consolidation', 'forged');

    expect(none).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(forged).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(jobRuns.count).toBe(0);
  });
});

describe('job socket timeout', () => {
  it('sits above the 30 s server timeout and below Cloud Run’s 300 s request timeout', async () => {
    const { CLOUD_RUN_REQUEST_TIMEOUT_MS, JOB_SOCKET_TIMEOUT_MS } =
      await import('../job-run-guard.js');
    expect(JOB_SOCKET_TIMEOUT_MS).toBeGreaterThan(DDOS_CONFIG.socketTimeout);
    expect(JOB_SOCKET_TIMEOUT_MS).toBeLessThan(CLOUD_RUN_REQUEST_TIMEOUT_MS);
  });
});
