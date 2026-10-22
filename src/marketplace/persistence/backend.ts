/**
 * Which backend the marketplace stores (tools, billing, reviews) use.
 *
 * The factories used to pick Firestore whenever a project id was set
 * (GCP_PROJECT_ID / FIREBASE_PROJECT_ID), and NODE_ENV=test did not opt out.
 * On a developer machine with gcloud credentials, that sent the marketplace
 * unit tests (registry.test.ts, executor/__tests__/sandbox.test.ts) to
 * production: 2,259 marketplace_installations and 560 marketplace_executions
 * for userId 'user123', plus 'Test Agent' and 'Test Tool' manifests, written
 * 2025-12-14..18 and deleted 2026-10-18.
 *
 * Under a test runner the stores are in-memory. The only way to a Firestore
 * store from a test is the emulator plus the store's explicit flag.
 */

type Env = Readonly<Record<string, string | undefined>>;

export function isTestRun(env: Env = process.env): boolean {
  return Boolean(env.VITEST) || env.NODE_ENV === 'test';
}

/**
 * True when a store should use Firestore. `flag` is the store's opt-in
 * (USE_FIRESTORE_MARKETPLACE, USE_FIRESTORE_BILLING, USE_FIRESTORE_REVIEWS).
 */
export function firestoreBackendFromEnv(flag: string, env: Env = process.env): boolean {
  const optedIn = env[flag] === 'true';
  if (isTestRun(env)) return optedIn && Boolean(env.FIRESTORE_EMULATOR_HOST);
  return (
    env.NODE_ENV === 'production' ||
    optedIn ||
    Boolean(env.GCP_PROJECT_ID) ||
    Boolean(env.FIREBASE_PROJECT_ID)
  );
}
