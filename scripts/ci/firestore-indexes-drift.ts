#!/usr/bin/env npx tsx
/**
 * Firestore index drift: what would `firebase deploy --only firestore:<db>` do to
 * the database's index config, computed from the index file and a listing of the
 * database?
 *
 * The deploy treats the file as the whole truth. A composite index, field override
 * or TTL policy that exists in the database but not in the file is offered for
 * deletion (and deleted outright with --force). Prod had 16 TTL policies and 3
 * field overrides that were never in the file, so one deploy could have dropped
 * every TTL in prod. This check fails when the file would delete anything; it
 * lists what the deploy would create, and passes.
 *
 * The comparison mirrors firebase-tools (lib/firestore/api.js, FirestoreApi.deploy):
 * - field overrides are listed with `usesAncestorConfig=false OR ttlConfig:*`, so a
 *   TTL field that inherits its indexes still counts, and `__default__` never does;
 * - an override is deleted when no file entry has its collection group and field path;
 * - a file entry is skipped when fieldMatchesSpec() holds, otherwise patched (a patch
 *   that drops a TTL or one of the override's indexes counts as a delete here);
 * - a composite matches on collection group, query scope, apiScope (default
 *   ANY_API), density (default SPARSE_ALL on STANDARD) and fields, with the
 *   implicit `__name__` field added as the deploy adds it.
 *
 * The listing is three `gcloud ... --format=json` dumps per database: `firestore
 * indexes composite list`, `firestore indexes fields list` and `firestore fields
 * ttls list`. CI reads the checked-in copies in scripts/ci/fixtures/firestore-indexes/<db>/
 * (index metadata only, no documents). Refresh them after any index deploy.
 *
 * usage:
 *   pnpm tsx scripts/ci/firestore-indexes-drift.ts                   every database in firebase.json vs its fixture (CI)
 *   pnpm tsx scripts/ci/firestore-indexes-drift.ts --database '(default)'
 *   pnpm tsx scripts/ci/firestore-indexes-drift.ts --live            list each database with gcloud (read-only)
 *   pnpm tsx scripts/ci/firestore-indexes-drift.ts --live --write-fixture   and save the listing as the fixture
 *
 * @module scripts/ci/firestore-indexes-drift
 */
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = join(REPO, 'scripts', 'ci', 'fixtures', 'firestore-indexes');
const PROJECT = 'johnb-2025';
/** Listing name → read-only gcloud command; each is a fixture file `<name>.json`. */
const LISTINGS = {
  composite: 'firestore indexes composite list',
  fields: 'firestore indexes fields list',
  ttls: 'firestore fields ttls list',
} as const;
type ListingName = keyof typeof LISTINGS;

interface IndexField {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
  vectorConfig?: unknown;
}
export interface SpecIndex {
  collectionGroup: string;
  queryScope?: string;
  apiScope?: string;
  density?: string;
  multikey?: boolean;
  fields: IndexField[];
}
export interface SpecField {
  collectionGroup: string;
  fieldPath: string;
  ttl?: boolean;
  indexes: { order?: string; arrayConfig?: string; queryScope?: string }[];
}
export interface IndexFile {
  indexes: SpecIndex[];
  fieldOverrides?: SpecField[];
}
type ApiIndex = Omit<SpecIndex, 'collectionGroup'> & { name: string };
interface ApiField {
  name: string;
  indexConfig?: { indexes?: { fields: IndexField[]; queryScope?: string }[] };
  ttlConfig?: unknown;
}
export type Listing = { composite: ApiIndex[]; fields: ApiField[]; ttls: ApiField[] };
export type Drift = {
  wouldDelete: string[];
  wouldCreate: string[];
  /** Would-deletes that UNDECLARABLE_TTLS names, matched exactly against the listing. */
  allowedDelete: string[];
  /** UNDECLARABLE_TTLS entries the listing no longer matches; these fail the check too. */
  staleAllow: string[];
};

/** `<collectionGroup>.<fieldPath>` → the policy's expirationOffset, or null for none. */
export type TtlAllowList = Record<string, string | null>;

/**
 * TTL policies that one database has and the index file cannot carry. The check reports
 * them as allowed would-deletes instead of failing. Keyed to the live listing
 * (`gcloud firestore fields ttls list --database=ferni-dev`, read-only, 2026-10-25); each
 * entry must match a live policy exactly (same offset, not declared in the file) or the
 * check fails, so the list cannot outlive the policies.
 *
 * Why they stay out of the file: firebase.json deploys this one file to BOTH databases,
 * and firebase-tools (15.10) only knows `ttl: boolean`. Its patchField() sends
 * `ttlConfig: {}`, which has no expirationOffset.
 * - The 8 with an offset: declaring them would create offset-less policies in prod, and
 *   prod would delete every document whose timestamp has already passed (a year of
 *   ai_email_log, all of health_checks, ...).
 * - The 3 without one: dev-first rollouts. Declaring them would switch them on in prod at
 *   the next index deploy, which needs Seth's OK. Move each into the file (and out of
 *   here) once prod has the policy.
 * A ferni-dev index deploy offers these for deletion: answer no, and never pass --force.
 */
export const UNDECLARABLE_TTLS: Record<string, TtlAllowList> = {
  'ferni-dev': {
    // Retention with an offset, added on dev 2026-10-22/23.
    'ai_email_log.timestamp': '31536000s',
    'anomaly_alerts.detected_at': '7776000s',
    'automation_queue.created_at': '7776000s',
    'bq_cost_log.timestamp': '7776000s',
    'health_checks.timestamp': '2592000s',
    'optimization_cycles.startTime': '7776000s',
    'team_notifications.createdAt': '7776000s',
    'ttl_offset_probe.createdAt': '86400s',
    // Expire-at fields, on dev first; prod has none of these yet.
    '_rate_limits.expiresAt': null,
    'intelligence_queue.expireAt': null,
    'security_events.expireAt': null,
  },
};

const groupOf = (name: string): string => name.split('/collectionGroups/')[1].split('/')[0];
const fieldOf = (name: string): string => name.split('/fields/')[1];
const mode = (i: { order?: string; arrayConfig?: string }): string =>
  (i.order ?? i.arrayConfig) as string;

/** The fields the deploy compares against: a `__name__` suffix, as processIndex() adds. */
function withNameSuffix(fields: IndexField[]): IndexField[] {
  const out = fields.map((f) => ({ ...f }));
  const last = out[out.length - 1];
  const suffixOrder = [...out].reverse().find((f) => f.order)?.order ?? 'ASCENDING';
  if (last?.vectorConfig) {
    const head = out.slice(0, -1);
    if (head.length === 0 || head[head.length - 1].fieldPath !== '__name__')
      head.push({ fieldPath: '__name__', order: suffixOrder });
    return [...head, last];
  }
  if (last?.fieldPath !== '__name__') out.push({ fieldPath: '__name__', order: suffixOrder });
  return out;
}

const fieldsKey = (fields: IndexField[]): string =>
  JSON.stringify(
    fields.map((f) => [f.fieldPath, f.order ?? null, f.arrayConfig ?? null, f.vectorConfig ?? null])
  );

function compositeMatches(index: ApiIndex, spec: SpecIndex): boolean {
  return (
    groupOf(index.name) === spec.collectionGroup &&
    index.queryScope === (spec.queryScope ?? 'COLLECTION') &&
    (index.apiScope ?? 'ANY_API') === (spec.apiScope ?? 'ANY_API') &&
    (index.density ?? 'SPARSE_ALL') === (spec.density ?? 'SPARSE_ALL') &&
    (index.multikey ?? false) === (spec.multikey ?? false) &&
    fieldsKey(index.fields) === fieldsKey(withNameSuffix(spec.fields))
  );
}

const describeComposite = (group: string, scope: string | undefined, fields: IndexField[]) =>
  `composite ${group} (${scope ?? 'COLLECTION'}): ` +
  fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath} ${f.order ?? f.arrayConfig ?? 'VECTOR'}`)
    .join(', ');

/** "ASCENDING/COLLECTION" per single-field index the database has for this field. */
function liveIndexes(field: ApiField): string[] {
  return (field.indexConfig?.indexes ?? []).map(
    (i) => `${mode(i.fields[0])}/${i.queryScope ?? 'COLLECTION'}`
  );
}
const specIndexes = (spec: SpecField): string[] =>
  spec.indexes.map((i) => `${mode(i)}/${i.queryScope ?? 'COLLECTION'}`);

/** firebase-tools fieldMatchesSpec(): true means the deploy leaves the field alone. */
function fieldMatches(field: ApiField, spec: SpecField): boolean {
  if (groupOf(field.name) !== spec.collectionGroup || fieldOf(field.name) !== spec.fieldPath)
    return false;
  if (spec.ttl !== undefined && Boolean(field.ttlConfig) !== spec.ttl) return false;
  const live = field.indexConfig?.indexes ?? [];
  if (live.length !== spec.indexes.length) return false;
  const specModes = spec.indexes.map(mode);
  // Modes only, like firebase-tools: a scope-only difference is skipped, not patched.
  return live.every((i) => specModes.includes(mode(i.fields[0])));
}

const describeOverride = (group: string, path: string, ttl: boolean, indexes: string[]) =>
  `field override ${group}.${path}${ttl ? ' [TTL policy]' : ''} indexes=[${indexes.join(', ') || 'none (exempt)'}]`;

const ttlOffset = (field: ApiField): string | null =>
  (field.ttlConfig as { expirationOffset?: string } | undefined)?.expirationOffset ?? null;

/**
 * What a deploy of `file` would do to the database `listing` describes. `allow` names
 * TTL policies the file cannot carry (UNDECLARABLE_TTLS for that database).
 */
export function computeDrift(file: IndexFile, listing: Listing, allow: TtlAllowList = {}): Drift {
  const wouldDelete: string[] = [];
  const wouldCreate: string[] = [];
  const allowedDelete: string[] = [];
  const allowUsed = new Set<string>();

  for (const index of listing.composite) {
    if (!file.indexes.some((spec) => compositeMatches(index, spec)))
      wouldDelete.push(describeComposite(groupOf(index.name), index.queryScope, index.fields));
  }
  for (const spec of file.indexes) {
    if (!listing.composite.some((index) => compositeMatches(index, spec)))
      wouldCreate.push(describeComposite(spec.collectionGroup, spec.queryScope, spec.fields));
  }

  // The deploy's field listing: overrides plus every TTL field, never __default__.
  const byName = new Map<string, ApiField>();
  for (const f of [...listing.fields, ...listing.ttls])
    if (!byName.has(f.name)) byName.set(f.name, f);
  const live = [...byName.values()].filter((f) => groupOf(f.name) !== '__default__');
  const specs = file.fieldOverrides ?? [];

  for (const field of live) {
    const spec = specs.find(
      (s) => s.collectionGroup === groupOf(field.name) && s.fieldPath === fieldOf(field.name)
    );
    const name = describeOverride(
      groupOf(field.name),
      fieldOf(field.name),
      Boolean(field.ttlConfig),
      liveIndexes(field)
    );
    if (!spec) {
      const key = `${groupOf(field.name)}.${fieldOf(field.name)}`;
      const allowed =
        Object.hasOwn(allow, key) && Boolean(field.ttlConfig) && ttlOffset(field) === allow[key];
      if (allowed) {
        allowUsed.add(key);
        allowedDelete.push(`${name} offset=${allow[key] ?? 'none'}`);
      } else wouldDelete.push(name);
      continue;
    }
    if (fieldMatches(field, spec)) continue;
    // Patched: anything the override has that the file entry lacks is lost.
    const keep = specIndexes(spec);
    const dropped = liveIndexes(field).filter((i) => !keep.includes(i));
    const ttlDropped = Boolean(field.ttlConfig) && spec.ttl === false;
    const lost = [...dropped, ...(ttlDropped ? ['TTL policy'] : [])];
    if (lost.length) wouldDelete.push(`${name}: drops ${lost.join(', ')}`);
    else wouldCreate.push(`${name}: becomes indexes=[${keep.join(', ')}]`);
  }
  for (const spec of specs) {
    const exists = live.some(
      (f) => groupOf(f.name) === spec.collectionGroup && fieldOf(f.name) === spec.fieldPath
    );
    if (!exists)
      wouldCreate.push(
        describeOverride(spec.collectionGroup, spec.fieldPath, Boolean(spec.ttl), specIndexes(spec))
      );
  }
  const staleAllow = Object.keys(allow)
    .filter((key) => !allowUsed.has(key))
    .map((key) => `${key} offset=${allow[key] ?? 'none'}`);
  return {
    wouldDelete: wouldDelete.sort(),
    wouldCreate: wouldCreate.sort(),
    allowedDelete: allowedDelete.sort(),
    staleAllow: staleAllow.sort(),
  };
}

/** The report a run prints; ok is false when the deploy would delete anything. */
export function report(
  database: string,
  source: string,
  drift: Drift
): { ok: boolean; text: string } {
  const lines = [
    `firestore index drift: ${database} vs ${source}`,
    `  would delete (${drift.wouldDelete.length}):`,
    ...drift.wouldDelete.map((d) => `    - ${d}`),
    `  would create (${drift.wouldCreate.length}):`,
    ...drift.wouldCreate.map((d) => `    + ${d}`),
  ];
  if (drift.allowedDelete.length)
    lines.push(
      `  would delete, allowed: TTL policies the file cannot carry (${drift.allowedDelete.length}; answer no at the prompt, never --force):`,
      ...drift.allowedDelete.map((d) => `    ~ ${d}`)
    );
  if (drift.staleAllow.length)
    lines.push(
      `  stale UNDECLARABLE_TTLS entries (${drift.staleAllow.length}; gone, offset changed, or now in the file):`,
      ...drift.staleAllow.map((d) => `    ! ${d}`)
    );
  const ok = drift.wouldDelete.length === 0 && drift.staleAllow.length === 0;
  if (drift.wouldDelete.length)
    lines.push(
      `  FAIL: a deploy of this file would delete ${drift.wouldDelete.length} item(s) from ${database}.`,
      '  Add them to the index file (or refresh the fixture if they were removed on purpose).'
    );
  if (drift.staleAllow.length)
    lines.push('  FAIL: update UNDECLARABLE_TTLS in scripts/ci/firestore-indexes-drift.ts.');
  return { ok, text: lines.join('\n') };
}

export const fixtureDir = (database: string): string =>
  join(FIXTURES, database.replace(/[()]/g, ''));

const parseListing = (read: (n: ListingName) => string): Listing =>
  Object.fromEntries(
    (Object.keys(LISTINGS) as ListingName[]).map((n) => [n, JSON.parse(read(n))])
  ) as Listing;

export const readListing = (dir: string): Listing =>
  parseListing((n) => readFileSync(join(dir, `${n}.json`), 'utf8'));

/** Read-only: the three gcloud list calls. Never creates, updates or deletes anything. */
function listLive(database: string, saveTo?: string): Listing {
  if (saveTo) mkdirSync(saveTo, { recursive: true });
  return parseListing((n) => {
    const args = [...LISTINGS[n].split(' '), `--database=${database}`, `--project=${PROJECT}`];
    const text = execFileSync('gcloud', [...args, '--format=json'], { encoding: 'utf8' });
    if (saveTo) writeFileSync(join(saveTo, `${n}.json`), text);
    return text;
  });
}

export function databasesInFirebaseJson(repo = REPO): { database: string; indexes: string }[] {
  const config = JSON.parse(readFileSync(join(repo, 'firebase.json'), 'utf8'));
  const entries = Array.isArray(config.firestore) ? config.firestore : [config.firestore];
  return entries.map((e: { database?: string; indexes: string }) => ({
    database: e.database ?? '(default)',
    indexes: e.indexes,
  }));
}

function main(): void {
  const args = process.argv.slice(2);
  const only = args.includes('--database') ? args[args.indexOf('--database') + 1] : undefined;
  const live = args.includes('--live');
  const write = args.includes('--write-fixture');
  let failed = false;
  for (const { database, indexes } of databasesInFirebaseJson()) {
    if (only && database !== only) continue;
    const file = JSON.parse(readFileSync(join(REPO, indexes), 'utf8')) as IndexFile;
    const dir = fixtureDir(database);
    const listing = live ? listLive(database, write ? dir : undefined) : readListing(dir);
    const source = live ? `live listing (${PROJECT})` : `fixture ${dir.slice(REPO.length + 1)}`;
    const allow = UNDECLARABLE_TTLS[database] ?? {};
    const { ok, text } = report(database, source, computeDrift(file, listing, allow));
    console.log(text);
    failed ||= !ok;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
