/**
 * POST /api/jobs/retry-pending-revocations runs the pending-revocation retry
 * (identity/google-revocations) and is a known job path, so the scheduler's
 * OIDC check guards it. The job definition lives in delivery-jobs.ts.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const retryPendingRevocations = vi.hoisted(() =>
  vi.fn(async () => ({ due: 2, revoked: 1, refused: 0, retrying: 1, gaveUp: 0 }))
);
vi.mock('../../../services/identity/google-revocations.js', () => ({ retryPendingRevocations }));

import { handleRetryPendingRevocations } from '../background-delivery-jobs.js';
import { JOB_PATHS, handleScheduledJobsRoutes } from '../index.js';

describe('retry-pending-revocations job', () => {
  it('runs the retry and answers its counts', async () => {
    const end = vi.fn();
    const res = { writeHead: vi.fn(), setHeader: vi.fn(), end } as unknown as ServerResponse;

    await handleRetryPendingRevocations(res);

    expect(retryPendingRevocations).toHaveBeenCalledTimes(1);
    expect(JSON.parse(end.mock.calls[0][0] as string)).toMatchObject({
      success: true,
      job: 'retry-pending-revocations',
      revoked: 1,
      retrying: 1,
    });
  });

  it('is a scheduler job path (so the OIDC check guards it)', () => {
    expect(JOB_PATHS.has('/api/jobs/retry-pending-revocations')).toBe(true);
  });

  it('refuses a POST without the scheduler OIDC token (401) and runs nothing', async () => {
    retryPendingRevocations.mockClear();
    const writeHead = vi.fn();
    const res = { writeHead, setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const req = { method: 'POST', headers: {} } as unknown as IncomingMessage;

    const handled = await handleScheduledJobsRoutes(
      req,
      res,
      '/api/jobs/retry-pending-revocations'
    );

    expect(handled).toBe(true);
    expect(writeHead.mock.calls[0]?.[0]).toBe(401);
    expect(retryPendingRevocations).not.toHaveBeenCalled();
  });
});
