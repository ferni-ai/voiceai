/**
 * Delete the synthetic users voice-eval runs leave in Firestore, through the
 * same erasure a real account deletion uses (deleteAllData: the user record
 * with every subcollection, plus the other stores), so they stop skewing user
 * counts, analytics and outreach.
 *
 * Dry run by default: lists what would go and why the rest stays.
 *
 *   npx tsx scripts/voice-eval/cleanup-users.ts --project johnb-2025
 *   npx tsx scripts/voice-eval/cleanup-users.ts --project johnb-2025 --include-legacy
 *   npx tsx scripts/voice-eval/cleanup-users.ts --project johnb-2025 --include-legacy \
 *     --execute --confirm <count printed by the dry run>
 *
 * --min-age-hours N   generated users younger than this stay (default 24: a run may be live)
 * --include-legacy    also fixed ids from older runs (voice-eval-v12-story-1, …)
 * --keep a,b          extra ids to keep; voice-eval-sam is always kept
 *
 * --confirm must equal the number selected, so a changed selection (a new run,
 * a different project) cannot be deleted by an old command.
 */

import { ALWAYS_KEEP, EVAL_PREFIX, selectEvalUsers } from './eval-users.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const project = arg('--project');
const execute = process.argv.includes('--execute');
const confirm = arg('--confirm');
const includeLegacy = process.argv.includes('--include-legacy');
const minAgeHours = Number(arg('--min-age-hours') ?? 24);
const keep = (arg('--keep') ?? '').split(',').filter(Boolean);

if (!project) {
  console.error('--project is required (the Firestore project holding bogle_users)');
  process.exit(2);
}
if (!Number.isFinite(minAgeHours) || minAgeHours < 1) {
  console.error('--min-age-hours must be at least 1');
  process.exit(2);
}

// Point every Firebase client the erasure uses at this project before importing it.
process.env.GOOGLE_CLOUD_PROJECT = project;
process.env.GCLOUD_PROJECT = project;
process.env.FIREBASE_PROJECT_ID = project;

const { Firestore } = await import('@google-cloud/firestore');
const db = new Firestore({ projectId: project });
const refs = await db.collection('bogle_users').listDocuments();
const ids = refs.map((r) => r.id).filter((id) => id.startsWith(EVAL_PREFIX));
const selection = selectEvalUsers(ids, {
  now: new Date(),
  minAgeMs: minAgeHours * 3_600_000,
  includeLegacy,
  keep,
});
const targets = [...selection.generated, ...selection.legacy];

const target = process.env.FIRESTORE_EMULATOR_HOST
  ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}`
  : 'LIVE';
console.log(`project ${project} (${target}): ${refs.length} user records, ${ids.length} voice-eval`);
console.log(`  delete: ${selection.generated.length} generated, ${selection.legacy.length} legacy`);
const reasons = new Map<string, number>();
for (const k of selection.kept) reasons.set(k.reason, (reasons.get(k.reason) ?? 0) + 1);
console.log(`  keep:   ${[...reasons].map(([r, n]) => `${n} ${r}`).join(', ') || 'none'}`);
console.log(`  always kept: ${[...ALWAYS_KEEP].join(', ')}`);
for (const id of targets.slice(0, 10)) console.log(`    - ${id}`);
if (targets.length > 10) console.log(`    … and ${targets.length - 10} more`);

if (!execute) {
  const flags = [includeLegacy ? '--include-legacy' : '', `--min-age-hours ${minAgeHours}`]
    .filter(Boolean)
    .join(' ');
  console.log(`\nDry run. To delete these ${targets.length}:`);
  console.log(
    `  npx tsx scripts/voice-eval/cleanup-users.ts --project ${project} ${flags} --execute --confirm ${targets.length}`
  );
  process.exit(0);
}

if (confirm !== String(targets.length)) {
  console.error(`--confirm ${confirm ?? '(missing)'} does not match the ${targets.length} selected now`);
  process.exit(2);
}

const { getDataExportService } = await import('../../src/services/data-export.js');
const failures: string[] = [];
for (const [i, uid] of targets.entries()) {
  try {
    await getDataExportService().deleteAllData(uid);
    console.log(`  [${i + 1}/${targets.length}] erased ${uid}`);
  } catch (error) {
    failures.push(uid);
    console.error(`  [${i + 1}/${targets.length}] FAILED ${uid}: ${String(error)}`);
  }
}
console.log(`\nErased ${targets.length - failures.length} of ${targets.length}.`);
process.exit(failures.length === 0 ? 0 : 1);
