#!/usr/bin/env tsx
/**
 * One-time sweep of index copies (the `vectors` collection, read by the
 * recallFromMemory tool and per-turn memory search) of facts the caller
 * asked to forget, and of facts that no longer exist.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/sweep-forgotten-index.ts                 # read-only counts
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/sweep-forgotten-index.ts --apply         # delete copies of FORGOTTEN facts
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/sweep-forgotten-index.ts --apply-orphans # also delete copies whose fact is gone
 *
 * Any delete asks you to type the project id to confirm. A copy counts as an
 * orphan only when its source collection is known (conversation_fact_<id>
 * is the user-memory index of dynamic_facts) and that doc is missing. Graph
 * copies (fact_fact_<uid>_<id>) come from dynamic_facts (the sync) or from
 * `memories` topics (unified store: "<memoryId>_<topic>"), so a missing
 * dynamic_facts doc there is "unknown", never deleted. Counts only: no
 * content, no user ids.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { getFirestoreDb } from '../src/utils/firestore-utils.js';

export type CopyKind = 'conversation_fact' | 'graph_fact' | 'other';

/** The dynamic fact a vector may copy, from its id and owner, and how sure that is. */
export function factOf(
  vectorId: string,
  owner: string | undefined
): { kind: CopyKind; userId: string; docId: string } | null {
  if (!owner) return null;
  const a = /^conversation_fact_(.+)$/.exec(vectorId);
  if (a?.[1]) return { kind: 'conversation_fact', userId: owner, docId: a[1] };
  const prefix = `fact_fact_${owner}_`;
  if (vectorId.startsWith(prefix)) {
    return { kind: 'graph_fact', userId: owner, docId: vectorId.slice(prefix.length) };
  }
  return null;
}

/**
 * What to do with one copy: delete it only for the mode that covers it.
 * A graph copy whose dynamic_facts doc is missing is "unknown" (it may come
 * from `memories`), never an orphan.
 */
export function verdict(
  kind: CopyKind,
  fact: { exists: boolean; forgotten: boolean }
): 'forgotten' | 'orphan' | 'unknown' | 'live' {
  if (fact.exists) return fact.forgotten ? 'forgotten' : 'live';
  return kind === 'conversation_fact' ? 'orphan' : 'unknown';
}

async function confirm(project: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(
    `This DELETES index documents in project "${project}". Type the project id to continue: `
  );
  rl.close();
  return typed.trim() === project;
}

async function main(): Promise<void> {
  const applyForgotten =
    process.argv.includes('--apply') || process.argv.includes('--apply-orphans');
  const applyOrphans = process.argv.includes('--apply-orphans');
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '(unset)';
  console.log(
    `Project: ${project}  mode: ${applyOrphans ? 'apply forgotten + orphans' : applyForgotten ? 'apply forgotten' : 'read-only'}`
  );
  if (applyForgotten && !(await confirm(project))) {
    console.log('Not confirmed: nothing deleted.');
    return;
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let scanned = 0;
  let removed = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection('vectors').select('metadata.userId').orderBy('__name__').limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;
    const copies = snap.docs.flatMap((v) => {
      const f = factOf(v.id, v.get('metadata.userId') as string | undefined);
      if (!f) bump(v.id.startsWith('fact_') ? 'other:fact_*' : 'other');
      return f ? [{ v, f }] : [];
    });
    if (copies.length > 0) {
      const facts = await db.getAll(
        ...copies.map(({ f }) =>
          db.collection('bogle_users').doc(f.userId).collection('dynamic_facts').doc(f.docId)
        )
      );
      for (const [i, fact] of facts.entries()) {
        const { v, f } = copies[i]!;
        const v2 = verdict(f.kind, {
          exists: fact.exists,
          forgotten: fact.exists && fact.get('forgottenAt') != null,
        });
        bump(`${f.kind}:${v2}`);
        if ((v2 === 'forgotten' && applyForgotten) || (v2 === 'orphan' && applyOrphans)) {
          await v.ref.delete();
          removed++;
        }
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }
  console.log(JSON.stringify({ vectorsScanned: scanned, removed, byKind: counts }));
}

// Run only when invoked as a script (tests import the helpers).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
