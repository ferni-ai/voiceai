/**
 * Counts data left behind by account deletions that partly failed.
 *
 * Account deletion (erase-user-record.ts) logs a store it could not erase and still
 * deletes the sign-in, so a deleted person can keep records in the stores it walks.
 * This counts them store by store. It prints store labels and counts only: never an
 * id, uid, email, phone number or document content.
 *
 *   npx tsx scripts/data/orphaned-erasure-audit.ts --project <gcp-project-id>
 *
 * Read-only: it never writes or deletes. Removing leftovers is a separate, reviewed job,
 * not a flag on a counting script.
 *
 * A key is orphaned only when all three hold:
 * 1. It has the shape of a Firebase uid: exactly 28 letters or digits. Firebase Auth
 *    generates uids that way, and gdpr-routes.ts relies on it ("28 characters"). Every
 *    other key the app writes for someone who may have no Firebase account has a
 *    character outside that set (`phone:+…`, `device:…`, `anon:…`, `onbehalf:…`,
 *    `auth:{provider}:{uid}`, `sponsored_…`), so those are never orphans. A custom uid of
 *    another shape would be missed, which errs on the side of not deleting.
 * 2. There is no bogle_users/{key} document. The sweep erases that record last and a
 *    retry starts from it, so a key that still has one is not counted. No deletion log
 *    or tombstone exists for account deletion (apple_transaction_owners is unrelated),
 *    so this record is the only per-person marker the code keeps.
 * 3. Firebase Auth has no user with that uid. A failed lookup aborts the run; it never
 *    counts as "no user".
 *
 * @module scripts/data/orphaned-erasure-audit
 */

import { pathToFileURL } from 'node:url';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import {
  FieldPath,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
// user-stores.ts imports nothing; erase-user-record.ts pulls in Firebase Auth, BigQuery and
// more, which kept this CLI from exiting and needed a default Firebase app at import
import { getFirestoreDatabase } from '../../src/config/environment.js';
import {
  ERASED_STORES,
  storeLabel,
  USER_RECORDS_COLLECTION,
  type OwnedStore,
} from '../../src/services/platform/user-stores.js';

const UID_SHAPE = /^[A-Za-z0-9]{28}$/;
const PAGE = 500;
const BATCH = 100;

/** Keyed by userId, but missing from ERASED_STORES until its fix lands (deduped by label if it does) */
const ANSWER_CARDS: OwnedStore = { collection: 'answer_cards', field: 'userId' };

const dedupeByLabel = (stores: readonly OwnedStore[]): OwnedStore[] => {
  const seen = new Set<string>();
  return stores.filter((store) => {
    const label = storeLabel(store);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
};

/** Every store account deletion walks, plus the ones it is known to miss */
export const AUDITED_STORES: readonly OwnedStore[] = dedupeByLabel([
  ...ERASED_STORES,
  ANSWER_CARDS,
]);

export interface OrphanedKey {
  key: string;
  /**
   * Documents that hold the key: the matches, or for a store keyed by document id 1 (the
   * document), or the documents under it when only its subcollections survive
   */
  docs: number;
}

export interface OrphanedStore {
  store: OwnedStore;
  keys: OrphanedKey[];
}

export interface AuditRun {
  lines: string[];
  total: number;
}

const chunk = <T>(values: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

/**
 * Keys a store holds, with how many of its documents name each (0 for a document-id
 * store). A map store holds one entry per person inside documents that aren't theirs.
 */
async function keysOf(db: Firestore, store: OwnedStore): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const count = (key: string): void => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  if ('doc' in store) {
    // listDocuments also returns a parent document that exists only for its subcollections
    for (const ref of await db.collection(store.collection).listDocuments()) counts.set(ref.id, 0);
    return counts;
  }
  const field = 'field' in store ? store.field : store.mapKey;
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db
      .collection(store.collection)
      .select(field)
      .orderBy(FieldPath.documentId())
      .limit(PAGE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) return counts;
    for (const doc of snap.docs) {
      const value: unknown = doc.get(field);
      if ('field' in store) {
        if (typeof value === 'string') count(value);
      } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(count);
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }
}

/** The ids among these that have a document in the collection */
async function documentsPresent(
  db: Firestore,
  collection: string,
  ids: readonly string[]
): Promise<Set<string>> {
  const present = new Set<string>();
  for (const batch of chunk(ids, BATCH)) {
    const snaps = await db.getAll(...batch.map((id) => db.collection(collection).doc(id)));
    for (const snap of snaps) if (snap.exists) present.add(snap.id);
  }
  return present;
}

/**
 * Documents under a document that doesn't exist itself (a parent erased before its
 * subcollections), at any depth, so a phantom key counts what it really holds.
 */
async function docsUnder(ref: DocumentReference): Promise<number> {
  let docs = 0;
  for (const sub of await ref.listCollections()) {
    docs += (await sub.count().get()).data().count;
    for (const child of await sub.listDocuments()) docs += await docsUnder(child);
  }
  return docs;
}

/** The candidates that pass conditions 2 and 3 (no record, no Firebase user) */
async function orphanUids(
  db: Firestore,
  auth: Auth,
  candidates: readonly string[]
): Promise<Set<string>> {
  const records = await documentsPresent(db, USER_RECORDS_COLLECTION, candidates);
  const withoutRecord = candidates.filter((id) => !records.has(id));
  const orphans = new Set<string>();
  for (const batch of chunk(withoutRecord, BATCH)) {
    // A throw here aborts the run: an unreadable Auth lookup must never count as "no user"
    const result = await auth.getUsers(batch.map((uid) => ({ uid })));
    for (const identifier of result.notFound) {
      if ('uid' in identifier) orphans.add(identifier.uid);
    }
  }
  return orphans;
}

/** Every store's orphaned keys, read from the stores and checked against the record and Auth */
export async function findOrphans(
  db: Firestore,
  auth: Auth,
  stores: readonly OwnedStore[] = AUDITED_STORES
): Promise<OrphanedStore[]> {
  const scanned = await Promise.all(
    stores.map(async (store) => ({ store, keys: await keysOf(db, store) }))
  );
  const candidates = new Set(
    scanned.flatMap(({ keys }) => [...keys.keys()].filter((key) => UID_SHAPE.test(key)))
  );
  const orphans = await orphanUids(db, auth, [...candidates]);
  return Promise.all(
    scanned.map(async ({ store, keys }) => {
      const found = [...keys].filter(([key]) => orphans.has(key));
      if (!('doc' in store)) {
        return { store, keys: found.map(([key, docs]) => ({ key, docs })) };
      }
      const present = await documentsPresent(
        db,
        store.collection,
        found.map(([key]) => key)
      );
      const docs = async (key: string): Promise<number> =>
        present.has(key) ? 1 : docsUnder(db.collection(store.collection).doc(key));
      return {
        store,
        keys: await Promise.all(found.map(async ([key]) => ({ key, docs: await docs(key) }))),
      };
    })
  );
}

/** One line per store, then the totals. Labels and counts only. */
export function reportLines(orphans: readonly OrphanedStore[]): { lines: string[]; total: number } {
  const rows = orphans.map(({ store, keys }) => ({
    label: storeLabel(store),
    keys: keys.length,
    docs: keys.reduce((sum, key) => sum + key.docs, 0),
  }));
  const width = Math.max(0, ...rows.map((row) => row.label.length));
  const total = rows.reduce((sum, row) => sum + row.keys, 0);
  const docs = rows.reduce((sum, row) => sum + row.docs, 0);
  const lines = rows.map(
    (row) => `${row.label.padEnd(width)}  orphaned keys ${row.keys}  docs ${row.docs}`
  );
  lines.push(`${'total'.padEnd(width)}  orphaned keys ${total}  docs ${docs}`);
  return { lines, total };
}

/** Counts orphaned records store by store. Reads only. */
export async function runAudit(options: {
  db: Firestore;
  auth: Auth;
  stores?: readonly OwnedStore[];
}): Promise<AuditRun> {
  const orphans = await findOrphans(options.db, options.auth, options.stores);
  const { lines, total } = reportLines(orphans);
  lines.push('read-only: nothing was changed.');
  return { lines, total };
}

function parseArgs(argv: readonly string[]): { project: string } {
  let project: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') project = argv[++i];
    else if (arg?.startsWith('--project=')) project = arg.slice('--project='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!project) throw new Error('--project <gcp-project-id> is required');
  return { project };
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
    'orphan-audit'
  );
  try {
    const run = await runAudit({
      db: getFirestore(app, getFirestoreDatabase()),
      auth: getAuth(app),
    });
    for (const line of run.lines) console.log(line);
  } finally {
    // Firestore's open channel keeps Node alive, so the run never exited without this
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // An error can carry an id, so only its code is printed
    const code = (error as { code?: unknown } | null)?.code;
    console.error(`audit stopped: ${typeof code === 'string' ? code : 'unexpected error'}`);
    process.exitCode = 1;
  });
}
