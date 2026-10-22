/**
 * POST /api/jobs/bq-erasure runs the BigQuery erasure (services/analytics/bq-erasure.ts) only
 * while BQ_ERASURE is on; off, it reads no queue and deletes nothing.
 */
import type { ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runBqErasure = vi.hoisted(() =>
  vi.fn(async () => ({ due: 1, erased: 1, retrying: 0, failedTables: [], overdue: 0 }))
);
const getFirestoreDb = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('../../../services/analytics/bq-erasure.js', () => ({ runBqErasure }));
vi.mock('../../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb }));

import { handleBqErasure } from '../maintenance-jobs.js';

const call = async () => {
  const end = vi.fn();
  const writeHead = vi.fn();
  const res = { writeHead, setHeader: vi.fn(), end } as unknown as ServerResponse;
  await handleBqErasure(res);
  return { status: writeHead.mock.calls[0]?.[0], body: JSON.parse(end.mock.calls[0][0] as string) };
};

describe('bq-erasure job', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    runBqErasure.mockClear();
    getFirestoreDb.mockClear();
  });

  it('off (the default): runs nothing and answers that it skipped', async () => {
    const { status, body } = await call();
    expect(runBqErasure).not.toHaveBeenCalled();
    expect(getFirestoreDb).not.toHaveBeenCalled();
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, job: 'bq-erasure', skipped: 'BQ_ERASURE off' });
  });

  it('on: runs the erasure and answers its counts', async () => {
    vi.stubEnv('BQ_ERASURE', 'on');
    const { status, body } = await call();
    expect(runBqErasure).toHaveBeenCalledTimes(1);
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, job: 'bq-erasure', erased: 1 });
    expect(body).not.toHaveProperty('skipped');
  });
});
