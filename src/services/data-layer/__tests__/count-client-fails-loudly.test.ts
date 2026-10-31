/**
 * Aggregate counts never fail quietly.
 *
 * The Data Layer E2E nightly ran runTTLCleanup({ dryRun: true }) against the test
 * setup's in-memory fake (it has no Query.count()), and the dry run logged eleven
 * "collection may not exist" warnings instead of saying the client was wrong.
 * safeCount() swallowed the same TypeError, and any count RPC failure, into a
 * fallback read of up to 10,000 documents.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db: unknown;
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => db }));
vi.mock('firebase-admin', () => ({ default: { apps: [{}], initializeApp: vi.fn() } }));

import { safeCount } from '../firestore-pagination.js';
import { runTTLCleanup, TTL_CONFIGS, TTLCleanupClientError } from '../ttl-cleanup.js';

/** A client whose where() queries count with `count`, or have no count() at all. */
function client(count?: () => Promise<{ data: () => { count: number } }>) {
  const query: Record<string, unknown> = { get: vi.fn() };
  if (count) query.count = () => ({ get: count });
  return { collection: vi.fn(() => ({ where: vi.fn(() => query) })) };
}

describe('runTTLCleanup dry run', () => {
  beforeEach(() => {
    db = undefined;
  });

  it('throws on a client without Query.count() instead of reporting every collection', async () => {
    db = client();
    await expect(runTTLCleanup({ dryRun: true })).rejects.toBeInstanceOf(TTLCleanupClientError);
  });

  it('counts every configured collection on a client that has count()', async () => {
    db = client(async () => ({ data: () => ({ count: 2 }) }));
    const report = await runTTLCleanup({ dryRun: true });
    expect(report.totalErrors).toBe(0);
    expect(report.results).toHaveLength(TTL_CONFIGS.length);
    expect(report.totalDeleted).toBe(2 * TTL_CONFIGS.length);
  });

  it('still reports, not throws, a count RPC that fails', async () => {
    db = client(async () => {
      throw new Error('14 UNAVAILABLE');
    });
    const report = await runTTLCleanup({ dryRun: true });
    expect(report.totalErrors).toBe(TTL_CONFIGS.length);
    expect(report.results[0]?.error).toContain('UNAVAILABLE');
  });
});

describe('safeCount', () => {
  function collection(count: () => Promise<{ data: () => { count: number } }>) {
    const limited = { count: () => ({ get: count }), select: vi.fn(), get: vi.fn() };
    const ref = { limit: vi.fn(() => limited), count: vi.fn(), select: vi.fn(), get: vi.fn() };
    return { ref, limited };
  }

  it('propagates a failed count instead of falling back to a document read', async () => {
    const { ref, limited } = collection(async () => {
      throw new Error('7 PERMISSION_DENIED');
    });
    await expect(safeCount(ref as never)).rejects.toThrow('PERMISSION_DENIED');
    expect(limited.get).not.toHaveBeenCalled();
    expect(limited.select).not.toHaveBeenCalled();
  });

  it('counts at most maxToCount and says when it hit the limit', async () => {
    const { ref } = collection(async () => ({ data: () => ({ count: 50 }) }));
    expect(await safeCount(ref as never, 50)).toEqual({ count: 50, isTruncated: true });
    expect(ref.limit).toHaveBeenCalledWith(50);

    const small = collection(async () => ({ data: () => ({ count: 3 }) }));
    expect(await safeCount(small.ref as never, 50)).toEqual({ count: 3, isTruncated: false });
  });
});
