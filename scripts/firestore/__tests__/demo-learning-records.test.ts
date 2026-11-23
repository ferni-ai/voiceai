/**
 * The #4293 cleanup finds only a try-first visitor's record holding nothing but temporalPatterns,
 * deletes only with --apply, and refuses to run without --database. Synthetic ids only.
 */
import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';

import { isDemoLearningOnlyRecord, parseArgs, run } from '../demo-learning-records.js';

const patterns = { temporalPatterns: { timeStats: { evening: 1 } } };

describe('isDemoLearningOnlyRecord', () => {
  it('a demo id holding only temporalPatterns', () => {
    expect(isDemoLearningOnlyRecord('device:demo_test0101', patterns)).toBe(true);
  });

  it.each([
    ['a member id', 'user-test-0101', patterns],
    ['a non-demo device id', 'device:test0101', patterns],
    ['a demo record with a profile field', 'device:demo_test0101', { ...patterns, name: 'R' }],
    ['an empty demo record', 'device:demo_test0101', {}],
  ])('not %s', (_label, id, data) => {
    expect(isDemoLearningOnlyRecord(id, data)).toBe(false);
  });
});

describe('parseArgs', () => {
  it('requires --database with a value', () => {
    expect(typeof parseArgs([])).toBe('string');
    expect(typeof parseArgs(['--database', '--apply'])).toBe('string');
  });

  it('is a dry run unless --apply', () => {
    expect(parseArgs(['--database', 'ferni-dev'])).toEqual({ database: 'ferni-dev', apply: false });
    expect(parseArgs(['--database', 'ferni-dev', '--apply'])).toEqual({
      database: 'ferni-dev',
      apply: true,
    });
  });
});

/** A bogle_users page answering the demo range query, recording deletes. */
function fakeDb(
  docs: Array<{ id: string; data: Record<string, unknown>; subcollections?: number }>
) {
  const deleted: string[] = [];
  const snapshots = docs.map((d) => ({
    id: d.id,
    data: () => d.data,
    ref: {
      listCollections: async () => Array.from({ length: d.subcollections ?? 0 }),
      delete: async () => void deleted.push(d.id),
    },
  }));
  const query = {
    orderBy: () => query,
    startAt: () => query,
    endAt: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({ docs: snapshots }),
  };
  return { db: { collection: () => query } as unknown as Firestore, deleted };
}

describe('run', () => {
  const records = [
    { id: 'device:demo_test0101', data: patterns },
    { id: 'device:demo_test0102', data: { ...patterns, name: 'Robin Testcase' } },
    { id: 'device:demo_test0103', data: patterns, subcollections: 1 },
  ];

  it('dry run: counts, deletes nothing', async () => {
    const { db, deleted } = fakeDb(records);

    const counts = await run(db, false);

    expect(counts).toEqual({
      demoRecords: 3,
      matched: 1,
      keptOtherFields: 1,
      keptSubcollections: 1,
      deleted: 0,
    });
    expect(deleted).toEqual([]);
  });

  it('--apply: deletes only the record holding nothing but temporalPatterns', async () => {
    const { db, deleted } = fakeDb(records);

    const counts = await run(db, true);

    expect(deleted).toEqual(['device:demo_test0101']);
    expect(counts.deleted).toBe(1);
  });
});
