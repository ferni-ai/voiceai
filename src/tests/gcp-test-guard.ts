/**
 * Keeps every test away from real Google Cloud.
 *
 * A developer Mac signed in to gcloud has application-default credentials for
 * the production project, and a client that isn't mocked uses them: a test
 * that created contacts through the real store wrote them to production
 * `user_contacts` (2026-10-12). Mocking per path can't close this, because
 * firebase-admin requires @google-cloud/firestore through Node's own require,
 * which vi.mock never sees.
 *
 * So the test setup files apply two layers that hold whatever the import path:
 *
 * 1. isolateGcpCredentials() points GOOGLE_APPLICATION_CREDENTIALS at a file
 *    that doesn't exist and turns off metadata-server detection. Every Google
 *    client library resolves credentials through google-auth-library, which
 *    fails on that path instead of falling back to the gcloud login, so no
 *    real client (Firestore, Storage, Pub/Sub, Spanner, Vertex) can
 *    authenticate. Any project id that is set becomes a fake one.
 * 2. guardRealFirestore() makes the real Firestore client refuse its first
 *    request with RealGcpInTestError, instead of failing late on auth after
 *    retries. Constructing a client stays harmless, so modules that build one
 *    at import still load.
 *
 * The Firestore emulator (FIRESTORE_EMULATOR_HOST) keeps the real client, and
 * ALLOW_PRODUCTION_DATA=1 (the same opt-in as config/production-data-guard.ts)
 * turns both layers off, but only in the on-demand external suite
 * (vitest.config.external.ts sets EXTERNAL_TEST_SUITE). The production-data
 * guard tells developers to export ALLOW_PRODUCTION_DATA=1 to run a local
 * server, and a shell that still has it must not unguard the unit suite.
 */

import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

type Env = Record<string, string | undefined>;

export const NO_GCP_CREDENTIALS_PATH = '/nonexistent/ferni-tests-have-no-gcp-credentials.json';
export const TEST_GCP_PROJECT = 'ferni-test-no-gcp';

const PROJECT_ID_VARS = [
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GCP_PROJECT_ID',
  'GCP_PROJECT',
  'GOOGLE_PROJECT_ID',
  'FIREBASE_PROJECT_ID',
];

/** Methods every Firestore RPC goes through (index.js of @google-cloud/firestore). */
const FIRESTORE_REQUEST_METHODS = ['initializeIfNeeded', 'request', 'requestStream'] as const;
const GUARDED = Symbol.for('ferni.gcpTestGuard');

export class RealGcpInTestError extends Error {
  constructor(what: string) {
    super(
      `${what} in a test: tests must never reach Google Cloud, because a signed-in ` +
        `machine's credentials point at production. Mock the store (see ` +
        `src/tests/setup.ts) or run against the emulator with FIRESTORE_EMULATOR_HOST.`
    );
    this.name = 'RealGcpInTestError';
  }
}

export function realGcpAllowed(env: Env = process.env): boolean {
  return env.ALLOW_PRODUCTION_DATA === '1' && env.EXTERNAL_TEST_SUITE === '1';
}

/** Layer 1: no Google client in this process can find credentials. */
export function isolateGcpCredentials(env: Env = process.env): void {
  if (realGcpAllowed(env)) return;
  env.GOOGLE_APPLICATION_CREDENTIALS = NO_GCP_CREDENTIALS_PATH;
  env.METADATA_SERVER_DETECTION = 'none';
  // Only ids that are set: code reads "a project is configured" as "use Vertex"
  // (memory/vectors/embeddings.ts), and unset must stay unset.
  for (const name of PROJECT_ID_VARS) if (env[name]) env[name] = TEST_GCP_PROJECT;
  delete env.FIREBASE_CONFIG;
}

// On globalThis, not in this module: vitest reloads the module for every test
// file, but the patched prototype keeps the first copy's closure.
const TEST_PATH = Symbol.for('ferni.gcpTestGuard.testPath');
const shared = globalThis as { [TEST_PATH]?: string };

/** Names the running test file in the refusal report (FERNI_GCP_GUARD_REPORT). */
export function setGcpGuardTestPath(testPath: string | undefined): void {
  shared[TEST_PATH] = testPath;
}

function report(what: string, env: Env): void {
  const file = env.FERNI_GCP_GUARD_REPORT;
  if (!file) return;
  // The first app frame names the code that made the call.
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const stack = new Error().stack ?? '';
  Error.stackTraceLimit = limit;
  const caller = stack
    .split('\n')
    .find((line) => line.includes('/src/') && !/node_modules|gcp-test-guard/.test(line));
  appendFileSync(
    file,
    `${JSON.stringify({ test: shared[TEST_PATH] ?? null, what, caller: caller?.trim() })}\n`
  );
}

export type FirestoreClass = { prototype: Record<string, unknown> & { [GUARDED]?: true } };

/** Every installed copy: the app's own, and the one firebase-admin requires. */
function realFirestoreClasses(): FirestoreClass[] {
  const fromHere = createRequire(import.meta.url);
  const resolvers = [fromHere];
  try {
    resolvers.push(createRequire(fromHere.resolve('firebase-admin')));
  } catch {
    // firebase-admin isn't installed here; the app's copy is the only one.
  }
  const classes = new Set<FirestoreClass>();
  for (const req of resolvers) {
    classes.add((req('@google-cloud/firestore') as { Firestore: FirestoreClass }).Firestore);
  }
  return [...classes];
}

/** Layer 2: a real Firestore client refuses to send anything without the emulator. */
export function guardRealFirestore(
  env: Env = process.env,
  classes: FirestoreClass[] = realFirestoreClasses()
): void {
  for (const Firestore of classes) {
    const proto = Firestore.prototype;
    if (proto[GUARDED]) continue;
    for (const method of FIRESTORE_REQUEST_METHODS) {
      const original = proto[method];
      if (typeof original !== 'function') continue;
      proto[method] = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
        if (!env.FIRESTORE_EMULATOR_HOST && !realGcpAllowed(env)) {
          report(`Firestore.${method}`, env);
          throw new RealGcpInTestError(`Real Firestore ${method}()`);
        }
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
    proto[GUARDED] = true;
  }
}
