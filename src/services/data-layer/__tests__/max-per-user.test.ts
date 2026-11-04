import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_PAGE_SIZE } from '../../../memory/firestore-vector-store/types.js';
import { getEntityPolicy } from '../indexing-policy.js';
import {
  enforceMaxPerUser,
  forgetIndexedDoc,
  resetMaxPerUserCache,
  type CappedVectorStore,
} from '../max-per-user.js';
import type { EntityType } from '../types.js';

const TYPE = 'capacity_state' as EntityType;
const MAX = getEntityPolicy(TYPE)?.conditions?.maxPerUser as number;
const T0 = Date.parse('2026-10-05T12:00:00Z');

/** A user's index: `n` docs of TYPE (oldest first) plus unrelated docs. */
function store(n: number) {
  const docs = [
    ...Array.from({ length: n }, (_, i) => ({
      id: `s_${TYPE}_${i}`,
      metadata: { entityType: TYPE, indexedAt: new Date(T0 - (n - i) * 60_000).toISOString() },
    })),
    { id: 'fact_1', metadata: { entityType: 'fact', indexedAt: '2020-01-01T00:00:00Z' } },
  ];
  const s: CappedVectorStore = {
    list: vi.fn(async () => docs),
    removeDocument: vi.fn(async () => true),
  };
  return s;
}

type Doc = { id: string; metadata: Record<string, unknown> };

/**
 * Firestore's list(): userId and metadata equalities in the query, then one
 * page. `others` docs of another type come first, then `n` of TYPE.
 */
function pagedStore(others: number, n: number) {
  const docs: Doc[] = [
    ...Array.from({ length: others }, (_, i) => ({
      id: `fact_${i}`,
      metadata: { userId: 'u1', entityType: 'fact', indexedAt: '2020-01-01T00:00:00Z' },
    })),
    ...Array.from({ length: n }, (_, i) => ({
      id: `s_${TYPE}_${i}`,
      metadata: {
        userId: 'u1',
        entityType: TYPE,
        indexedAt: new Date(T0 - (n - i) * 60_000).toISOString(),
      },
    })),
  ];
  const s: CappedVectorStore = {
    list: vi.fn(async (filter: { userId: string; metadata?: Record<string, unknown> }) =>
      docs
        .filter((d) => d.metadata.userId === filter.userId)
        .filter((d) => Object.entries(filter.metadata ?? {}).every(([k, v]) => d.metadata[k] === v))
        .slice(0, LIST_PAGE_SIZE)
    ),
    removeDocument: vi.fn(async () => true),
  };
  return s;
}

describe('maxPerUser enforcement', () => {
  beforeEach(() => resetMaxPerUserCache());

  it('has a cap to test against', () => {
    expect(MAX).toBeGreaterThan(1);
  });

  it('reads the index once per user and type, not on every change', async () => {
    const s = store(1);
    for (let i = 0; i < 5; i++) await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_0`, T0 + i);
    await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0 + 10);
    expect(s.list).toHaveBeenCalledTimes(1);
    expect(s.removeDocument).not.toHaveBeenCalled();
  });

  it('at the cap, re-indexing a doc that is already there removes nothing', async () => {
    const s = store(MAX);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_3`, T0)).toEqual([]);
    expect(s.removeDocument).not.toHaveBeenCalled();
  });

  it('at the cap, a new doc removes the oldest of that type only', async () => {
    const s = store(MAX);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0)).toEqual([`s_${TYPE}_0`]);
    expect(s.removeDocument).toHaveBeenCalledTimes(1);
    // The next new doc evicts the next oldest, still from memory.
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new2`, T0 + 1)).toEqual([
      `s_${TYPE}_1`,
    ]);
    expect(s.list).toHaveBeenCalledTimes(1);
  });

  it('a re-indexed doc becomes the newest, so it is evicted last', async () => {
    const s = store(MAX);
    await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_0`, T0);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0 + 1)).toEqual([
      `s_${TYPE}_1`,
    ]);
  });

  it('a deleted doc frees its slot', async () => {
    const s = store(MAX);
    await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_0`, T0);
    forgetIndexedDoc('u1', TYPE, `s_${TYPE}_2`);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0 + 1)).toEqual([]);
  });

  it('re-reads after 30 minutes, since other instances index too', async () => {
    const s = store(1);
    await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_0`, T0);
    await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_0`, T0 + 30 * 60_000);
    expect(s.list).toHaveBeenCalledTimes(1);
    await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_0`, T0 + 30 * 60_000 + 1);
    expect(s.list).toHaveBeenCalledTimes(2);
  });

  it('concurrent changes for one user share a single read', async () => {
    const s = store(1);
    await Promise.all([
      enforceMaxPerUser(s, 'u1', TYPE, 'a', T0),
      enforceMaxPerUser(s, 'u1', TYPE, 'b', T0),
    ]);
    expect(s.list).toHaveBeenCalledTimes(1);
  });

  it('a failing read is logged and indexing goes on', async () => {
    const s = store(0);
    vi.mocked(s.list).mockRejectedValueOnce(new Error('firestore down'));
    await expect(enforceMaxPerUser(s, 'u1', TYPE, 'a', T0)).resolves.toEqual([]);
  });

  it('asks the store for this entity type only', async () => {
    const s = store(1);
    await enforceMaxPerUser(s, 'u1', TYPE, 'a', T0);
    expect(s.list).toHaveBeenCalledWith({ userId: 'u1', metadata: { entityType: TYPE } });
  });

  it('counts docs of the type that sit past the first page of the user', async () => {
    const s = pagedStore(LIST_PAGE_SIZE + 100, MAX);
    // Unfiltered, the page holds none of them.
    expect(
      (await s.list({ userId: 'u1' } as never)).filter((d) => d.metadata?.entityType === TYPE)
    ).toEqual([]);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0)).toEqual([`s_${TYPE}_0`]);
    expect(s.removeDocument).toHaveBeenCalledWith(`s_${TYPE}_0`);
  });

  it('types without a cap are never read', async () => {
    const s = store(0);
    await enforceMaxPerUser(s, 'u1', 'no_such_type' as EntityType, 'a', T0);
    expect(s.list).not.toHaveBeenCalled();
  });
});
