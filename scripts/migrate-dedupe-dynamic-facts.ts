#!/usr/bin/env npx tsx

/**
 * Collapse duplicate dynamic facts and entities onto deterministic ids.
 *
 * Before deterministic ids, deep extraction wrote every fact with a random id,
 * so a fact learned in five conversations exists five times. This one-off
 * migration groups each user's bogle_users/{uid}/dynamic_facts (and
 * dynamic_entities) by the id fact-identity.ts gives them, writes one merged
 * document per group (provenance unioned, user edits preserved) and deletes
 * the rest. Facts whose id has a tombstone (the user deleted them) are removed.
 *
 * Idempotent: on migrated data it plans nothing. Dry run unless --apply.
 * Not run automatically; run it by hand after the extraction change deploys.
 *
 * Usage:
 *   npx tsx scripts/migrate-dedupe-dynamic-facts.ts                 # dry run, all users
 *   npx tsx scripts/migrate-dedupe-dynamic-facts.ts --user <uid>    # one user
 *   npx tsx scripts/migrate-dedupe-dynamic-facts.ts --apply         # write changes
 *   npx tsx scripts/migrate-dedupe-dynamic-facts.ts --limit 100     # first N users
 *
 * @module scripts/migrate-dedupe-dynamic-facts
 */

import { Firestore, type DocumentReference, type WriteBatch } from '@google-cloud/firestore';
import {
  planEntityMigration,
  planFactMigration,
  type MigrationPlan,
  type SourceDoc,
} from '../src/memory/dynamic/fact-migration.js';
import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'MigrateDedupeFacts' });
const BATCH_OPS = 400;

interface Options {
  apply: boolean;
  userId?: string;
  limit?: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--user') opts.userId = argv[++i];
    else if (argv[i] === '--limit') opts.limit = Number(argv[++i]);
  }
  return opts;
}

async function readDocs(ref: DocumentReference, collection: string): Promise<SourceDoc[]> {
  const snap = await ref.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function applyPlan(
  db: Firestore,
  ref: DocumentReference,
  collection: string,
  plan: MigrationPlan
): Promise<void> {
  const ops: Array<(b: WriteBatch) => void> = [
    ...plan.writes.map(
      (w) => (b: WriteBatch) => b.set(ref.collection(collection).doc(w.id), w.data)
    ),
    ...plan.deletes.map((id) => (b: WriteBatch) => b.delete(ref.collection(collection).doc(id))),
  ];
  // Writes come before deletes, so an interrupted run never loses a fact.
  for (let i = 0; i < ops.length; i += BATCH_OPS) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_OPS)) op(batch);
    await batch.commit();
  }
}

async function migrateUser(db: Firestore, userId: string, apply: boolean) {
  const ref = db.collection('bogle_users').doc(userId);
  const tombstones = new Set(
    (await ref.collection('memory_tombstones').select().get()).docs.map((d) => d.id)
  );
  const facts = planFactMigration(await readDocs(ref, 'dynamic_facts'), tombstones);
  const entities = planEntityMigration(await readDocs(ref, 'dynamic_entities'), tombstones);
  if (apply) {
    await applyPlan(db, ref, 'dynamic_facts', facts);
    await applyPlan(db, ref, 'dynamic_entities', entities);
  }
  return { facts, entities };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const db = new Firestore();
  const userIds = opts.userId
    ? [opts.userId]
    : (
        await db
          .collection('bogle_users')
          .select()
          .limit(opts.limit ?? 100_000)
          .get()
      ).docs.map((d) => d.id);

  const totals = {
    users: 0,
    factWrites: 0,
    factDeletes: 0,
    factGroups: 0,
    entityWrites: 0,
    entityDeletes: 0,
    tombstoned: 0,
  };
  for (const uid of userIds) {
    try {
      const { facts, entities } = await migrateUser(db, uid, opts.apply);
      if (
        facts.writes.length +
          facts.deletes.length +
          entities.writes.length +
          entities.deletes.length ===
        0
      )
        continue;
      totals.users++;
      totals.factWrites += facts.writes.length;
      totals.factDeletes += facts.deletes.length;
      totals.factGroups += facts.merged;
      totals.entityWrites += entities.writes.length;
      totals.entityDeletes += entities.deletes.length;
      totals.tombstoned += facts.tombstoned + entities.tombstoned;
      log.info(
        {
          userId: uid,
          facts: { write: facts.writes.length, delete: facts.deletes.length, merged: facts.merged },
          entities: { write: entities.writes.length, delete: entities.deletes.length },
        },
        opts.apply ? 'Migrated user' : 'Would migrate user (dry run)'
      );
    } catch (error) {
      log.error({ userId: uid, error: String(error) }, 'User migration failed; continuing');
    }
  }
  log.info(
    { ...totals, apply: opts.apply },
    opts.apply ? 'Migration complete' : 'Dry run complete (pass --apply to write)'
  );
}

main().catch((error: unknown) => {
  log.error({ error: String(error) }, 'Migration aborted');
  process.exitCode = 1;
});
