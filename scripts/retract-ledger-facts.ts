/**
 * Retract stored life-ledger facts that aren't Ferni's life.
 *
 * FERNI_SELF_MEMORY checks facts when they are saved; this applies the same
 * checks to facts saved before it (jokes, the caller's own people and pets,
 * what his biography rules out). See agents/personas/ledger-retraction.ts.
 *
 * REPORT-ONLY by default: prints what it would retract and writes nothing.
 * --apply marks each one `retracted: true` (with the reason and time); the
 * ledger never recalls a retracted fact. Nothing is deleted, so a mistaken
 * retraction is undone by clearing the field.
 *
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/retract-ledger-facts.ts
 *   ... --user <uid>          only this caller
 *   ... --json out.json       also write the report as JSON
 *   ... --apply               write the retractions (after reviewing a report)
 */

import { writeFileSync } from 'node:fs';
import { getFirestoreDb } from '../src/utils/firestore-utils.js';
import { biographyCore, firestoreCallerNames } from '../src/agents/personas/life-ledger.js';
import { planRetractions, type Retraction } from '../src/agents/personas/ledger-retraction.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes('--apply');
const ONLY_USER = flag('--user');
const JSON_OUT = flag('--json');

async function main(): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not configured (GOOGLE_CLOUD_PROJECT, ADC)');
  const snap = ONLY_USER
    ? await db.collection('bogle_users').doc(ONLY_USER).collection('persona_told').get()
    : await db.collectionGroup('persona_told').get();

  const byUser = new Map<string, Array<{ id: string; fact: string; ref: FirebaseFirestore.DocumentReference }>>();
  for (const doc of snap.docs) {
    const d = doc.data() as { personaId?: string; fact?: string; retracted?: boolean };
    if (d.personaId !== 'ferni' || !d.fact || d.retracted === true) continue;
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    const list = byUser.get(uid) ?? [];
    list.push({ id: doc.id, fact: d.fact, ref: doc.ref });
    byUser.set(uid, list);
  }

  const biography = await biographyCore('ferni');
  if (!biography) throw new Error('biography-core.md not found; run from the repo root');
  const report: Array<Retraction & { userId: string }> = [];
  let total = 0;
  for (const [userId, facts] of byUser) {
    total += facts.length;
    const names = await firestoreCallerNames(userId);
    for (const r of await planRetractions(facts, names, biography)) report.push({ ...r, userId });
  }

  const counts = report.reduce<Record<string, number>>((c, r) => ({ ...c, [r.reason]: (c[r.reason] ?? 0) + 1 }), {});
  process.stdout.write(`${total} stored facts, ${byUser.size} callers; would retract ${report.length}: ${JSON.stringify(counts)}\n`);
  for (const r of report) process.stdout.write(`  [${r.reason}] ${r.userId}  ${r.fact}\n`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));

  if (!APPLY) {
    process.stdout.write('Report only. Re-run with --apply to mark these retracted.\n');
    return;
  }
  const refs = new Map(
    [...byUser].flatMap(([uid, facts]) => facts.map((f) => [`${uid}/${f.id}`, f.ref] as const))
  );
  const retractedAt = new Date().toISOString();
  for (let i = 0; i < report.length; i += 400) {
    const batch = db.batch();
    for (const r of report.slice(i, i + 400)) {
      const ref = refs.get(`${r.userId}/${r.id}`);
      if (ref) batch.update(ref, { retracted: true, retractedReason: r.reason, retractedAt });
    }
    await batch.commit();
  }
  process.stdout.write(`Retracted ${report.length} facts.\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`retract-ledger-facts failed: ${String(error)}\n`);
    process.exit(1);
  }
);
