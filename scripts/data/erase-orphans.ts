/**
 * Deletes data left behind by account deletions that partly failed: the keys the
 * read-only audit (orphaned-erasure-audit.ts) counts, by the same rule (findOrphans), and
 * nothing else. A separate tool, never a flag on the audit.
 *
 *   npx tsx scripts/data/erase-orphans.ts --project <gcp-project-id>
 *       dry run: prints the database, then the counts; changes nothing
 *   CONFIRM_ORPHAN_DELETE=<total> npx tsx scripts/data/erase-orphans.ts --project <id> --delete
 *       deletes, only when <total> is the orphaned-key total this run counts
 *
 * With --delete it counts, refuses unless CONFIRM_ORPHAN_DELETE equals that total, then
 * recounts and refuses unless the recount found the same keys, so it deletes only what was
 * just checked against bogle_users and Firebase Auth. A failed Auth lookup aborts the run
 * before anything is deleted: it never counts as "no user".
 *
 * Each key is erased the way account deletion erases it (erase-store.ts eraseStore): a
 * document and everything under it, including the subcollections of a parent document
 * that no longer exists (a phantom bogle_users/{uid}); the documents naming the key; or
 * only the key's entry in someone else's document. Then it counts again and prints what
 * is left.
 *
 * Prints store labels and counts only: never an id, uid, phone number or document content.
 *
 * @module scripts/data/erase-orphans
 */

import { pathToFileURL } from 'node:url';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
// No erase-user-record.ts here: it pulls in Firebase Auth, BigQuery and more at import,
// which kept the audit from exiting. erase-store.ts imports nothing at run time.
import { getFirestoreDatabase } from '../../src/config/environment.js';
import { eraseOrphanedKey } from '../../src/services/platform/erase-store.js';
import { storeLabel, type OwnedStore } from '../../src/services/platform/user-stores.js';
import { findOrphans, reportLines, type OrphanedStore } from './orphaned-erasure-audit.js';

export const CONFIRM_ENV = 'CONFIRM_ORPHAN_DELETE';

export interface EraseRun {
  lines: string[];
  /** Orphaned keys counted before anything was deleted */
  total: number;
  deleted: number;
  /** Orphaned keys a final count still finds (0 unless something failed or came back) */
  left: number;
  refused: boolean;
}

/** Every (store, key, docs) found, in a stable order: two counts match only when these do */
const fingerprint = (orphans: readonly OrphanedStore[]): string =>
  orphans
    .flatMap(({ store, keys }) =>
      keys.map(({ key, docs }) => `${storeLabel(store)} ${key} ${docs}`)
    )
    .sort()
    .join('\n');

/** Counts the orphans and, when asked and confirmed, deletes exactly them */
export async function runEraseOrphans(options: {
  db: Firestore;
  auth: Auth;
  /** Printed first, so the operator sees which database the run is on */
  database: string;
  deleteRequested: boolean;
  /** CONFIRM_ORPHAN_DELETE as given */
  confirm: string | undefined;
  stores?: readonly OwnedStore[];
  /** Runs between the confirmed count and the recount (tests change the world here) */
  beforeRecount?: () => Promise<void>;
  /** Each line as it is written, so the database shows before a run that stops */
  print?: (line: string) => void;
}): Promise<EraseRun> {
  const { db, auth, stores } = options;
  const lines: string[] = [];
  const say = (line: string): void => {
    lines.push(line);
    options.print?.(line);
  };
  say(`database: ${options.database}`);
  const counted = await findOrphans(db, auth, stores);
  const report = reportLines(counted);
  report.lines.forEach(say);
  const done = ({ line, ...more }: Partial<EraseRun> & { line: string }): EraseRun => {
    say(line);
    return { lines, total: report.total, deleted: 0, left: report.total, refused: false, ...more };
  };

  if (!options.deleteRequested) {
    return done({
      line: `dry run: nothing was changed. To delete, rerun with --delete and ${CONFIRM_ENV}=${report.total}.`,
    });
  }
  if (options.confirm !== String(report.total)) {
    return done({
      refused: true,
      line: `refused: ${CONFIRM_ENV} must equal ${report.total}, the orphaned keys just counted. Nothing was changed.`,
    });
  }

  await options.beforeRecount?.();
  const recounted = await findOrphans(db, auth, stores);
  if (fingerprint(recounted) !== fingerprint(counted)) {
    return done({
      refused: true,
      line: `refused: the orphans changed between the count and the recount (${reportLines(recounted).total} now). Nothing was changed.`,
    });
  }

  let deleted = 0;
  for (const { store, keys } of recounted) {
    for (const { key } of keys) {
      await eraseOrphanedKey(db, store, key);
      deleted += 1;
    }
  }
  const left = reportLines(await findOrphans(db, auth, stores)).total;
  return done({ deleted, left, line: `deleted ${deleted} orphaned keys; ${left} left.` });
}

function parseArgs(argv: readonly string[]): { project: string; deleteRequested: boolean } {
  let project: string | undefined;
  let deleteRequested = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') project = argv[++i];
    else if (arg?.startsWith('--project=')) project = arg.slice('--project='.length);
    else if (arg === '--delete') deleteRequested = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!project) throw new Error('--project <gcp-project-id> is required');
  return { project, deleteRequested };
}

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 2;
    return;
  }
  const app = initializeApp(
    { credential: applicationDefault(), projectId: args.project },
    'erase-orphans'
  );
  try {
    const database = getFirestoreDatabase();
    const run = await runEraseOrphans({
      db: getFirestore(app, database),
      auth: getAuth(app),
      database: `${database} (project ${args.project})`,
      deleteRequested: args.deleteRequested,
      confirm: process.env[CONFIRM_ENV],
      print: (line) => console.log(line),
    });
    if (run.refused) process.exitCode = 2;
    else if (args.deleteRequested && run.left > 0) process.exitCode = 1;
  } finally {
    // Firestore's open channel keeps Node alive, so the run never exited without this
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // An error can carry an id, so only its code is printed
    const code = (error as { code?: unknown } | null)?.code;
    console.error(`stopped: ${typeof code === 'string' ? code : 'unexpected error'}`);
    process.exitCode = 1;
  });
}
