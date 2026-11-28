#!/usr/bin/env tsx
/**
 * Finds, and through the destructive gate deletes, the bogle_users records a try-first visitor
 * should never have had (#4293): a `device:demo_…` id (isAnonymousDemoUser) whose only field is
 * `temporalPatterns`. learnTemporalPattern wrote them before LEARNING_OWNER_GATE; the visitor
 * was told nothing is kept, and every later read of the record failed the profile check.
 *
 *   npx tsx scripts/firestore/demo-learning-records.ts --database ferni-dev     # dry run
 *   npx tsx scripts/firestore/demo-learning-records.ts --database ferni-dev \
 *     --apply --confirm-project=johnb-2025                                       # delete
 *
 * --database is required ('(default)' is prod, 'ferni-dev' is dev). Deleting passes the shared
 * gate (scripts/destructive-gate.ts): --apply alone is refused, it needs --confirm-project naming
 * the project (GCLOUD_PROJECT, default johnb-2025), and --dry-run always wins. Each delete is
 * conditional on the record's update time, so a write landing after the read is never lost.
 * A record with any other field, or with a subcollection, is counted and left alone: deleting
 * the root would orphan or lose more than the stray pattern. Output is counts only, never an
 * id or a field value. Ids are read in the exact `device:demo_` range; a differently
 * cased spelling is not found.
 */
import { FieldPath, Firestore } from '@google-cloud/firestore';

import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { DEMO_DEVICE_ID_PREFIX, isAnonymousDemoUser } from '../../src/utils/synthetic-user.js';

const PREFIX = `device:${DEMO_DEVICE_ID_PREFIX}`;
const PAGE = 300;

/** A try-first visitor's record holding nothing but the stray temporal pattern. */
export function isDemoLearningOnlyRecord(id: string, data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return isAnonymousDemoUser(id) && keys.length === 1 && keys[0] === 'temporalPatterns';
}

export interface Options {
  database: string;
  apply: boolean;
}

/**
 * The options, or why the run is refused: --database is required, and deleting needs the
 * shared destructive gate's --confirm-project naming `projectId`.
 */
export function parseArgs(argv: readonly string[], projectId: string): Options | string {
  const at = argv.indexOf('--database');
  const database = at >= 0 ? argv[at + 1] : undefined;
  if (!database || database.startsWith('--')) {
    return "--database <name> is required ('(default)' is prod, 'ferni-dev' is dev)";
  }
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') return refusalMessage(projectId);
  return { database, apply: mode === 'execute' };
}

export interface Counts {
  demoRecords: number;
  matched: number;
  keptOtherFields: number;
  keptSubcollections: number;
  deleted: number;
}

export async function run(db: Firestore, apply: boolean): Promise<Counts> {
  const counts: Counts = {
    demoRecords: 0,
    matched: 0,
    keptOtherFields: 0,
    keptSubcollections: 0,
    deleted: 0,
  };
  let after: string | undefined;
  for (;;) {
    let query = db
      .collection('bogle_users')
      .orderBy(FieldPath.documentId())
      .startAt(PREFIX)
      .endAt(`${PREFIX}`)
      .limit(PAGE);
    if (after) query = query.startAfter(after);
    const page = await query.get();
    for (const doc of page.docs) {
      if (!isAnonymousDemoUser(doc.id)) continue;
      counts.demoRecords++;
      if (!isDemoLearningOnlyRecord(doc.id, doc.data())) {
        counts.keptOtherFields++;
        continue;
      }
      if ((await doc.ref.listCollections()).length > 0) {
        counts.keptSubcollections++;
        continue;
      }
      counts.matched++;
      if (apply) {
        await doc.ref.delete({ lastUpdateTime: doc.updateTime }); // unchanged since the read
        counts.deleted++;
      }
    }
    if (page.docs.length < PAGE) return counts;
    after = page.docs[page.docs.length - 1]?.id;
  }
}

async function main(): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const options = parseArgs(process.argv.slice(2), projectId);
  if (typeof options === 'string') {
    process.stderr.write(`${options}\n`);
    process.exit(2);
  }
  const db = new Firestore({ projectId, databaseId: options.database });
  const counts = await run(db, options.apply);
  const mode = options.apply ? 'APPLIED' : 'DRY RUN (add --apply --confirm-project to delete)';
  const where = `project=${projectId} database=${options.database}`;
  process.stdout.write(`${mode} ${where} ${JSON.stringify(counts)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`demo-learning-records failed: ${String(error)}\n`);
    process.exit(1);
  });
}
