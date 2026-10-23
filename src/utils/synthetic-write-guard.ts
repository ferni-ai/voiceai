/**
 * Production Firestore refuses writes for synthetic owners (test, eval and CLI
 * harness users; see synthetic-user.ts).
 *
 * Both voice agents (ferni-dev and prod), the API and the workers write to the
 * production project, so every harness call that reached one left a user
 * behind: about 94% of bogle_users subcollection documents in the 2026-10-18
 * audit. The guard sits where every write leaves the process,
 * Firestore.prototype.request (`commit` and `batchWrite`, for
 * @google-cloud/firestore and firebase-admin alike; src/tests/gcp-test-guard.ts
 * uses the same layer).
 *
 * "In prod" means one thing: the document the write names is in prod's own
 * database, project PROD_FIRESTORE_PROJECT (johnb-2025) AND database
 * PROD_FIRESTORE_DATABASE ('(default)'), both read from the write itself
 * (projects/<p>/databases/<d>/...; isProdFirestore in synthetic-user.ts). Not
 * NODE_ENV, not GOOGLE_CLOUD_PROJECT, not FIRESTORE_DATABASE, not which agent
 * is running. While the ferni-dev agent writes to (default), the guard applies
 * to it as well, on purpose: its harness users land in prod's stores. The dev
 * database (ferni-dev, same project) exists so dev and its harness users can
 * write freely without touching real people's data, so writes to any other
 * database in johnb-2025, to any other project, and every write while
 * FIRESTORE_EMULATOR_HOST is set, pass.
 *
 * There a write is synthetic when it is under bogle_users/{owner} or
 * users/{owner}, names the owner in userId / user_id / ownerId / uid /
 * metadata.userId, or is a phone_mappings row for +1555, and the owner STARTS
 * WITH one of SYNTHETIC_OWNER_PREFIXES (a uid merely containing "test-" passes).
 * Deletes, and updates that require the document to exist (update(),
 * tx.update(): currentDocument.exists), are never synthetic: they cannot create
 * a harness user, and sweep jobs claim existing docs that way.
 *
 * Per write, so one harness doc never takes real work down with it (a reminder
 * sweep whose claim transaction was refused would stall every later reminder):
 * - batchWrite (non-atomic): only the synthetic writes are dropped, each
 *   answered PERMISSION_DENIED in its own status; the rest are sent.
 * - commit (a batch or transaction, atomic): refused with
 *   SyntheticWriteRefusedError (PERMISSION_DENIED, never retried) only when
 *   EVERY write in it is synthetic; a commit mixing in any other write is sent.
 *
 * Shared buckets: a write under bogle_users/<id> or users/<id> where <id> is a
 * placeholder every id-less caller falls back to ('anonymous', 'unknown',
 * 'default', 'shared', 'anon', 'session', 'gateway', 'gateway-recovery'; any
 * case) is refused the same way. One such doc is everyone's: ~925 direct
 * `collection('bogle_users')` writers bypass the persistence layer's own check,
 * and prod held real profiles under bogle_users/anonymous and /unknown.
 *
 * Evals in production: run.sh calls an agent that writes to (default), and
 * returning-caller runs (EVAL_SEED) need the seed call's memories, so
 * PROD_EVAL_WRITES=voice-eval on an agent lets `voice-eval-` owners (and no
 * other class) write. Those users are removed by running
 * scripts/voice-eval/cleanup-users.ts (older than 24 h, via the account
 * erasure), with scripts/migrations/purge-synthetic-data.ts as the backstop.
 * Rejected: a namespaced collection (every store would have to learn it) and a
 * Firestore TTL (it deletes a document, never its subcollections).
 *
 * @module utils/synthetic-write-guard
 */

import { createRequire } from 'node:module';
import {
  Firestore as ImportedFirestore,
  WriteBatch as ImportedWriteBatch,
} from '@google-cloud/firestore';
import { createLogger } from './safe-logger.js';
import {
  PLACEHOLDER_IDS,
  isProdFirestore,
  isSyntheticPhone,
  syntheticOwnerPrefix,
  type SyntheticOwnerPrefix,
} from './synthetic-user.js';

const log = createLogger({ module: 'synthetic-write-guard' });

type Env = Readonly<Record<string, string | undefined>>;

/** The one class PROD_EVAL_WRITES can let through, and the value that does it. */
export const PROD_EVAL_WRITES_VALUE = 'voice-eval';
const ALLOWABLE: SyntheticOwnerPrefix = 'voice-eval-';

const USER_RECORD_ROOTS = new Set(['bogle_users', 'users']);
/** Owner ids that are one bucket for every caller without an id (lower case). */
const SHARED_OWNERS: ReadonlySet<string> = new Set([
  ...PLACEHOLDER_IDS,
  'anon',
  'session',
  'gateway',
  'gateway-recovery',
]);
const OWNER_FIELDS = ['userId', 'user_id', 'ownerId', 'uid'] as const;
const WRITE_METHODS = new Set(['commit', 'batchWrite']);
const GUARDED = Symbol.for('ferni.syntheticWriteGuard');
const PERMISSION_DENIED = 7;

export class SyntheticWriteRefusedError extends Error {
  readonly code = PERMISSION_DENIED;
  constructor(readonly owner: string) {
    super(
      `Refused a production Firestore write for synthetic owner "${owner}": test and ` +
        `eval users must not land in user stores (utils/synthetic-write-guard.ts).`
    );
    this.name = 'SyntheticWriteRefusedError';
  }
}

/** The subset of a Firestore Write proto the guard reads. */
interface ValueProto {
  stringValue?: string;
  mapValue?: { fields?: Record<string, ValueProto | undefined> };
}
interface WriteProto {
  update?: { name?: string; fields?: Record<string, ValueProto | undefined> };
  transform?: { document?: string };
  delete?: string;
  currentDocument?: { exists?: boolean };
}

/** `projects/<p>/databases/<d>/documents/<path>` → [project, database, path segments] */
function parseName(name: string): [string, string, string[]] | null {
  const m = /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/.exec(name);
  return m ? [m[1] as string, m[2] as string, (m[3] as string).split('/')] : null;
}

/**
 * The synthetic owner a write is for, or null when it may go ahead. Exported
 * for tests; the guard calls it for every write of a commit.
 */
export function refusedOwner(write: WriteProto, env: Env = process.env): string | null {
  if (write.delete !== undefined || write.currentDocument?.exists === true) return null;
  if (env.FIRESTORE_EMULATOR_HOST) return null;
  const name = write.update?.name ?? write.transform?.document;
  const parsed = name ? parseName(name) : null;
  if (!parsed || !isProdFirestore(parsed[0], parsed[1])) return null;
  const [, , segs] = parsed;

  const candidates: unknown[] = [];
  if (USER_RECORD_ROOTS.has(segs[0] as string)) {
    if (SHARED_OWNERS.has(String(segs[1]).toLowerCase())) return segs[1] as string;
    candidates.push(segs[1]);
  }
  const fields = write.update?.fields;
  for (const f of OWNER_FIELDS) candidates.push(fields?.[f]?.stringValue);
  // The vector store keeps its owner in metadata.userId.
  candidates.push(fields?.metadata?.mapValue?.fields?.userId?.stringValue);

  for (const owner of candidates) {
    const prefix = syntheticOwnerPrefix(owner);
    if (!prefix) continue;
    if (prefix === ALLOWABLE && env.PROD_EVAL_WRITES === PROD_EVAL_WRITES_VALUE) continue;
    return owner as string;
  }
  if (segs[0] === 'phone_mappings') {
    const phone = fields?.phone?.stringValue;
    if (isSyntheticPhone(segs[1]) || isSyntheticPhone(phone)) return segs[1] as string;
  }
  return null;
}

export type FirestoreClass = { prototype: Record<string | symbol, unknown> };

/** A copy of @google-cloud/firestore: its client class and, when found, its WriteBatch. */
export interface FirestoreModule {
  Firestore: FirestoreClass;
  WriteBatch?: FirestoreClass;
}

/**
 * Every copy of the client package: the one this module imports (the bundled copy
 * when the agent is bundled), plus the app's and firebase-admin's own requires.
 * The database pin (firestore-db-pin.ts) patches the same set.
 */
export function realFirestoreModules(): FirestoreModule[] {
  const modules = new Map<FirestoreClass, FirestoreModule>();
  const imported: FirestoreModule = { Firestore: ImportedFirestore as unknown as FirestoreClass };
  try {
    imported.WriteBatch = ImportedWriteBatch as unknown as FirestoreClass;
  } catch {
    // A test's mock of the package without WriteBatch: there is no real one to patch.
  }
  modules.set(imported.Firestore, imported);
  try {
    const fromHere = createRequire(import.meta.url);
    const resolvers = [fromHere];
    try {
      resolvers.push(createRequire(fromHere.resolve('firebase-admin')));
    } catch {
      // firebase-admin isn't installed here; the app's copy is the only one.
    }
    for (const req of resolvers) {
      const sdk = req('@google-cloud/firestore') as FirestoreModule;
      modules.set(sdk.Firestore, { Firestore: sdk.Firestore, WriteBatch: sdk.WriteBatch });
    }
  } catch {
    // No node_modules to resolve from (a bundle): the imported copy is the one in use.
  }
  return [...modules.values()];
}

/** The client class of every copy (realFirestoreModules). */
export function realFirestoreClasses(): FirestoreClass[] {
  return realFirestoreModules().map((m) => m.Firestore);
}

const warned = new Set<string>();

function warnOnce(owner: string, method: string): void {
  if (warned.size >= 1000 || warned.has(owner)) return;
  warned.add(owner);
  log.warn({ owner, method }, 'Refused production write for a synthetic owner');
}

type Send = (request: unknown) => Promise<unknown>;
interface BatchWriteResponse {
  writeResults?: unknown[];
  status?: unknown[];
}

/**
 * One RPC through the guard: `send` forwards a request to the real client.
 * Exported for tests.
 */
export async function guardedRequest(
  method: string,
  request: unknown,
  send: Send,
  env: Env = process.env
): Promise<unknown> {
  const writes = (request as { writes?: WriteProto[] } | undefined)?.writes;
  if (!WRITE_METHODS.has(method) || !writes?.length) return send(request);
  const owners = writes.map((w) => refusedOwner(w, env));
  const refused = owners.filter((o): o is string => o !== null);
  if (refused.length === 0) return send(request);
  for (const owner of new Set(refused)) warnOnce(owner, method);

  if (method === 'commit') {
    // Atomic: all or nothing. Refuse only a commit that is all harness writes.
    if (refused.length < writes.length) return send(request);
    throw new SyntheticWriteRefusedError(refused[0] as string);
  }

  // batchWrite answers each write on its own: drop the harness writes only.
  const denied = (owner: string) => ({
    code: PERMISSION_DENIED,
    message: new SyntheticWriteRefusedError(owner).message,
  });
  const kept = writes.filter((_, i) => owners[i] === null);
  const sent = kept.length
    ? ((await send({ ...(request as object), writes: kept })) as BatchWriteResponse)
    : {};
  const out: Required<BatchWriteResponse> = { writeResults: [], status: [] };
  let k = 0;
  owners.forEach((owner) => {
    if (owner === null) {
      out.writeResults.push(sent.writeResults?.[k] ?? {});
      out.status.push(sent.status?.[k] ?? { code: 0 });
      k++;
    } else {
      out.writeResults.push({});
      out.status.push(denied(owner));
    }
  });
  return { ...sent, ...out };
}

/**
 * Patch every Firestore client class once. Idempotent; called where clients
 * are made (getFirestoreDb, getAdminApp) and by entrypoints.
 */
export function installSyntheticWriteGuard(
  env: Env = process.env,
  classes: FirestoreClass[] = realFirestoreClasses()
): void {
  for (const Firestore of classes) {
    const proto = Firestore.prototype;
    if (proto[GUARDED]) continue;
    const original = proto.request as (...a: unknown[]) => Promise<unknown>;
    if (typeof original !== 'function') continue;
    proto.request = function (this: unknown, method: string, request: unknown, ...rest: unknown[]) {
      const send: Send = (req) => original.call(this, method, req, ...rest);
      return guardedRequest(method, request, send, env);
    };
    proto[GUARDED] = true;
  }
}
