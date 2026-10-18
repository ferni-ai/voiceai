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
 * uses the same layer). A write in PROD_FIRESTORE_PROJECT is refused with
 * SyntheticWriteRefusedError (PERMISSION_DENIED, never retried) when it is under
 * bogle_users/{owner} or users/{owner}, names the owner in userId / user_id /
 * ownerId / uid / metadata.userId, or is a phone_mappings row for +1555, and the
 * owner is synthetic. Deletes, other projects and the emulator pass.
 *
 * Evals in production: run.sh calls an agent that writes here, and
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
import { Firestore as ImportedFirestore } from '@google-cloud/firestore';
import { createLogger } from './safe-logger.js';
import {
  PROD_FIRESTORE_PROJECT,
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
}

/** `projects/<p>/databases/<d>/documents/<path>` → [project, path segments] */
function parseName(name: string): [string, string[]] | null {
  const m = /^projects\/([^/]+)\/databases\/[^/]+\/documents\/(.+)$/.exec(name);
  return m ? [m[1] as string, (m[2] as string).split('/')] : null;
}

/**
 * The synthetic owner a write is for, or null when it may go ahead. Exported
 * for tests; the guard calls it for every write of a commit.
 */
export function refusedOwner(write: WriteProto, env: Env = process.env): string | null {
  if (write.delete !== undefined || env.FIRESTORE_EMULATOR_HOST) return null;
  const name = write.update?.name ?? write.transform?.document;
  const parsed = name ? parseName(name) : null;
  if (!parsed || parsed[0] !== PROD_FIRESTORE_PROJECT) return null;
  const [, segs] = parsed;

  const candidates: unknown[] = [];
  if (USER_RECORD_ROOTS.has(segs[0] as string)) candidates.push(segs[1]);
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

type FirestoreClass = { prototype: Record<string | symbol, unknown> };

/**
 * Every copy of the client class: the one this module imports (the bundled copy
 * when the agent is bundled), plus the app's and firebase-admin's own requires.
 */
function realFirestoreClasses(): FirestoreClass[] {
  const classes = new Set<FirestoreClass>([ImportedFirestore as unknown as FirestoreClass]);
  try {
    const fromHere = createRequire(import.meta.url);
    const resolvers = [fromHere];
    try {
      resolvers.push(createRequire(fromHere.resolve('firebase-admin')));
    } catch {
      // firebase-admin isn't installed here; the app's copy is the only one.
    }
    for (const req of resolvers) {
      classes.add((req('@google-cloud/firestore') as { Firestore: FirestoreClass }).Firestore);
    }
  } catch {
    // No node_modules to resolve from (a bundle): the imported copy is the one in use.
  }
  return [...classes];
}

const warned = new Set<string>();

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
    const original = proto.request;
    if (typeof original !== 'function') continue;
    proto.request = function (this: unknown, method: string, request: unknown, ...rest: unknown[]) {
      if (WRITE_METHODS.has(method)) {
        const writes = (request as { writes?: WriteProto[] } | undefined)?.writes ?? [];
        for (const write of writes) {
          const owner = refusedOwner(write, env);
          if (!owner) continue;
          if (warned.size < 1000 && !warned.has(owner)) {
            warned.add(owner);
            log.warn({ owner, method }, 'Refused production write for a synthetic owner');
          }
          return Promise.reject(new SyntheticWriteRefusedError(owner));
        }
      }
      return (original as (...a: unknown[]) => unknown).call(this, method, request, ...rest);
    };
    proto[GUARDED] = true;
  }
}
