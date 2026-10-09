import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) }));

const { checkAccess } = await import('../src/services/access-check');

const ok = (data: unknown) => ({ ok: true, status: 200, data });
const fail = (status: number) => ({ ok: false, status, error: 'x' });
const noWait = { sleep: async () => undefined };

beforeEach(() => apiGet.mockReset());

describe('checkAccess', () => {
  it('maps each server answer to what the gate shows', async () => {
    apiGet.mockResolvedValueOnce(ok({ approved: true, status: 'approved' }));
    expect(await checkAccess(noWait)).toEqual({ kind: 'approved' });
    apiGet.mockResolvedValueOnce(ok({ approved: false, status: 'pending', email: 'a@b.c' }));
    expect(await checkAccess(noWait)).toEqual({ kind: 'waitlisted', email: 'a@b.c' });
    apiGet.mockResolvedValueOnce(ok({ approved: false, status: 'unverified_email' }));
    expect(await checkAccess(noWait)).toEqual({ kind: 'verify-email' });
    apiGet.mockResolvedValueOnce(ok({ approved: false, status: 'no_email' }));
    expect(await checkAccess(noWait)).toEqual({ kind: 'no-email' });
  });

  it('waits out a rate limit instead of calling it the waitlist', async () => {
    apiGet.mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok({ approved: true, status: 'approved' }));
    const sleep = vi.fn(async () => undefined);
    expect(await checkAccess({ sleep })).toEqual({ kind: 'approved' });
    expect(sleep).toHaveBeenCalledTimes(1);
    // our own backoff only: the generic quick retries would spend the limit
    expect(apiGet).toHaveBeenCalledWith('/api/waitlist/check', undefined, { maxRetries: 0 });
  });

  it('reports a check that keeps failing as unavailable, not waitlisted', async () => {
    apiGet.mockResolvedValue(fail(500));
    expect(await checkAccess({ ...noWait, attempts: 3 })).toEqual({ kind: 'unavailable' });
    expect(apiGet).toHaveBeenCalledTimes(3);
  });

  it('does not retry an answer that will not change', async () => {
    apiGet.mockResolvedValue(fail(403));
    expect(await checkAccess(noWait)).toEqual({ kind: 'unavailable' });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
