/**
 * Every collection-group query in src that needs a composite index has one in
 * firestore.indexes.json. Prod lacked the deferred_calls (status, scheduledFor)
 * index for weeks; the deferred-call job threw FAILED_PRECONDITION every minute
 * and nothing noticed. Declared is not deployed: scripts/firestore/check-indexes.ts
 * compares this file against prod.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  describeNeed,
  diffIndexes,
  type IndexFile,
  type IndexNeed,
  indexNeedsInSource,
  isResolved,
  serves,
} from '../index-needs.js';

const ROOT = process.cwd();

/**
 * Queries the scan cannot resolve, and why each is still covered. Keyed by file
 * and how the query was found, so a moved line doesn't break it but a new
 * unresolved query in the same file still has to be looked at.
 */
const UNRESOLVED_OK: Record<string, string> = {
  'src/services/scheduling/due-items.ts:collectionGroup':
    'claimDueItems itself; each caller is scanned with its own collection and dueField',
};

const isTest = (path: string): boolean =>
  /(?:^|\/)__tests__\//.test(path) || /\.(?:test|spec)\.ts$/.test(path);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !isTest(path) ? [path] : [];
  });
}

function repoNeeds(): IndexNeed[] {
  return sourceFiles(join(ROOT, 'src')).flatMap((path) =>
    indexNeedsInSource(relative(ROOT, path), readFileSync(path, 'utf8'))
  );
}

const declared = (): IndexFile =>
  JSON.parse(readFileSync(join(ROOT, 'firestore.indexes.json'), 'utf8')) as IndexFile;

const missing = (needs: IndexNeed[], file: IndexFile): string[] =>
  needs
    .filter(isResolved)
    .filter((n) => !file.indexes.some((i) => serves(i, n)))
    .map(describeNeed);

describe('index-needs scanner', () => {
  const scan = (body: string): IndexNeed[] => indexNeedsInSource('x.ts', body);

  it('finds a collection-group where + orderBy chain across lines', () => {
    const [need] = scan(`
      const C = 'reminders';
      await db.collectionGroup(C)
        .where('status', '==', 'pending')
        .where('scheduledFor', '<=', now)
        .orderBy('scheduledFor')
        .limit(5).get();`);
    expect(need).toMatchObject({
      collection: 'reminders',
      equality: ['status'],
      ordered: [{ field: 'scheduledFor', order: 'ASCENDING' }],
    });
  });

  it('puts a range field first and keeps a desc orderBy', () => {
    const [need] = scan(`db.collectionGroup('h').where('n', '!=', null).orderBy('t', 'desc')`);
    expect(need.ordered).toEqual([
      { field: 'n', order: 'ASCENDING' },
      { field: 't', order: 'DESCENDING' },
    ]);
  });

  it('leaves out queries a single-field index serves', () => {
    expect(scan(`db.collectionGroup('a').where('id', '==', x).limit(1)`)).toEqual([]);
    expect(scan(`db.collectionGroup('a').where('t', '<', x)`)).toEqual([]);
    expect(scan(`db.collectionGroup('a').where('s', '==', 1).where('k', '==', 2)`)).toEqual([]);
    expect(scan(`db.collectionGroup('a').orderBy('__name__').limit(9)`)).toEqual([]);
    // a plain collection query is out of scope
    expect(scan(`db.collection('a').where('s', '==', 1).orderBy('t')`)).toEqual([]);
  });

  it("reads claimDueItems' collection and dueField, through a const", () => {
    const [need] = scan(`
      const COLLECTION = 'deferred_calls';
      await claimDueItems(db, { collection: COLLECTION, dueField: 'scheduledFor', dueType: 'iso' });`);
    expect(need).toMatchObject({
      via: 'claimDueItems',
      collection: 'deferred_calls',
      equality: ['status'],
      ordered: [{ field: 'scheduledFor', order: 'ASCENDING' }],
    });
  });

  it('marks a field it cannot read as unresolved', () => {
    const [need] = scan(`db.collectionGroup(opts.c).where('s', '==', 1).orderBy(opts.f)`);
    expect(isResolved(need)).toBe(false);
  });

  it('matches an index only on scope, fields and direction', () => {
    const [need] = scan(`db.collectionGroup('h').where('p', '==', 1).orderBy('t', 'desc')`);
    const idx = (scope: 'COLLECTION' | 'COLLECTION_GROUP', order: 'ASCENDING' | 'DESCENDING') => ({
      collectionGroup: 'h',
      queryScope: scope,
      fields: [
        { fieldPath: 'p', order: 'ASCENDING' as const },
        { fieldPath: 't', order },
      ],
    });
    expect(serves(idx('COLLECTION_GROUP', 'DESCENDING'), need)).toBe(true);
    expect(serves(idx('COLLECTION_GROUP', 'ASCENDING'), need)).toBe(false);
    expect(serves(idx('COLLECTION', 'DESCENDING'), need)).toBe(false);
  });
});

describe('firestore.indexes.json covers every collection-group query in src', () => {
  const needs = repoNeeds();

  it('finds the queries behind the scheduled jobs (the scan is not empty)', () => {
    const found = new Set(needs.filter(isResolved).map((n) => n.collection));
    for (const c of ['deferred_calls', 'scheduled_outreach', 'reminders', 'follow_through']) {
      expect(found, c).toContain(c);
    }
  });

  it('declares an index for each one', () => {
    expect(missing(needs, declared())).toEqual([]);
  });

  it('would have caught the missing deferred_calls index', () => {
    const file = declared();
    const without: IndexFile = {
      indexes: file.indexes.filter((i) => i.collectionGroup !== 'deferred_calls'),
    };
    expect(missing(needs, without).join('\n')).toMatch(
      /deferred-calls\.ts:\d+ deferred_calls \(status asc, scheduledFor asc\)/
    );
  });

  it('allow-lists each query it cannot read, and no stale entries', () => {
    const unresolved = needs.filter((n) => !isResolved(n)).map((n) => `${n.file}:${n.via}`);
    expect(unresolved.filter((k) => !(k in UNRESOLVED_OK))).toEqual([]);
    expect(Object.keys(UNRESOLVED_OK).filter((k) => !unresolved.includes(k))).toEqual([]);
  });
});

describe('diffIndexes (check-indexes.ts)', () => {
  const field = (fieldPath: string, order: 'ASCENDING' | 'DESCENDING' = 'ASCENDING') => ({
    fieldPath,
    order,
  });
  const repo = [
    {
      collectionGroup: 'deferred_calls',
      queryScope: 'COLLECTION_GROUP',
      fields: [field('status'), field('scheduledFor')],
    },
    {
      collectionGroup: 'reminders',
      queryScope: 'COLLECTION_GROUP',
      fields: [field('status'), field('scheduledFor')],
    },
  ];
  const prodRow = (cg: string, state = 'READY') => ({
    name: `projects/p/databases/(default)/collectionGroups/${cg}/indexes/X1`,
    queryScope: 'COLLECTION_GROUP',
    fields: [field('status'), field('scheduledFor'), field('__name__')],
    state,
  });

  it('reports a declared index prod lacks, ignoring the __name__ Firestore appends', () => {
    expect(diffIndexes(repo, [prodRow('reminders')])).toEqual({
      missing: ['deferred_calls COLLECTION_GROUP (status:ASCENDING, scheduledFor:ASCENDING)'],
      notReady: [],
      undeclared: [],
    });
  });

  it('reports one still building, and counts prod-only ones apart', () => {
    const diff = diffIndexes(repo, [
      prodRow('reminders'),
      prodRow('deferred_calls', 'CREATING'),
      prodRow('other'),
    ]);
    expect(diff.missing).toEqual([]);
    expect(diff.notReady).toEqual([
      'deferred_calls COLLECTION_GROUP (status:ASCENDING, scheduledFor:ASCENDING) [CREATING]',
    ]);
    expect(diff.undeclared).toEqual([
      'other COLLECTION_GROUP (status:ASCENDING, scheduledFor:ASCENDING)',
    ]);
  });
});
