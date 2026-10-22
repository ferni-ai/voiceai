/**
 * Purge the pending intelligence_queue documents nothing will ever read.
 *
 * The voice agent queued intelligence events to Firestore whenever Pub/Sub was
 * off (the default), but the worker that drains intelligence_queue has no
 * service, so about 31K documents sat at status "pending" (2026-10-18 audit).
 * Publishing is now off unless INTELLIGENCE_QUEUE=on, and new documents carry
 * an expireAt for a TTL policy; this removes the backlog.
 *
 * Dry run by default (scripts/destructive-gate.ts): counts only, by event type.
 *
 *   npx tsx scripts/migrations/purge-intelligence-queue.ts
 *   npx tsx scripts/migrations/purge-intelligence-queue.ts --execute --confirm-project=johnb-2025
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';

const PAGE = 400;
/** A query that keeps returning deleted documents must not loop forever (400K docs). */
const MAX_PAGES = 1_000;

interface Doc {
  ref: unknown;
  get(field: string): unknown;
}
interface Query {
  where(field: string, op: '==', value: string): Query;
  select(...fields: string[]): Query;
  limit(n: number): Query;
  startAfter(doc: Doc): Query;
  get(): Promise<{ docs: Doc[] }>;
}
/** The slice of Firestore the purge uses, so a test can hand it a fake. */
export interface QueueDb {
  collection(name: string): Query;
  batch(): { delete(ref: unknown): unknown; commit(): Promise<unknown> };
}

/** Pending documents by event type; deletes each page when `apply` is set. */
export async function purgePending(db: QueueDb, apply: boolean): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const pending = () =>
    db.collection('intelligence_queue').where('status', '==', 'pending').select('type');
  let last: Doc | undefined;
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    // Deleting a page moves the next one to the front, so only a dry run pages on.
    const page = (await (last && !apply ? pending().startAfter(last) : pending()).limit(PAGE).get())
      .docs;
    if (page.length === 0) break;
    for (const doc of page) {
      const type = String(doc.get('type') ?? 'unknown');
      counts[type] = (counts[type] ?? 0) + 1;
    }
    if (apply) {
      const batch = db.batch();
      for (const doc of page) batch.delete(doc.ref);
      await batch.commit();
    }
    if (page.length < PAGE) break;
    last = page[page.length - 1];
  }
  return counts;
}

export async function main(argv: readonly string[] = process.argv, db?: QueueDb): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') {
    console.error(refusalMessage(projectId));
    process.exitCode = 1;
    return;
  }
  if (!db) {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({ projectId }) as unknown as QueueDb;
  }
  const counts = await purgePending(db, mode === 'execute');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const verb = mode === 'execute' ? 'Deleted' : 'DRY RUN: would delete';
  console.log(`${verb} ${total} pending intelligence_queue documents on ${projectId}:`);
  for (const [type, n] of Object.entries(counts).sort()) console.log(`  ${type.padEnd(28)} ${n}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('purge-intelligence-queue failed:', err);
    process.exit(1);
  });
}
