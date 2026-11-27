/**
 * The #4293 cleanup finds only a try-first visitor's record holding nothing but temporalPatterns,
 * deletes only with --apply, and refuses to run without --database. Synthetic ids only.
 */
import { FieldPath, type Firestore } from '@google-cloud/firestore';
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

const PROJECT = 'test-project-0101';
const CONFIRM = `--confirm-project=${PROJECT}`;

describe('parseArgs', () => {
  it('requires --database with a value', () => {
    expect(typeof parseArgs([], PROJECT)).toBe('string');
    expect(typeof parseArgs(['--database', '--apply'], PROJECT)).toBe('string');
  });

  it('is a dry run unless --apply', () => {
    expect(parseArgs(['--database', 'ferni-dev'], PROJECT)).toEqual({
      database: 'ferni-dev',
      apply: false,
    });
  });

  it('refuses --apply without --confirm-project naming the project (the destructive gate)', () => {
    expect(parseArgs(['--database', '(default)', '--apply'], PROJECT)).toMatch(/Refusing/);
    expect(
      parseArgs(['--database', '(default)', '--apply', '--confirm-project=other'], PROJECT)
    ).toMatch(/Refusing/);
  });

  it('deletes only with --apply and the right --confirm-project; --dry-run wins', () => {
    expect(parseArgs(['--database', 'ferni-dev', '--apply', CONFIRM], PROJECT)).toEqual({
      database: 'ferni-dev',
      apply: true,
    });
    expect(
      parseArgs(['--database', 'ferni-dev', '--apply', CONFIRM, '--dry-run'], PROJECT)
    ).toEqual({ database: 'ferni-dev', apply: false });
  });
});

const UPDATED = { seconds: 1, nanoseconds: 0 };

/** A bogle_users page answering the demo range query, recording the cursors and deletes. */
function fakeDb(
  docs: Array<{ id: string; data: Record<string, unknown>; subcollections?: number }>
) {
  const deleted: Array<{ id: string; precondition: unknown }> = [];
  const cursors: Record<string, unknown[]> = {};
  const snapshots = docs.map((d) => ({
    id: d.id,
    data: () => d.data,
    updateTime: UPDATED,
    ref: {
      listCollections: async () => Array.from({ length: d.subcollections ?? 0 }),
      delete: async (precondition?: unknown) => void deleted.push({ id: d.id, precondition }),
    },
  }));
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      cursors[name] = args;
      return query;
    };
  const query = {
    orderBy: record('orderBy'),
    startAt: record('startAt'),
    endAt: record('endAt'),
    limit: record('limit'),
    startAfter: record('startAfter'),
    get: async () => ({ docs: snapshots }),
  };
  return { db: { collection: () => query } as unknown as Firestore, deleted, cursors };
}

describe('run', () => {
  const records = [
    { id: 'device:demo_test0101', data: patterns },
    { id: 'device:demo_test0102', data: { ...patterns, name: 'Robin Testcase' } },
    { id: 'device:demo_test0103', data: patterns, subcollections: 1 },
  ];

  it('reads only the device:demo_ id range', async () => {
    const { db, cursors } = fakeDb(records);

    await run(db, false);

    expect(String(cursors.orderBy?.[0])).toBe(String(FieldPath.documentId()));
    expect(cursors.startAt).toEqual(['device:demo_']);
    expect(cursors.endAt).toEqual(['device:demo_\uf8ff']);
  });

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

  it('apply: deletes only the record holding nothing but temporalPatterns, if unchanged', async () => {
    const { db, deleted } = fakeDb(records);

    const counts = await run(db, true);

    expect(deleted).toEqual([
      { id: 'device:demo_test0101', precondition: { lastUpdateTime: UPDATED } },
    ]);
    expect(counts.deleted).toBe(1);
  });
});
