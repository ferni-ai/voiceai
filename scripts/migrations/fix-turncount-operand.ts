#!/usr/bin/env tsx
/**
 * One-time repair: conversations whose turnCount is not a number.
 *
 * An old write ran FieldValue.increment(1) through cleanForFirestore, which then
 * rebuilt the sentinel as a plain object, so 427 conversations store turnCount as
 * `{ operand: 1 }` (prod audit 2026-10-18). The writer keeps sentinels now; the
 * reader treats a non-number as 0. This sets each such turnCount to the number of
 * documents in the conversation's own `turns` subcollection.
 *
 *   GOOGLE_CLOUD_PROJECT=<id> pnpm tsx scripts/migrations/fix-turncount-operand.ts
 *       dry run: counts only
 *   GOOGLE_CLOUD_PROJECT=<id> pnpm tsx scripts/migrations/fix-turncount-operand.ts --apply --confirm-project=<id>
 *       writes turnCount
 *
 * Counts only: no user ids, conversation ids or content are printed.
 */
import { pathToFileURL } from 'node:url';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';

/** A stored turnCount that needs repair: anything but a finite number. */
export const needsRepair = (turnCount: unknown): boolean =>
  !(typeof turnCount === 'number' && Number.isFinite(turnCount));

/** 'apply' only with --apply AND --confirm-project naming the project; else a dry run. */
export function runMode(argv: readonly string[], project: string): 'dry-run' | 'apply' | 'refused' {
  if (!argv.includes('--apply')) return 'dry-run';
  const confirm = argv.find((a) => a.startsWith('--confirm-project='))?.split('=')[1];
  return confirm && confirm === project ? 'apply' : 'refused';
}

export interface TurnCountReport {
  scanned: number;
  broken: number;
  repaired: number;
  /** Turns counted across the broken conversations (what turnCount becomes). */
  turnsCounted: number;
}

export async function repairTurnCounts(
  db: FirebaseFirestore.Firestore,
  apply: boolean
): Promise<TurnCountReport> {
  const report: TurnCountReport = { scanned: 0, broken: 0, repaired: 0, turnsCounted: 0 };
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collectionGroup('conversations').select('turnCount').limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      report.scanned++;
      if (!needsRepair(doc.get('turnCount'))) continue;
      report.broken++;
      const turns = (await doc.ref.collection('turns').count().get()).data().count;
      report.turnsCounted += turns;
      if (apply) {
        await doc.ref.update({ turnCount: turns });
        report.repaired++;
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }
  return report;
}

async function main(): Promise<void> {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '';
  const mode = runMode(process.argv, project);
  console.log(`Project: ${project || '(unset)'}  mode: ${mode}`);
  if (mode === 'refused') {
    console.log(
      `Not written: --apply needs --confirm-project=${project || '<GOOGLE_CLOUD_PROJECT>'}`
    );
    process.exitCode = 1;
    return;
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  console.log(JSON.stringify(await repairTurnCounts(db, mode === 'apply')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
