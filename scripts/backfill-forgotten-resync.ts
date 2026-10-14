#!/usr/bin/env tsx
/**
 * One-time backfill: facts forgotten before the graph sync learned to remove
 * forgotten copies (#1108) can still say syncedToSpanner: true, so the sync
 * never revisits them and any graph copy stays. This finds dynamic facts that
 * are forgotten AND marked synced, and with --apply resets syncedToSpanner to
 * false so the next sync removes their copies.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/backfill-forgotten-resync.ts          # dry run: counts
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/backfill-forgotten-resync.ts --apply  # writes (asks for the project id)
 *
 * Counts only: no content, no user ids.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { getFirestoreDb } from '../src/utils/firestore-utils.js';

/** A fact whose graph copy (if any) must be revisited. */
export function needsResync(data: Record<string, unknown>): boolean {
  return (
    data.forgottenAt !== undefined && data.forgottenAt !== null && data.syncedToSpanner === true
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '(unset)';
  console.log(`Project: ${project}  mode: ${apply ? 'apply' : 'dry run'}`);
  if (apply) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const typed = await rl.question(
      `This WRITES to dynamic_facts in "${project}". Type the project id to continue: `
    );
    rl.close();
    if (typed.trim() !== project) {
      console.log('Not confirmed: nothing written.');
      return;
    }
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  let scanned = 0;
  let found = 0;
  let reset = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const now = new Date().toISOString();
  for (;;) {
    // Same index the sync's own query uses (extractedAt, syncedToSpanner).
    let q = db
      .collectionGroup('dynamic_facts')
      .where('extractedAt', '<', now)
      .where('syncedToSpanner', '==', true)
      .orderBy('extractedAt', 'asc')
      .limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;
    for (const doc of snap.docs) {
      if (!needsResync(doc.data())) continue;
      found++;
      if (apply) {
        await doc.ref.update({ syncedToSpanner: false });
        reset++;
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }
  console.log(JSON.stringify({ syncedFactsScanned: scanned, forgottenButSynced: found, reset }));
}

// Run only when invoked as a script (tests import needsResync).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
