import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const { needsResync } = await import('../backfill-forgotten-resync.js');

describe('which facts the backfill resets', () => {
  it('only facts that are forgotten and marked synced', () => {
    expect(needsResync({ forgottenAt: '2026-01-07', syncedToSpanner: true })).toBe(true);
    expect(needsResync({ forgottenAt: { seconds: 1 }, syncedToSpanner: true })).toBe(true);
    expect(needsResync({ forgottenAt: '2026-01-07', syncedToSpanner: false })).toBe(false); // already queued
    expect(needsResync({ forgottenAt: '2026-01-07', syncedToSpanner: 'retry' })).toBe(false);
    expect(needsResync({ syncedToSpanner: true })).toBe(false); // not forgotten
  });
});
