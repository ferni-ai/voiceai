/**
 * The index drift check must pass the real index file against today's prod and
 * dev listings, and fail with "would delete" the moment the file loses something
 * the database has: a TTL policy, a field override, or a composite index.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  computeDrift,
  databasesInFirebaseJson,
  fixtureDir,
  readListing,
  report,
  type IndexFile,
} from '../firestore-indexes-drift.js';

const REPO = join(__dirname, '..', '..', '..');
const indexFile = (): IndexFile =>
  JSON.parse(readFileSync(join(REPO, 'firestore.indexes.json'), 'utf8')) as IndexFile;
const prod = () => readListing(fixtureDir('(default)'));
const dev = () => readListing(fixtureDir('ferni-dev'));

function without(file: IndexFile, group: string, path: string): IndexFile {
  return {
    ...file,
    fieldOverrides: (file.fieldOverrides ?? []).filter(
      (o) => !(o.collectionGroup === group && o.fieldPath === path)
    ),
  };
}

describe('firestore index drift', () => {
  it('checks every database firebase.json deploys', () => {
    expect(databasesInFirebaseJson(REPO).map((d) => d.database)).toEqual([
      '(default)',
      'ferni-dev',
    ]);
  });

  it('the repo file deletes nothing in prod; it only creates the 3 exemptions and the fact vector index', () => {
    const drift = computeDrift(indexFile(), prod());
    expect(drift.wouldDelete).toEqual([]);
    expect(drift.wouldCreate).toEqual([
      'composite dynamic_facts (COLLECTION): embedding VECTOR',
      'field override memory_vectors.text indexes=[none (exempt)]',
      'field override unified_memories.content indexes=[none (exempt)]',
      'field override vectors.text indexes=[none (exempt)]',
    ]);
  });

  it('removing one TTL policy from the file fails the check with "would delete"', () => {
    const before = report('(default)', 'fixture', computeDrift(indexFile(), prod()));
    expect(before.ok).toBe(true);

    const after = report(
      '(default)',
      'fixture',
      computeDrift(without(indexFile(), 'insights', 'ttl_date'), prod())
    );
    expect(after.ok).toBe(false);
    expect(after.text).toContain('would delete (1)');
    expect(after.text).toContain('- field override insights.ttl_date [TTL policy]');
  });

  it('setting ttl:false on a prod TTL field counts as a delete', () => {
    const file = indexFile();
    const fieldOverrides = (file.fieldOverrides ?? []).map((o) =>
      o.collectionGroup === 'rate_limits' && o.fieldPath === 'expireAt' ? { ...o, ttl: false } : o
    );
    const drift = computeDrift({ ...file, fieldOverrides }, prod());
    expect(drift.wouldDelete).toHaveLength(1);
    expect(drift.wouldDelete[0]).toMatch(
      /^field override rate_limits\.expireAt .*drops TTL policy$/
    );
  });

  it('dropping an index from an existing override counts as a delete', () => {
    const file = indexFile();
    const fieldOverrides = (file.fieldOverrides ?? []).map((o) =>
      o.collectionGroup === 'support_requests' && o.fieldPath === 'status'
        ? { ...o, indexes: [] }
        : o
    );
    const drift = computeDrift({ ...file, fieldOverrides }, prod());
    expect(drift.wouldDelete).toEqual([
      'field override support_requests.status indexes=[ASCENDING/COLLECTION_GROUP]: drops ASCENDING/COLLECTION_GROUP',
    ]);
  });

  it('removing a composite that prod has fails the check', () => {
    const file = indexFile();
    const gone = file.indexes.find((i) => i.collectionGroup === 'waitlist');
    expect(gone).toBeDefined();
    const drift = computeDrift(
      { ...file, indexes: file.indexes.filter((i) => i !== gone) },
      prod()
    );
    expect(drift.wouldDelete).toHaveLength(1);
    expect(drift.wouldDelete[0]).toMatch(/^composite waitlist /);
  });

  it('dev deletes nothing and gains every TTL policy prod has', () => {
    const drift = computeDrift(indexFile(), dev());
    expect(drift.wouldDelete).toEqual([]);
    const prodTtls = prod().ttls.map((f) =>
      f.name.split('/collectionGroups/')[1].replace('/fields/', '.')
    );
    expect(prodTtls).toHaveLength(16);
    for (const ttl of prodTtls)
      expect(
        drift.wouldCreate.some((c) => c.startsWith(`field override ${ttl} [TTL policy]`))
      ).toBe(true);
  });
});
