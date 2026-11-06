import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntityPolicy } from '../indexing-policy.js';
import {
  enforceMaxPerUser,
  forgetIndexedDoc,
  MAX_EVICTIONS_PER_WRITE,
  resetMaxPerUserCache,
  type CappedVectorStore,
} from '../max-per-user.js';
import type { EntityType } from '../types.js';

const TYPE = 'capacity_state' as EntityType;
const MAX = getEntityPolicy(TYPE)?.conditions?.maxPerUser as number;
const T0 = Date.parse('2026-10-05T12:00:00Z');

/**
 * A user's index: `n` docs of TYPE (oldest first) plus unrelated docs. With
 * `onlyType`, the read returns TYPE docs only, as a read narrowed by entity
 * type does.
 */
function store(n: number, { onlyType = false } = {}) {
  const docs = [
    ...Array.from({ length: n }, (_, i) => ({
      id: `s_${TYPE}_${i}`,
      metadata: { entityType: TYPE, indexedAt: new Date(T0 - (n - i) * 60_000).toISOString() },
    })),
    ...(onlyType
      ? []
      : [{ id: 'fact_1', metadata: { entityType: 'fact', indexedAt: '2020-01-01T00:00:00Z' } }]),
  ];
  const s: CappedVectorStore = {
    list: vi.fn(async () => docs),
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

  it('types without a cap are never read', async () => {
    const s = store(0);
    await enforceMaxPerUser(s, 'u1', 'no_such_type' as EntityType, 'a', T0);
    expect(s.list).not.toHaveBeenCalled();
  });
});

describe('maxPerUser eviction cap per write (MAX_PER_USER_EVICT_CAP)', () => {
  const OVER = 50;
  const oldestIds = (k: number) => Array.from({ length: k }, (_, i) => `s_${TYPE}_${i}`);

  beforeEach(() => resetMaxPerUserCache());
  afterEach(() => vi.unstubAllEnvs());

  it('caps at two', () => {
    expect(MAX_EVICTIONS_PER_WRITE).toBe(2);
  });

  for (const onlyType of [false, true]) {
    const read = onlyType ? 'a read narrowed to the type' : 'a read of every type';
    it(`on by default: ${OVER} over the cap, a new doc removes only the oldest two (${read})`, async () => {
      const s = store(MAX + OVER, { onlyType });
      expect(s.removeDocument).not.toHaveBeenCalled();
      const removed = await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0);
      expect(removed).toEqual(oldestIds(MAX_EVICTIONS_PER_WRITE));
      expect(s.removeDocument).toHaveBeenCalledTimes(MAX_EVICTIONS_PER_WRITE);
    });
  }

  it('on: an over-cap user drains by one doc per write, oldest first', async () => {
    const s = store(MAX + OVER);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new1`, T0)).toEqual(oldestIds(2));
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new2`, T0 + 1)).toEqual([
      `s_${TYPE}_2`,
      `s_${TYPE}_3`,
    ]);
    expect(s.removeDocument).toHaveBeenCalledTimes(4);
  });

  it('off: every excess doc goes in one write, as before', async () => {
    vi.stubEnv('MAX_PER_USER_EVICT_CAP', 'off');
    const s = store(MAX + OVER);
    const removed = await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0);
    expect(removed).toEqual(oldestIds(OVER + 1));
    expect(s.removeDocument).toHaveBeenCalledTimes(OVER + 1);
  });

  it('on, at the cap exactly: a new doc removes one', async () => {
    const s = store(MAX);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0)).toEqual(oldestIds(1));
  });

  it('on, under the cap: a new doc removes nothing', async () => {
    const s = store(MAX - 1);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_new`, T0)).toEqual([]);
    expect(s.removeDocument).not.toHaveBeenCalled();
  });

  it('on, over the cap: re-indexing a known doc removes nothing', async () => {
    const s = store(MAX + OVER);
    expect(await enforceMaxPerUser(s, 'u1', TYPE, `s_${TYPE}_7`, T0)).toEqual([]);
    expect(s.removeDocument).not.toHaveBeenCalled();
  });
});
