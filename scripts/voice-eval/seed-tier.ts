/**
 * Give one voice-eval user a subscription tier before its call (run.sh EVAL_TIER).
 *
 *   npx tsx scripts/voice-eval/seed-tier.ts --project johnb-2025 --uid voice-eval-x --tier partner
 *     [--database ferni-dev]   (default '(default)'; run.sh passes eval-database.mjs's pick)
 *
 * Writes a whole valid profile (createUserProfile) when the user has none, so the
 * agent loads it instead of replacing it with a new free one. Refuses any uid that
 * isn't voice-eval-* (eval-tier.ts).
 */
import { seedTierRefusal } from './eval-tier.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const project = arg('--project');
const uid = arg('--uid') ?? '';
const tier = arg('--tier') ?? '';
const database = arg('--database') ?? '(default)';
const refusal = project ? seedTierRefusal(uid, tier) : '--project is required';
if (refusal) {
  console.error(`seed-tier: ${refusal}`);
  process.exit(2);
}

const { Firestore } = await import('@google-cloud/firestore');
const { createUserProfile } = await import('../../src/types/user-profile.js');
const { createDefaultSubscription } = await import('../../src/types/subscription.js');

const ref = new Firestore({ projectId: project, databaseId: database })
  .collection('bogle_users')
  .doc(uid);
const existing = await ref.get();
const base = existing.exists ? {} : createUserProfile(uid, 'Sam');
const subscription = { ...createDefaultSubscription(), tier };
// Dates as ISO strings, as FirestoreStore stores them
const doc = JSON.parse(JSON.stringify({ ...base, subscription }));
await ref.set(doc, { merge: true });
console.error(
  `seed-tier: ${uid} is ${tier} on ${project}/${database}${existing.exists ? '' : ' (new profile)'}`
);
