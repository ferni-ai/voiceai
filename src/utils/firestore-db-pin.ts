/**
 * Every Firestore RPC this process sends goes to one database: the one
 * getFirestoreDatabase() names (FIRESTORE_DATABASE, or '(default)').
 *
 * Dev is moving to its own database (`ferni-dev`) while prod stays on
 * '(default)' in the same project. The two central helpers bind to the
 * resolved database, but dozens of modules build their own client, and one
 * built without a databaseId would quietly read and write prod data from dev.
 * The pin checks the database each client is bound to on every RPC, reads
 * included, at the layer the synthetic-write guard uses
 * (Firestore.prototype.request for unary calls such as commit, batchWrite and
 * runAggregationQuery; Firestore.prototype.requestStream for batchGetDocuments,
 * runQuery and listen), for @google-cloud/firestore and firebase-admin alike.
 *
 * FIRESTORE_DB_PIN chooses what a mismatch does:
 * - report (default): log FIRESTORE_DB_MISMATCH with the expected and actual
 *   database, the RPC and the first app stack frame, then send the RPC.
 *   Deduped per call site and capped per minute, so a hot path cannot flood
 *   the logs. Prod runs this with '(default)' expected, so any stray
 *   named-database client in prod is reported too.
 * - refuse: log the same line and reject the RPC with
 *   FirestoreDatabaseMismatchError (PERMISSION_DENIED, never retried).
 * - off: no check.
 *
 * @module utils/firestore-db-pin
 */

import { getFirestoreDatabase } from '../config/environment.js';
import { createLogger } from './safe-logger.js';
import { realFirestoreClasses, type FirestoreClass } from './synthetic-write-guard.js';

const log = createLogger({ module: 'firestore-db-pin' });

type Env = Readonly<Record<string, string | undefined>>;

export type FirestoreDbPinMode = 'report' | 'refuse' | 'off';

/** The two methods every Firestore RPC goes through (index.js of @google-cloud/firestore). */
const RPC_METHODS = ['request', 'requestStream'] as const;
const PINNED = Symbol.for('ferni.firestoreDbPin');
const PERMISSION_DENIED = 7;
const MAX_SITES = 500;
const WINDOW_MS = 60_000;
const MAX_LINES_PER_WINDOW = 20;

/** FIRESTORE_DB_PIN: 'refuse' or 'off', anything else (unset included) is 'report'. */
export function firestoreDbPinMode(env: Env = process.env): FirestoreDbPinMode {
  const value = env.FIRESTORE_DB_PIN?.trim().toLowerCase();
  return value === 'refuse' || value === 'off' ? value : 'report';
}

export class FirestoreDatabaseMismatchError extends Error {
  readonly code = PERMISSION_DENIED;
  constructor(
    readonly expected: string,
    readonly actual: string,
    readonly method: string
  ) {
    super(
      `Refused Firestore ${method} on database "${actual}": this process is pinned to ` +
        `"${expected}" (FIRESTORE_DATABASE, FIRESTORE_DB_PIN=refuse; utils/firestore-db-pin.ts).`
    );
    this.name = 'FirestoreDatabaseMismatchError';
  }
}

export interface FirestoreDbMismatch {
  event: 'FIRESTORE_DB_MISMATCH';
  mode: Exclude<FirestoreDbPinMode, 'off'>;
  expected: string;
  actual: string;
  method: string;
  /** The first stack frame outside node_modules and Node: the code that made the call. */
  site: string;
  /** Mismatches not logged since the last line, because the per-minute cap was hit. */
  suppressed: number;
}

export type FirestoreDbMismatchSink = (mismatch: FirestoreDbMismatch) => void;

const logMismatch: FirestoreDbMismatchSink = (m) => {
  if (m.mode === 'refuse') log.error(m, 'FIRESTORE_DB_MISMATCH');
  else log.warn(m, 'FIRESTORE_DB_MISMATCH');
};

const LIBRARY_FRAME = /node_modules|\(node:|^at node:|synthetic-write-guard|gcp-test-guard/;

/** The first frame below `wrapper` that is app code. */
function callerSite(wrapper: (...a: never[]) => unknown): string {
  const holder: { stack?: string } = {};
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  Error.captureStackTrace(holder, wrapper);
  Error.stackTraceLimit = limit;
  const frame = (holder.stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') && !LIBRARY_FRAME.test(line));
  return frame?.slice(3) ?? 'unknown';
}

type Check = (
  actual: string,
  method: string,
  wrapper: (...a: never[]) => unknown
) => FirestoreDatabaseMismatchError | null;

function createCheck(env: Env, sink: FirestoreDbMismatchSink): Check {
  const seen = new Set<string>();
  let windowStart = 0;
  let lines = 0;
  let suppressed = 0;
  return (actual, method, wrapper) => {
    const mode = firestoreDbPinMode(env);
    if (mode === 'off') return null;
    const expected = getFirestoreDatabase(env);
    if (actual === expected) return null;
    const refusal =
      mode === 'refuse' ? new FirestoreDatabaseMismatchError(expected, actual, method) : null;

    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      lines = 0;
    }
    if (lines >= MAX_LINES_PER_WINDOW || seen.size >= MAX_SITES) {
      suppressed++;
      return refusal;
    }
    const site = callerSite(wrapper);
    const key = `${method}|${actual}|${site}`;
    if (seen.has(key)) return refusal;
    seen.add(key);
    lines++;
    sink({ event: 'FIRESTORE_DB_MISMATCH', mode, expected, actual, method, site, suppressed });
    suppressed = 0;
    return refusal;
  };
}

/**
 * Patch every Firestore client class once. Idempotent; installed where the
 * synthetic-write guard is (getFirestoreDb, getAdminApp, process entrypoints).
 */
export function installFirestoreDbPin(
  env: Env = process.env,
  classes: FirestoreClass[] = realFirestoreClasses(),
  sink: FirestoreDbMismatchSink = logMismatch
): void {
  const check = createCheck(env, sink);
  for (const Firestore of classes) {
    const proto = Firestore.prototype;
    if (proto[PINNED] === true) continue;
    for (const name of RPC_METHODS) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      const pinned = function (
        this: { databaseId?: string },
        method: string,
        ...rest: unknown[]
      ): unknown {
        // The SDK's getter: the bound databaseId, or '(default)'.
        const refusal = check(this.databaseId ?? '(default)', method, pinned);
        if (refusal) return Promise.reject(refusal);
        return (original as (...a: unknown[]) => unknown).call(this, method, ...rest);
      };
      proto[name] = pinned;
    }
    proto[PINNED] = true;
  }
}
