/**
 * Bare require() in ESM: the four Firestore stores behind REQUIRE_FIX_MEMORY,
 * plus visual memory, which stays off.
 *
 * Runs the real stores in a child Node process with no `require` (see the
 * driver), because vitest itself provides `require` and hides the bug. The
 * driver points Firestore at a local sink that only counts connections, and
 * the project id is a demo- one, so nothing can reach a real database.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const driver = fileURLToPath(
  new URL('./fixtures/require-fix-memory-stores-driver.ts', import.meta.url)
);

interface DriverResult {
  requireDefined: boolean;
  connections: number;
  outcomes: Record<string, { ok: true } | { ok: false; error: string }>;
  unhandled: string[];
}

const FLAGGED_STORES = ['ambient', 'health', 'embedding', 'preferences'];

function runDriver(stores: string[], flagOn: boolean): DriverResult {
  const env: NodeJS.ProcessEnv = { ...process.env, LOG_LEVEL: 'silent' };
  delete env.REQUIRE_FIX_MEMORY;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  delete env.FIRESTORE_EMULATOR_HOST;
  for (const key of [
    'GCP_PROJECT_ID',
    'GOOGLE_CLOUD_PROJECT',
    'FIREBASE_PROJECT_ID',
    'GCLOUD_PROJECT',
  ]) {
    env[key] = 'demo-require-fix-memory';
  }
  if (flagOn) env.REQUIRE_FIX_MEMORY = 'on';
  const stdout = execFileSync(process.execPath, ['--import', 'tsx', driver, stores.join(',')], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const line = stdout.split('\n').find((l) => l.startsWith('RESULT:'));
  if (!line) throw new Error(`driver printed no RESULT line:\n${stdout}`);
  return JSON.parse(line.slice('RESULT:'.length)) as DriverResult;
}

function errorsOf(result: DriverResult): string[] {
  return [
    ...Object.values(result.outcomes).flatMap((o) => (o.ok ? [] : [o.error])),
    ...result.unhandled,
  ];
}

describe('former bare-require Firestore stores under plain Node ESM', () => {
  const off = runDriver([...FLAGGED_STORES, 'visual'], false);
  const onByStore = Object.fromEntries(FLAGGED_STORES.map((s) => [s, runDriver([s], true)]));
  const visualOn = runDriver(['visual'], true);
  const all = [off, visualOn, ...Object.values(onByStore)];

  it('runs where `require` is not defined, as in prod', () => {
    for (const result of all) expect(result.requireDefined).toBe(false);
  });

  it('no store fails with "require is not defined"', () => {
    for (const result of all) {
      for (const error of errorsOf(result)) expect(error).not.toMatch(/require is not defined/);
    }
  });

  it('flag off (prod default): no store touches Firestore', () => {
    expect(off.connections).toBe(0);
  });

  it.each(FLAGGED_STORES)('REQUIRE_FIX_MEMORY=on: the %s store reaches Firestore', (store) => {
    expect(onByStore[store].connections).toBeGreaterThan(0);
  });

  it('visual memory stays off even with the flag on', () => {
    expect(visualOn.connections).toBe(0);
  });
});
