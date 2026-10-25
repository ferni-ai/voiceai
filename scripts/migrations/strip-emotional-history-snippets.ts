/**
 * Strip the caller's words from old emotional_history documents.
 *
 * Each document is { userId, dataPoints, lastUpdated }. Older data points carry
 * `context`, up to 100 characters of what the caller said. #2754 stopped new
 * points storing it and the loader now drops it, but a document is only
 * rewritten when its user next records an emotion, so the rest keep it. This
 * rewrites `dataPoints` keeping only the emotion label, intensity, valence,
 * source and timestamp (emotional-history-shape.ts); every other key, nested
 * ones included, goes. Nothing else in the document is touched.
 *
 * Dry run by default (scripts/destructive-gate.ts). It prints counts only: no
 * document ids, no contents.
 *
 *   npx tsx scripts/migrations/strip-emotional-history-snippets.ts
 *   npx tsx scripts/migrations/strip-emotional-history-snippets.ts --apply --confirm-project=johnb-2025
 *
 * Writes go in batches, one per page of documents. Each write is conditional on
 * the document not having changed since it was read, so a point the live app
 * adds mid-run is never lost; a batch refused for that is counted, and a re-run
 * picks it up. Re-running is safe: documents already clean are not written.
 *
 * FIRESTORE_DATABASE picks the database (default "(default)"), e.g. ferni-dev.
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { stripDataPoints } from '../../src/tools/semantic-router/advanced/emotional-history-shape.js';

export const COLLECTION = 'emotional_history';
const PAGE = 300;
/** gRPC FAILED_PRECONDITION: a document changed after it was read. */
const FAILED_PRECONDITION = 9;

interface Doc {
  ref: unknown;
  updateTime?: unknown;
  get(field: string): unknown;
}
interface Query {
  orderBy(field: string): Query;
  select(...fields: string[]): Query;
  limit(n: number): Query;
  startAfter(doc: Doc): Query;
  get(): Promise<{ docs: Doc[] }>;
}
/** The slice of Firestore the cleanup uses, so a test can hand it a fake. */
export interface HistoryDb {
  collection(name: string): Query;
  batch(): {
    update(
      ref: unknown,
      data: { dataPoints: unknown[] },
      precondition: { lastUpdateTime: unknown }
    ): unknown;
    commit(): Promise<unknown>;
  };
}

export interface StripCounts {
  scanned: number;
  /** Documents with at least one data point carrying another key */
  toChange: number;
  /** Data points that lose a key */
  pointsStripped: number;
  written: number;
  /** Documents in batches refused because one changed during the run */
  changedDuringRun: number;
}

export async function strip(db: HistoryDb, apply: boolean, page = PAGE): Promise<StripCounts> {
  const c: StripCounts = {
    scanned: 0,
    toChange: 0,
    pointsStripped: 0,
    written: 0,
    changedDuringRun: 0,
  };
  let last: Doc | undefined;
  for (;;) {
    const base = db.collection(COLLECTION).orderBy('__name__').select('dataPoints');
    const docs = (await (last ? base.startAfter(last) : base).limit(page).get()).docs;
    if (docs.length === 0) break;
    const batch = db.batch();
    let writes = 0;
    for (const doc of docs) {
      c.scanned++;
      const stored = doc.get('dataPoints');
      if (!Array.isArray(stored)) continue;
      const { points, stripped } = stripDataPoints(stored);
      if (stripped === 0) continue;
      c.toChange++;
      c.pointsStripped += stripped;
      if (apply) {
        batch.update(doc.ref, { dataPoints: points }, { lastUpdateTime: doc.updateTime });
        writes++;
      }
    }
    if (writes > 0) {
      try {
        await batch.commit();
        c.written += writes;
      } catch (err) {
        if ((err as { code?: unknown }).code !== FAILED_PRECONDITION) throw err;
        c.changedDuringRun += writes;
      }
    }
    if (docs.length < page) break;
    last = docs[docs.length - 1];
  }
  return c;
}

export async function main(argv: readonly string[] = process.argv, db?: HistoryDb): Promise<void> {
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
    db = new Firestore({ projectId, databaseId }) as unknown as HistoryDb;
  }
  const c = await strip(db, mode === 'execute');
  console.log(`${COLLECTION} on ${projectId}/${databaseId}: scanned ${c.scanned} documents`);
  if (mode === 'execute') {
    console.log(`Stripped ${c.written} documents (${c.pointsStripped} data points)`);
    if (c.changedDuringRun > 0) {
      console.log(
        `${c.changedDuringRun} changed during the run and were left; run again to finish`
      );
    }
  } else {
    console.log(`DRY RUN: would strip ${c.toChange} documents (${c.pointsStripped} data points)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Name and code only: a Firestore error can name a document (a user id)
    const { name, code } = err as { name?: string; code?: unknown };
    console.error('strip-emotional-history-snippets failed:', name, code ?? '');
    process.exit(1);
  });
}
