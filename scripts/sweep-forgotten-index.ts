#!/usr/bin/env tsx
/**
 * One-time sweep: find (and with --apply, remove) index copies of facts the
 * caller asked to forget. forget.ts now removes a fact's copy when it marks
 * it, but copies made before that change stayed in the `vectors` collection
 * (the index behind recallFromMemory), and the session-end re-index only
 * reaches the newest 100 facts.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/sweep-forgotten-index.ts           # read-only: counts
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/sweep-forgotten-index.ts --apply   # deletes
 *
 * Prints counts only, never memory content or user ids.
 */
import { pathToFileURL } from 'node:url';
import { getFirestoreDb } from '../src/utils/firestore-utils.js';

/**
 * The dynamic fact a vector copies, from its id and owner: "conversation_fact_<docId>"
 * (user-memory index) or "fact_fact_<userId>_<docId>" (graph sync's index).
 */
export function factOf(
  vectorId: string,
  owner: string | undefined
): { userId: string; docId: string } | null {
  if (!owner) return null;
  const a = /^conversation_fact_(.+)$/.exec(vectorId);
  if (a?.[1]) return { userId: owner, docId: a[1] };
  const prefix = `fact_fact_${owner}_`;
  if (vectorId.startsWith(prefix)) return { userId: owner, docId: vectorId.slice(prefix.length) };
  return null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  let scanned = 0;
  let factCopies = 0;
  let forgottenCopies = 0;
  let orphanCopies = 0;
  let removed = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection('vectors').select('metadata.userId').orderBy('__name__').limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const copies = snap.docs.flatMap((v) => {
      const f = factOf(v.id, v.get('metadata.userId') as string | undefined);
      return f ? [{ v, f }] : [];
    });
    scanned += snap.size;
    factCopies += copies.length;
    if (copies.length > 0) {
      const facts = await db.getAll(
        ...copies.map(({ f }) =>
          db.collection('bogle_users').doc(f.userId).collection('dynamic_facts').doc(f.docId)
        )
      );
      for (const [i, fact] of facts.entries()) {
        const gone = !fact.exists;
        const forgotten = fact.exists && fact.get('forgottenAt') != null;
        if (forgotten) forgottenCopies++;
        if (gone) orphanCopies++;
        if (apply && (forgotten || gone)) {
          await copies[i]!.v.ref.delete();
          removed++;
        }
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }
  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'read-only',
      vectorsScanned: scanned,
      factCopies,
      forgottenCopies,
      orphanCopies,
      removed,
    })
  );
}

// Run only when invoked as a script (tests import factOf).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
