/**
 * Production data guard
 *
 * Every Firestore client in this codebase (94 `new Firestore()` sites plus
 * firebase-admin) falls back to the machine's application-default credentials,
 * which point at the PRODUCTION project. Outside production that turns a local
 * dev server, a script or an experiment into a writer against real user data:
 * on 2026-10-04 a local UI server in dev mode created a test profile in the
 * production database that way.
 *
 * So a non-production process refuses to start unless it points at the
 * Firestore emulator, or someone explicitly opts in to production data.
 * Deployed services are unaffected: production images set NODE_ENV=production
 * and PR preview services on Cloud Run run with NODE_ENV=staging. Tests
 * isolate Firestore in src/tests/setup.ts instead.
 */

export type DataGuardEnv = Readonly<Record<string, string | undefined>>;

/** NODE_ENV values of deployed environments, which own their data access. */
const DEPLOYED_ENVIRONMENTS = new Set(['production', 'staging']);

export type DataGuardVerdict = 'deployed' | 'emulator' | 'opted-in' | 'test' | 'refuse';

/** Decide whether this process may talk to the data layer it would reach. */
export function dataGuardVerdict(env: DataGuardEnv): DataGuardVerdict {
  if (env.NODE_ENV && DEPLOYED_ENVIRONMENTS.has(env.NODE_ENV)) return 'deployed';
  if (env.FIRESTORE_EMULATOR_HOST) return 'emulator';
  if (env.ALLOW_PRODUCTION_DATA === '1') return 'opted-in';
  if (env.VITEST) return 'test';
  return 'refuse';
}

/**
 * Call first thing in a process entrypoint. Exits when a non-production
 * process would silently use production data.
 */
export function refuseProductionDataOutsideProduction(
  processName: string,
  env: DataGuardEnv = process.env,
  exit: (code: number) => never = process.exit,
  write: (message: string) => void = (m) => process.stderr.write(m)
): void {
  const verdict = dataGuardVerdict(env);
  if (verdict === 'opted-in') {
    write(
      `\n⚠️  ${processName}: ALLOW_PRODUCTION_DATA=1. This process reads and WRITES production Firestore.\n\n`
    );
    return;
  }
  if (verdict !== 'refuse') return;

  write(
    [
      '',
      `✋ ${processName} refused to start: NODE_ENV is "${env.NODE_ENV ?? '(unset)'}" and no Firestore emulator is configured,`,
      '   so it would read and write PRODUCTION user data with your local credentials.',
      '',
      '   Use the emulator:   firebase emulators:start --only firestore',
      '                       FIRESTORE_EMULATOR_HOST=localhost:8080 <your command>',
      '   Or, on purpose:     ALLOW_PRODUCTION_DATA=1 <your command>',
      '',
    ].join('\n')
  );
  exit(1);
}
