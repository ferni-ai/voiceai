/**
 * Strip the caller's words from the routing events already stored.
 *
 * Until 2026-10-24 each routed turn wrote semantic_router_events/{day}/events/{id} with the
 * full `inputText`; new events keep its length (routing-analytics.ts). This does the same to
 * old ones, and stamps the expireAt new events get (timestamp + 30 d) on those without one, so
 * the TTL policy ages them out too. Other fields stay, nothing is deleted. Dry run by default (destructive-gate.ts):
 * counts only. Finished days are printed, to resume with --from; a rerun writes nothing.
 *
 *   npx tsx scripts/migrations/strip-router-event-words.ts
 *   npx tsx scripts/migrations/strip-router-event-words.ts --apply --confirm-project=johnb-2025
 *   npx tsx scripts/migrations/strip-router-event-words.ts --apply --confirm-project=johnb-2025 --from=2026-05-01
 *
 * FIRESTORE_DATABASE picks the database (default "(default)"), e.g. ferni-dev.
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { getFirestoreDatabase } from '../../src/config/environment.js';
import { ROUTING_EVENT_RETENTION_MS } from '../../src/tools/semantic-router/persistence/firestore-persistence.js';

export const COLLECTION = 'semantic_router_events';
/** Fields holding words: the writer stored `inputText`; the rest the in-memory event held */
// prettier-ignore
export const WORD_FIELDS = ['inputText', 'normalizedText', 'intent', 'topMatch', 'action', 'extractedArgs', 'matchReason'] as const;
const PAGE = 400;

interface Doc {
  ref: unknown;
  get(field: string): unknown;
}
export interface EventsQuery {
  orderBy(field: string): EventsQuery;
  select(...fields: string[]): EventsQuery;
  limit(n: number): EventsQuery;
  startAfter(doc: Doc): EventsQuery;
  get(): Promise<{ docs: Doc[] }>;
}
/** The slice of Firestore the job uses, so a test can hand it a fake. */
export interface EventsDb {
  collection(name: string): {
    listDocuments(): Promise<Array<{ id: string; collection(name: string): EventsQuery }>>;
  };
  batch(): {
    update(ref: unknown, data: Record<string, unknown>): unknown;
    commit(): Promise<unknown>;
  };
}

export interface StripCounts {
  days: number;
  scanned: number;
  /** Events holding at least one word field */
  withWords: number;
  /** Events without an expireAt that get timestamp + 30 d */
  stamped: number;
  /** Events without an expireAt or a readable timestamp: not stamped */
  noTimestamp: number;
  written: number;
}

/** A Firestore Timestamp, a Date or an ISO string (what the writer stored), in ms */
export function millis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const t = value as { toMillis?: () => number } | null;
  if (typeof t?.toMillis === 'function') return t.toMillis();
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : ms;
}

/** The update that strips and stamps one event, or null when it needs neither. */
export function stripUpdate(doc: Doc, deleteField: unknown): Record<string, unknown> | null {
  const present = WORD_FIELDS.filter((f) => doc.get(f) !== undefined);
  const update: Record<string, unknown> = Object.fromEntries(present.map((f) => [f, deleteField]));
  const text = doc.get('inputText');
  if (typeof text === 'string' && doc.get('inputLength') === undefined) {
    update.inputLength = text.length;
  }
  const at = doc.get('expireAt') == null ? millis(doc.get('timestamp')) : null;
  if (at !== null) update.expireAt = new Date(at + ROUTING_EVENT_RETENTION_MS);
  return Object.keys(update).length > 0 ? update : null;
}

/**
 * Walk every day from `from` (inclusive) on, oldest first; strip each page in one batch
 * when `apply` is set. `onDay` hears each finished day, with the counts so far.
 */
export async function stripRouterEventWords(
  db: EventsDb,
  opts: {
    apply: boolean;
    deleteField: unknown;
    from?: string;
    onDay?: (day: string, c: StripCounts) => void;
  }
): Promise<StripCounts> {
  const c: StripCounts = {
    days: 0,
    scanned: 0,
    withWords: 0,
    stamped: 0,
    noTimestamp: 0,
    written: 0,
  };
  const days = (await db.collection(COLLECTION).listDocuments())
    .filter((d) => opts.from === undefined || d.id >= opts.from)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const day of days) {
    let last: Doc | undefined;
    for (;;) {
      const base = day
        .collection('events')
        .orderBy('__name__')
        .select(...WORD_FIELDS, 'inputLength', 'timestamp', 'expireAt');
      const page = (await (last ? base.startAfter(last) : base).limit(PAGE).get()).docs;
      if (page.length === 0) break;
      const batch = db.batch();
      let writes = 0;
      for (const doc of page) {
        c.scanned++;
        const update = stripUpdate(doc, opts.deleteField);
        if (doc.get('expireAt') == null && !update?.expireAt) c.noTimestamp++;
        if (!update) continue;
        if (WORD_FIELDS.some((f) => f in update)) c.withWords++;
        if (update.expireAt) c.stamped++;
        if (opts.apply) {
          batch.update(doc.ref, update);
          writes++;
        }
      }
      if (writes > 0) {
        await batch.commit();
        c.written += writes;
      }
      if (page.length < PAGE) break;
      last = page[page.length - 1];
    }
    c.days++;
    opts.onDay?.(day.id, c);
  }
  return c;
}

export async function main(
  argv: readonly string[] = process.argv,
  db?: EventsDb,
  deleteField?: unknown
): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const databaseId = getFirestoreDatabase();
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') {
    console.error(refusalMessage(projectId));
    process.exitCode = 1;
    return;
  }
  const from = argv.find((a) => a.startsWith('--from='))?.split('=')[1];
  if (from !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    console.error('--from takes a day, YYYY-MM-DD');
    process.exitCode = 1;
    return;
  }
  if (!db || deleteField === undefined) {
    const { Firestore, FieldValue } = await import('@google-cloud/firestore');
    db ??= new Firestore({ projectId, databaseId }) as unknown as EventsDb;
    deleteField ??= FieldValue.delete();
  }
  const apply = mode === 'execute';
  const verb = apply ? 'Stripped' : 'DRY RUN: would strip';
  console.log(`${COLLECTION} on ${projectId}/${databaseId}${from ? ` from ${from}` : ''}`);
  const c = await stripRouterEventWords(db, {
    apply,
    deleteField,
    from,
    onDay: (day, so) => console.log(`  done ${day} (scanned ${so.scanned} so far)`),
  });
  console.log(`Scanned ${c.scanned} events over ${c.days} days; ${c.withWords} hold words`);
  console.log(`  no expireAt: ${c.stamped} to stamp, ${c.noTimestamp} with no readable timestamp`);
  console.log(`${verb} words from ${c.withWords} events, expireAt on ${c.stamped}`);
  if (apply) console.log(`Wrote ${c.written} events`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('strip-router-event-words failed:', err);
    process.exit(1);
  });
}
