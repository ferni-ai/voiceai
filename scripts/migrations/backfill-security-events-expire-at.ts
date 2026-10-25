/**
 * Give old security_events documents the expireAt a TTL policy deletes them by.
 *
 * withExpiry (security-event-expiry.ts) stamps new events since ~2026-10-20, but
 * ~57.7K older ones have no expireAt, so a TTL policy on expireAt never deletes
 * them. This writes expireAt = timestamp + 90 days, and no earlier than
 * GRACE_MS from the run, so nothing is deleted the moment the policy is on and
 * there is a week to abort. Only the expireAt field is written; documents that
 * already have one, or have no readable timestamp, are left alone.
 *
 * Dry run by default (scripts/destructive-gate.ts): counts only, no ids or contents.
 *
 *   npx tsx scripts/migrations/backfill-security-events-expire-at.ts
 *   npx tsx scripts/migrations/backfill-security-events-expire-at.ts --apply --confirm-project=johnb-2025
 *
 * FIRESTORE_DATABASE picks the database (default "(default)"), e.g. ferni-dev.
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { SECURITY_EVENT_RETENTION_MS } from '../../src/services/platform/security-event-expiry.js';

export const COLLECTION = 'security_events';
/** The least time between the backfill and any deletion it causes. */
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE = 400;

interface Doc {
  ref: unknown;
  get(field: string): unknown;
}
interface Query {
  orderBy(field: string): Query;
  select(...fields: string[]): Query;
  limit(n: number): Query;
  startAfter(doc: Doc): Query;
  get(): Promise<{ docs: Doc[] }>;
}
/** The slice of Firestore the backfill uses, so a test can hand it a fake. */
export interface EventsDb {
  collection(name: string): Query;
  batch(): { update(ref: unknown, data: { expireAt: Date }): unknown; commit(): Promise<unknown> };
}

export interface BackfillCounts {
  scanned: number;
  alreadyStamped: number;
  noTimestamp: number;
  /** Would be stamped with timestamp + 90 days */
  stamped: number;
  /** Already past 90 days (or inside the grace): stamped with run time + GRACE_MS */
  stampedAtGrace: number;
  written: number;
}

/** A Firestore Timestamp, a Date or an ISO string, in ms; null when unreadable. */
function millis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function')
    return (value as { toMillis(): number }).toMillis();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/** The expireAt a document should get, or why it gets none. */
export function expireAtFor(
  doc: { timestamp: unknown; expireAt: unknown },
  now: number
): { at: Date; atGrace: boolean } | 'stamped' | 'no-timestamp' {
  if (doc.expireAt !== undefined && doc.expireAt !== null) return 'stamped';
  const ts = millis(doc.timestamp);
  if (ts === null) return 'no-timestamp';
  const due = ts + SECURITY_EVENT_RETENTION_MS;
  const floor = now + GRACE_MS;
  return due >= floor
    ? { at: new Date(due), atGrace: false }
    : { at: new Date(floor), atGrace: true };
}

export async function backfill(
  db: EventsDb,
  apply: boolean,
  now = Date.now()
): Promise<BackfillCounts> {
  const c: BackfillCounts = {
    scanned: 0,
    alreadyStamped: 0,
    noTimestamp: 0,
    stamped: 0,
    stampedAtGrace: 0,
    written: 0,
  };
  let last: Doc | undefined;
  for (;;) {
    const base = db.collection(COLLECTION).orderBy('__name__').select('timestamp', 'expireAt');
    const page = (await (last ? base.startAfter(last) : base).limit(PAGE).get()).docs;
    if (page.length === 0) break;
    const batch = db.batch();
    let writes = 0;
    for (const doc of page) {
      c.scanned++;
      const want = expireAtFor(
        { timestamp: doc.get('timestamp'), expireAt: doc.get('expireAt') },
        now
      );
      if (want === 'stamped') c.alreadyStamped++;
      else if (want === 'no-timestamp') c.noTimestamp++;
      else {
        if (want.atGrace) c.stampedAtGrace++;
        else c.stamped++;
        if (apply) {
          batch.update(doc.ref, { expireAt: want.at });
          writes++;
        }
      }
    }
    if (writes > 0) {
      await batch.commit();
      c.written += writes;
    }
    if (page.length < PAGE) break;
    last = page[page.length - 1];
  }
  return c;
}

export async function main(argv: readonly string[] = process.argv, db?: EventsDb): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const databaseId = process.env.FIRESTORE_DATABASE || '(default)';
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') {
    console.error(refusalMessage(projectId));
    process.exitCode = 1;
    return;
  }
  if (!db) {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({ projectId, databaseId }) as unknown as EventsDb;
  }
  const c = await backfill(db, mode === 'execute');
  const verb = mode === 'execute' ? 'Wrote' : 'DRY RUN: would write';
  console.log(`${COLLECTION} on ${projectId}/${databaseId}: scanned ${c.scanned}`);
  console.log(`  already have expireAt        ${c.alreadyStamped}`);
  console.log(`  no readable timestamp (skip) ${c.noTimestamp}`);
  console.log(`  expireAt = timestamp + 90 d  ${c.stamped}`);
  console.log(`  expireAt = run time + 7 d    ${c.stampedAtGrace}`);
  console.log(
    `${verb} expireAt on ${mode === 'execute' ? c.written : c.stamped + c.stampedAtGrace} documents`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('backfill-security-events-expire-at failed:', err);
    process.exit(1);
  });
}
