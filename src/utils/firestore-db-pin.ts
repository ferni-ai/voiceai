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
 *   the logs; every mismatch not logged is counted in the next line's
 *   `suppressed`. Prod runs this with '(default)' expected, so any stray
 *   named-database client in prod is reported too.
 * - refuse: log the same line and reject the RPC with
 *   FirestoreDatabaseMismatchError (PERMISSION_DENIED, never retried).
 * - off: no check.
 *
 * Writes need their call site captured early. DocumentReference.set() and
 * friends return `commit().then(...)`, and runTransaction() runs its callback
 * after an await, so by the time `request('commit')` runs the app's frames are
 * gone from the stack. WriteBatch.prototype.commit and
 * Firestore.prototype.runTransaction therefore note the caller synchronously,
 * only when the client is on the wrong database, in an AsyncLocalStorage that
 * the RPC check reads. BulkWriter (no callers in src/) is still checked and
 * refused, but its lines can say site "unknown".
 *
 * Rejected RPCs also go to firestore-error-log.ts and are re-thrown unchanged.
 * Their call site comes from initializeIfNeeded(tag), which queries, reads and
 * writes call synchronously from the app; the stack is formatted only on error.
 *
 * @module utils/firestore-db-pin
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { getFirestoreDatabase } from '../config/environment.js';
import * as errorLog from './firestore-error-log.js';
import { createLogger } from './safe-logger.js';
import { realFirestoreModules, type FirestoreModule } from './synthetic-write-guard.js';

const log = createLogger({ module: 'firestore-db-pin' });

type Env = Readonly<Record<string, string | undefined>>;

export type FirestoreDbPinMode = 'report' | 'refuse' | 'off';

/** The two methods every Firestore RPC goes through (index.js of @google-cloud/firestore). */
const RPC_METHODS = ['request', 'requestStream'] as const;
const PINNED = Symbol.for('ferni.firestoreDbPin');
const NOTED = Symbol.for('ferni.firestoreDbPin.writeSite');
const PERMISSION_DENIED = 7;
const MAX_SITES = 500;
const WINDOW_MS = 60_000;
const MAX_LINES_PER_WINDOW = 20;
const MAX_TAGS = 256; // request tags whose call site is kept, oldest dropped first

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
  /**
   * Mismatches not logged since the last line: repeats of a call site already
   * logged, and anything over the per-minute cap.
   */
  suppressed: number;
}

export type FirestoreDbMismatchSink = (mismatch: FirestoreDbMismatch) => void;

const logMismatch: FirestoreDbMismatchSink = (m) => {
  if (m.mode === 'refuse') log.error(m, 'FIRESTORE_DB_MISMATCH');
  else log.warn(m, 'FIRESTORE_DB_MISMATCH');
};

const LIBRARY_FRAME =
  /node_modules|\(node:|^at node:|\(<anonymous>\)$|synthetic-write-guard|gcp-test-guard|firestore-db-pin\.(ts|js):/;

interface StackHolder {
  stack?: string;
}

/** The stack below `wrapper`, unformatted until `.stack` is read. */
function captureStack(wrapper: (...a: never[]) => unknown): StackHolder {
  const holder: StackHolder = {};
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  Error.captureStackTrace(holder, wrapper);
  Error.stackTraceLimit = limit;
  return holder;
}

/** The first frame below `wrapper` that is app code. */
export function callerSite(wrapper: (...a: never[]) => unknown): string {
  return siteOf(captureStack(wrapper));
}

function siteOf(holder: StackHolder): string {
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
    const site = writeSites().getStore() ?? callerSite(wrapper);
    const key = `${method}|${actual}|${site}`;
    if (seen.has(key)) {
      suppressed++;
      return refusal;
    }
    seen.add(key);
    lines++;
    sink({ event: 'FIRESTORE_DB_MISMATCH', mode, expected, actual, method, site, suppressed });
    suppressed = 0;
    return refusal;
  };
}

// On globalThis: vitest reloads this module per test file, but a patched
// prototype keeps the closure of the copy that patched it.
const SITES = Symbol.for('ferni.firestoreDbPin.sites');
function writeSites(): AsyncLocalStorage<string> {
  const shared = globalThis as { [SITES]?: AsyncLocalStorage<string> };
  return (shared[SITES] ??= new AsyncLocalStorage<string>());
}

type Method = (this: unknown, ...a: unknown[]) => unknown;

/**
 * Run `name` inside the caller's site whenever the client it writes through is
 * on another database than the pin expects. Matching clients pay one string
 * compare.
 */
function noteWriteSite(
  proto: Record<string | symbol, unknown>,
  name: string,
  env: Env,
  databaseOf: (self: unknown) => string | undefined
): void {
  const original = proto[name];
  if (typeof original !== 'function') return;
  const noted = function (this: unknown, ...args: unknown[]): unknown {
    const actual = databaseOf(this) ?? '(default)';
    if (firestoreDbPinMode(env) === 'off' || actual === getFirestoreDatabase(env)) {
      return (original as Method).apply(this, args);
    }
    const site = callerSite(noted);
    return writeSites().run(site, () => (original as Method).apply(this, args));
  };
  proto[name] = noted;
}

/**
 * Patch every copy of the Firestore client once. Idempotent; installed where the
 * synthetic-write guard is (getFirestoreDb, getAdminApp, process entrypoints).
 */
export function installFirestoreDbPin(
  env: Env = process.env,
  modules: FirestoreModule[] = realFirestoreModules(),
  sink: FirestoreDbMismatchSink = logMismatch,
  errorSink: errorLog.FirestoreErrorSink = errorLog.logFirestoreError
): void {
  const check = createCheck(env, sink);
  const reportError = errorLog.createFirestoreErrorReporter(errorSink);
  const stacks = new Map<unknown, StackHolder>();
  for (const { Firestore, WriteBatch } of modules) {
    const proto = Firestore.prototype;
    if (Object.prototype.hasOwnProperty.call(proto, PINNED)) continue;
    const init = proto.initializeIfNeeded;
    if (typeof init === 'function') {
      const noted = function (this: unknown, tag: unknown, ...rest: unknown[]): unknown {
        if (stacks.size >= MAX_TAGS) stacks.delete(stacks.keys().next().value);
        stacks.set(tag, captureStack(noted));
        return (init as Method).call(this, tag, ...rest);
      };
      proto.initializeIfNeeded = noted;
    }
    for (const name of RPC_METHODS) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      const pinned = function (
        this: { databaseId?: string },
        method: string,
        ...rest: unknown[]
      ): unknown {
        // The SDK's getter: the bound databaseId, or '(default)'.
        const database = this.databaseId ?? '(default)';
        const refusal = check(database, method, pinned);
        if (refusal) return Promise.reject(refusal);
        // request(method, request, tag, …); requestStream(method, bidi, request, tag)
        const [request, tag] = name === 'request' ? rest : rest.slice(1);
        const stack = stacks.get(tag) ?? captureStack(pinned);
        const result = (original as Method).call(this, method, ...rest);
        if (!(result instanceof Promise)) return result;
        return result.catch((error: unknown) => {
          try {
            reportError(error, method, request, database, siteOf(stack));
          } catch {
            // Telemetry must never change what the caller sees.
          }
          throw error;
        });
      };
      proto[name] = pinned;
    }
    noteWriteSite(proto, 'runTransaction', env, (db) => (db as { databaseId?: string }).databaseId);
    proto[PINNED] = true;
    const batch = WriteBatch?.prototype;
    if (batch && !Object.prototype.hasOwnProperty.call(batch, NOTED)) {
      noteWriteSite(
        batch,
        'commit',
        env,
        (b) => (b as { _firestore?: { databaseId?: string } })._firestore?.databaseId
      );
      batch[NOTED] = true;
    }
  }
}
