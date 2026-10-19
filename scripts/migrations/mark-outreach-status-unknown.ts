#!/usr/bin/env tsx
/**
 * One-time repair: outreach attempts whose status can't be trusted.
 *
 * Before deliver-and-record.ts, the orchestrator wrote every send that didn't
 * throw as "delivered" and never wrote what it said, so all 5,612 attempts in
 * prod read "delivered" whether they reached anyone or not (audit 2026-10-18).
 * The ones with no `message` are exactly those old writes. This marks them
 * status 'unknown', keeping what was stored in `recordedStatus`.
 *
 *   GOOGLE_CLOUD_PROJECT=<id> pnpm tsx scripts/migrations/mark-outreach-status-unknown.ts
 *       dry run: counts only
 *   GOOGLE_CLOUD_PROJECT=<id> pnpm tsx scripts/migrations/mark-outreach-status-unknown.ts --apply --confirm-project=<id>
 *       writes status 'unknown'
 *
 * Counts only: no user ids, messages or phone numbers are printed.
 */
import { pathToFileURL } from 'node:url';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';

/** An attempt from before deliver-and-record: no message, and not already marked. */
export function statusUntrusted(data: Record<string, unknown>): boolean {
  const hasMessage = typeof data.message === 'string' && data.message.trim() !== '';
  return !hasMessage && data.status !== 'unknown';
}

/** 'apply' only with --apply AND --confirm-project naming the project; else a dry run. */
export function runMode(argv: readonly string[], project: string): 'dry-run' | 'apply' | 'refused' {
  if (!argv.includes('--apply')) return 'dry-run';
  const confirm = argv.find((a) => a.startsWith('--confirm-project='))?.split('=')[1];
  return confirm && confirm === project ? 'apply' : 'refused';
}

export interface UnknownStatusReport {
  scanned: number;
  untrusted: number;
  /** What the untrusted ones said, by stored status. */
  byRecordedStatus: Record<string, number>;
  marked: number;
}

export async function markUnknown(
  db: FirebaseFirestore.Firestore,
  apply: boolean
): Promise<UnknownStatusReport> {
  const report: UnknownStatusReport = { scanned: 0, untrusted: 0, byRecordedStatus: {}, marked: 0 };
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collectionGroup('outreach_attempts').select('message', 'status').limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let writes = 0;
    for (const doc of snap.docs) {
      report.scanned++;
      const data = doc.data();
      if (!statusUntrusted(data)) continue;
      report.untrusted++;
      const recorded = typeof data.status === 'string' ? data.status : '(none)';
      report.byRecordedStatus[recorded] = (report.byRecordedStatus[recorded] ?? 0) + 1;
      if (apply) {
        batch.update(doc.ref, { status: 'unknown', recordedStatus: data.status ?? null });
        writes++;
      }
    }
    if (writes > 0) {
      await batch.commit();
      report.marked += writes;
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
  console.log(JSON.stringify(await markUnknown(db, mode === 'apply')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
