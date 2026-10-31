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
  UNDECLARABLE_TTLS,
  type IndexFile,
} from '../firestore-indexes-drift.js';

const REPO = join(__dirname, '..', '..', '..');
const indexFile = (): IndexFile =>
  JSON.parse(readFileSync(join(REPO, 'firestore.indexes.json'), 'utf8')) as IndexFile;
const prod = () => readListing(fixtureDir('(default)'));
const dev = () => readListing(fixtureDir('ferni-dev'));
const devAllow = UNDECLARABLE_TTLS['ferni-dev'];

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

  it('the repo file deletes nothing in prod; it only creates the 3 exemptions, the activity and the waitlist indexes', () => {
    const drift = computeDrift(indexFile(), prod());
    expect(drift.wouldDelete).toEqual([]);
    expect(drift.allowedDelete).toEqual([]);
    expect(drift.wouldCreate).toEqual([
      // the activity ledger's readers (activity-store.ts listActivity), not deployed yet
      'composite activity (COLLECTION): state ASCENDING, updatedAt DESCENDING',
      'composite activity (COLLECTION): subjectKeys CONTAINS, state ASCENDING, updatedAt DESCENDING',
      'composite activity (COLLECTION): subjectKeys CONTAINS, updatedAt DESCENDING',
      // the waitlist wave store's lapse query (wave-store.ts), not deployed yet
      'composite waitlist (COLLECTION): status ASCENDING, seatExpiresAt ASCENDING',
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

  it('dev deletes nothing undeclared and gains every TTL policy prod has', () => {
    const drift = computeDrift(indexFile(), dev(), devAllow);
    expect(drift.wouldDelete).toEqual([]);
    expect(drift.staleAllow).toEqual([]);
    expect(drift.allowedDelete).toHaveLength(11);
    const prodTtls = prod().ttls.map((f) =>
      f.name.split('/collectionGroups/')[1].replace('/fields/', '.')
    );
    expect(prodTtls).toHaveLength(18);
    // Each prod policy is either already on dev or one the next dev deploy adds.
    const devTtls = new Set(
      dev().ttls.map((f) => f.name.split('/collectionGroups/')[1].replace('/fields/', '.'))
    );
    for (const ttl of prodTtls)
      expect(
        devTtls.has(ttl) ||
          drift.wouldCreate.some((c) => c.startsWith(`field override ${ttl} [TTL policy]`))
      ).toBe(true);
  });

  it('without the allow-list, dev fails on its 11 dev-only TTL policies', () => {
    const drift = computeDrift(indexFile(), dev());
    expect(drift.wouldDelete).toHaveLength(11);
    expect(report('ferni-dev', 'fixture', drift).ok).toBe(false);
  });

  it('the dev allow-list never excuses a prod delete', () => {
    // Prod has rate_limits.expireAt; allowing that key on dev must not hide prod losing it.
    const drift = computeDrift(without(indexFile(), 'rate_limits', 'expireAt'), prod(), devAllow);
    expect(drift.wouldDelete).toEqual([
      'field override rate_limits.expireAt [TTL policy] indexes=[ASCENDING/COLLECTION, DESCENDING/COLLECTION, CONTAINS/COLLECTION]',
    ]);
    // ...and every dev-only entry is stale against prod, which has none of them.
    expect(drift.staleAllow).toHaveLength(11);
  });

  it('an allow-list entry whose offset no longer matches the listing fails', () => {
    const listing = dev();
    listing.ttls = listing.ttls.map((f) =>
      f.name.endsWith('/health_checks/fields/timestamp')
        ? { ...f, ttlConfig: { state: 'ACTIVE', expirationOffset: '86400s' } }
        : f
    );
    const out = report('ferni-dev', 'fixture', computeDrift(indexFile(), listing, devAllow));
    expect(out.ok).toBe(false);
    expect(out.text).toContain('would delete (1)');
    expect(out.text).toContain('- field override health_checks.timestamp [TTL policy]');
    expect(out.text).toContain('! health_checks.timestamp offset=2592000s');
  });

  it('an allow-list entry for a policy that is gone fails', () => {
    const listing = dev();
    listing.ttls = listing.ttls.filter((f) => !f.name.endsWith('/security_events/fields/expireAt'));
    const out = report('ferni-dev', 'fixture', computeDrift(indexFile(), listing, devAllow));
    expect(out.ok).toBe(false);
    expect(out.text).toContain('! security_events.expireAt offset=none');
  });
});
