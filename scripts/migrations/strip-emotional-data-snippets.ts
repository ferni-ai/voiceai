/**
 * Strip the caller's words from old emotional_data/{uid}/points documents.
 *
 * Each point was written by saveEmotionalDataPoint as the whole in-memory point:
 * { timestamp, emotion, intensity, topics, context, createdAt }, where `context`
 * was userText.slice(0, 100). The app no longer writes or reads either
 * (personality/emotional-data-shape.ts). This rewrites each point to the label,
 * intensity and times, and deletes a point that has no valid label, intensity
 * or time (nothing could show it, and its text can't stay). The sibling of
 * strip-emotional-history-snippets.ts, which covers emotional_history.
 *
 * Dry run by default (scripts/destructive-gate.ts). It prints counts only: no
 * user ids, no document ids, no contents.
 *
 *   npx tsx scripts/migrations/strip-emotional-data-snippets.ts
 *   npx tsx scripts/migrations/strip-emotional-data-snippets.ts --apply --confirm-project=johnb-2025
 *
 * Writes go one transaction per page of points: each point is read again inside
 * it, so a point changed mid-run is planned from what it holds now. Re-running
 * is safe: points already clean are not written.
 *
 * FIRESTORE_DATABASE picks the database (default "(default)"), e.g. ferni-dev.
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { planDataPoint } from '../../src/personality/emotional-data-shape.js';

export const COLLECTION = 'emotional_data';
export const SUBCOLLECTION = 'points';
const PAGE = 200;

interface PointDoc {
  ref: unknown;
  data(): unknown;
}
interface PointQuery {
  orderBy(field: string): PointQuery;
  startAfter(doc: PointDoc): PointQuery;
  limit(n: number): PointQuery;
  get(): Promise<{ docs: PointDoc[] }>;
}
/** The slice of Firestore the cleanup uses, so a test can hand it a fake. */
export interface PointsDb {
  collection(name: string): {
    listDocuments(): Promise<Array<{ collection(name: string): PointQuery }>>;
  };
  runTransaction<T>(
    fn: (tx: {
      get(ref: unknown): Promise<{ exists: boolean; data(): unknown }>;
      set(ref: unknown, data: Record<string, unknown>): unknown;
      delete(ref: unknown): unknown;
    }) => Promise<T>
  ): Promise<T>;
}

export interface StripCounts {
  people: number;
  scanned: number;
  /** Points that keep their label but lose other fields */
  toRewrite: number;
  /** Points with no valid label, intensity or time */
  toDelete: number;
  rewritten: number;
  deleted: number;
}

export async function strip(db: PointsDb, apply: boolean, page = PAGE): Promise<StripCounts> {
  const c: StripCounts = {
    people: 0,
    scanned: 0,
    toRewrite: 0,
    toDelete: 0,
    rewritten: 0,
    deleted: 0,
  };
  for (const person of await db.collection(COLLECTION).listDocuments()) {
    c.people++;
    let last: PointDoc | undefined;
    for (;;) {
      const base = person.collection(SUBCOLLECTION).orderBy('__name__');
      const docs = (await (last ? base.startAfter(last) : base).limit(page).get()).docs;
      if (docs.length === 0) break;
      const changing: unknown[] = [];
      for (const doc of docs) {
        c.scanned++;
        const plan = planDataPoint(doc.data());
        if (plan.action === 'keep') continue;
        c[plan.action === 'delete' ? 'toDelete' : 'toRewrite']++;
        changing.push(doc.ref);
      }
      if (apply && changing.length > 0) {
        const done = await db.runTransaction(async (tx) => {
          const snaps = await Promise.all(
            changing.map(async (ref) => [ref, await tx.get(ref)] as const)
          );
          const n = { rewritten: 0, deleted: 0 };
          for (const [ref, snap] of snaps) {
            if (!snap.exists) continue;
            const plan = planDataPoint(snap.data());
            if (plan.action === 'rewrite') {
              tx.set(ref, { ...plan.point });
              n.rewritten++;
            } else if (plan.action === 'delete') {
              tx.delete(ref);
              n.deleted++;
            }
          }
          return n;
        });
        c.rewritten += done.rewritten;
        c.deleted += done.deleted;
      }
      if (docs.length < page) break;
      last = docs[docs.length - 1];
    }
  }
  return c;
}

export async function main(argv: readonly string[] = process.argv, db?: PointsDb): Promise<void> {
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
    db = new Firestore({ projectId, databaseId }) as unknown as PointsDb;
  }
  const c = await strip(db, mode === 'execute');
  const where = `${COLLECTION}/*/${SUBCOLLECTION} on ${projectId}/${databaseId}`;
  console.log(`${where}: scanned ${c.scanned} points for ${c.people} people`);
  if (mode === 'execute') {
    console.log(`Rewrote ${c.rewritten} points, deleted ${c.deleted}`);
  } else {
    console.log(`DRY RUN: would rewrite ${c.toRewrite} points and delete ${c.toDelete}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Name and code only: a Firestore error can name a document (a user id)
    const { name, code } = err as { name?: string; code?: unknown };
    console.error('strip-emotional-data-snippets failed:', name, code ?? '');
    process.exit(1);
  });
}
