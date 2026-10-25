/**
 * Purge what test, eval and CLI harnesses left in production Firestore.
 *
 * Owners are classified by the allowlist in src/utils/synthetic-user.ts
 * (voice-eval-, e2e-, flow-test-, test-, ctx-e2e-, device:cli-; the one the
 * production write guard refuses), plus phone_mappings rows for +1555 numbers.
 * Never an `anon:` id, never a real uid.
 *
 * What goes:
 *   bogle_users, users, entity_store, engagement_profiles: the {owner} doc and
 *     everything under it (users/{owner}/calendar_events, shared_memories, ...)
 *   vectors (owner in metadata.userId), concierge_requests, alarms,
 *     future_self_letters, trust, team_insights: documents outside those records
 *     whose userId names a harness owner (copies under a record go with it)
 *   phone_mappings: +1555 numbers, or rows mapping to a harness owner
 *
 * Dry run by default (scripts/destructive-gate.ts): counts per collection, then
 * the owner ids it would delete (all harness ids, so safe to print).
 *
 *   npx tsx scripts/migrations/purge-synthetic-data.ts
 *   npx tsx scripts/migrations/purge-synthetic-data.ts --apply --confirm-project=johnb-2025
 */

import { pathToFileURL } from 'node:url';
import { isSyntheticPhone, syntheticOwnerPrefix } from '../../src/utils/synthetic-user.js';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { getFirestoreDatabase } from '../../src/config/environment.js';

/** Collections whose {owner} document, and everything under it, belongs to the owner. */
export const OWNER_ROOTS = ['bogle_users', 'users', 'entity_store', 'engagement_profiles'];
/** Collection groups whose documents name their owner in a field. */
export const OWNER_FIELD_GROUPS = [
  'vectors',
  'concierge_requests',
  'alarms',
  'future_self_letters',
  'trust',
  'team_insights',
];
const OWNER_FIELDS = ['userId', 'metadata.userId', 'user_id', 'ownerId'];

interface Ref {
  id: string;
  path: string;
  listCollections(): Promise<Array<{ id: string; count(): CountQuery }>>;
}
interface CountQuery {
  get(): Promise<{ data(): { count: number } }>;
}
type Doc = { id: string; ref: Ref; get(field: string): unknown };
interface GroupQuery {
  limit(n: number): GroupQuery;
  startAfter(doc: Doc): GroupQuery;
  get(): Promise<{ docs: Doc[] }>;
}
/** The slice of Firestore the purge uses, so a test can hand it a fake. */
export interface PurgeDb {
  collection(path: string): { listDocuments(): Promise<Ref[]> };
  collectionGroup(name: string): { select(...fields: string[]): GroupQuery };
  recursiveDelete(ref: Ref): Promise<void>;
  batch(): { delete(ref: Ref): unknown; commit(): Promise<unknown> };
}

export interface PurgePlan {
  /** Documents per collection label, e.g. "bogle_users/{owner}/memories". */
  counts: Record<string, number>;
  /** Owner documents to delete recursively. */
  roots: Ref[];
  /** Single documents to delete. */
  docs: Ref[];
  /** Every harness owner id found, to print. */
  owners: Set<string>;
}

const PAGE = 1000;

/** Every document of a collection group, a page at a time (vectors is large). */
async function* scanGroup(db: PurgeDb, group: string, fields: string[]): AsyncGenerator<Doc> {
  let last: Doc | undefined;
  for (;;) {
    const query = db
      .collectionGroup(group)
      .select(...fields)
      .limit(PAGE);
    const { docs } = await (last ? query.startAfter(last) : query).get();
    yield* docs;
    if (docs.length < PAGE) return;
    last = docs[docs.length - 1];
  }
}

const isUnderRoot = (path: string) => OWNER_ROOTS.includes(path.split('/')[0] as string);

async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Read-only: everything the purge would delete, with counts per collection. */
export async function planPurge(db: PurgeDb): Promise<PurgePlan> {
  const plan: PurgePlan = { counts: {}, roots: [], docs: [], owners: new Set() };
  const add = (label: string, n: number) => {
    if (n > 0) plan.counts[label] = (plan.counts[label] ?? 0) + n;
  };

  for (const root of OWNER_ROOTS) {
    const owners = (await db.collection(root).listDocuments()).filter((r) =>
      syntheticOwnerPrefix(r.id)
    );
    plan.roots.push(...owners);
    for (const o of owners) plan.owners.add(o.id);
    add(root, owners.length);
    // One level of subcollections is counted; deeper documents go with their parents.
    await inParallel(owners, 16, async (owner) => {
      for (const sub of await owner.listCollections()) {
        add(`${root}/{owner}/${sub.id}`, (await sub.count().get()).data().count);
      }
    });
  }

  for (const group of OWNER_FIELD_GROUPS) {
    for await (const doc of scanGroup(db, group, OWNER_FIELDS)) {
      if (isUnderRoot(doc.ref.path)) continue;
      const owner = OWNER_FIELDS.map((f) => doc.get(f)).find((v) => syntheticOwnerPrefix(v));
      if (typeof owner !== 'string') continue;
      plan.docs.push(doc.ref);
      plan.owners.add(owner);
      add(group, 1);
    }
  }

  for await (const doc of scanGroup(db, 'phone_mappings', ['phone', 'userId'])) {
    const owner = doc.get('userId');
    const synthetic =
      isSyntheticPhone(doc.id) || isSyntheticPhone(doc.get('phone')) || syntheticOwnerPrefix(owner);
    if (!synthetic || isUnderRoot(doc.ref.path)) continue;
    plan.docs.push(doc.ref);
    plan.owners.add(syntheticOwnerPrefix(owner) ? (owner as string) : doc.id);
    add('phone_mappings', 1);
  }
  return plan;
}

export async function applyPurge(db: PurgeDb, plan: PurgePlan): Promise<void> {
  await inParallel(plan.roots, 8, (ref) => db.recursiveDelete(ref));
  for (let i = 0; i < plan.docs.length; i += 400) {
    const batch = db.batch();
    for (const ref of plan.docs.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
}

export async function main(argv: readonly string[] = process.argv, db?: PurgeDb): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') {
    console.error(refusalMessage(projectId));
    process.exitCode = 1;
    return;
  }
  if (!db) {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({ projectId, databaseId: getFirestoreDatabase() }) as unknown as PurgeDb;
  }

  const plan = await planPurge(db);
  console.log(`${mode === 'dry-run' ? 'DRY RUN: would delete' : 'Deleting'} on ${projectId}:`);
  for (const [label, n] of Object.entries(plan.counts).sort()) {
    console.log(`  ${label.padEnd(48)} ${n}`);
  }
  if (Object.keys(plan.counts).length === 0) console.log('  nothing: no harness data found');
  if (plan.owners.size > 0) {
    console.log(`Owner ids (${plan.owners.size}):`);
    for (const id of [...plan.owners].sort()) console.log(`  ${id}`);
  }
  if (mode === 'dry-run') return;

  await applyPurge(db, plan);
  console.log(`Deleted ${plan.roots.length} owner records and ${plan.docs.length} documents.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('purge-synthetic-data failed:', err);
    process.exit(1);
  });
}
