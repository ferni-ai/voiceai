import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWLIST_ENV,
  REFUSED,
  allowedUids,
  assertAllowedUid,
  isAllowedUid,
} from '../allowed-uid.mjs';

// Fictional ids of the same shape as a real uid; no real person's data is named here.
const LISTED = 'testOwnerUid0000000000000000';
const UNLISTED = 'testOtherUid0000000000000000';
const NAME = 'Quinlan';

describe('allowed-uid', () => {
  it('refuses every uid when the allowlist env is unset', () => {
    expect(allowedUids({}).size).toBe(0);
    expect(isAllowedUid(LISTED, {})).toBe(false);
    expect(() => assertAllowedUid(LISTED, {})).toThrow(REFUSED);
  });

  it('refuses a missing uid even when the list is set', () => {
    expect(() => assertAllowedUid(undefined, { [ALLOWLIST_ENV]: LISTED })).toThrow(REFUSED);
    expect(() => assertAllowedUid('', { [ALLOWLIST_ENV]: LISTED })).toThrow(REFUSED);
  });

  it('refuses an unlisted uid without echoing it', () => {
    const env = { [ALLOWLIST_ENV]: LISTED };
    expect(() => assertAllowedUid(UNLISTED, env)).toThrow(new Error(REFUSED));
  });

  it('accepts a listed uid, trimming spaces around commas', () => {
    const env = { [ALLOWLIST_ENV]: ` ${UNLISTED}x , ${LISTED} ,` };
    expect(assertAllowedUid(LISTED, env)).toBe(LISTED);
    expect(isAllowedUid(UNLISTED, env)).toBe(false);
  });
});

/**
 * Runs a script as a CLI, as from a plain shell: only PATH, HOME and TMPDIR plus the given
 * env. The test runner's own env (NODE_ENV=test, VITEST) quiets the app logger, which would
 * hide a config line logged before the refusal.
 */
function run(script: string, args: string[], env: Record<string, string>) {
  const base: Record<string, string> = {};
  for (const k of ['PATH', 'HOME', 'TMPDIR']) if (process.env[k]) base[k] = process.env[k]!;
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(import.meta.dirname, '../..', script), ...args],
    { env: { ...base, ...env }, encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL' }
  );
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

// Every runnable script behind the allowlist. Nothing may load or log before the refusal,
// so the whole output of a refused run is the one line.
const SCRIPTS: Array<{
  script: string;
  /** With no env and no arguments: the one line it prints. */
  bare: string;
  /** Points the script at a uid. */
  target: (uid: string) => { args: string[]; env: Record<string, string> };
}> = [
  {
    script: 'full-user-dump.ts',
    bare: 'FERNI_USER_ID is required',
    target: (uid) => ({ args: [], env: { FERNI_USER_ID: uid } }),
  },
  {
    script: 'memory-eval/build-private-cases.ts',
    bare: REFUSED,
    target: (uid) => ({ args: ['--uid', uid, '--name', NAME], env: {} }),
  },
  {
    script: 'voice-eval/review-calls.mjs',
    bare: 'REVIEW_OWNER_UID is required',
    target: (uid) => ({ args: [], env: { REVIEW_OWNER_UID: uid } }),
  },
  {
    script: 'voice-eval/scorecard.mjs',
    bare: 'REVIEW_OWNER_UID is required',
    target: (uid) => ({ args: [], env: { REVIEW_OWNER_UID: uid } }),
  },
  {
    script: 'outreach-dryrun/dry-run.ts',
    bare: REFUSED,
    target: (uid) => ({ args: ['--uid', uid], env: {} }),
  },
  {
    script: 'pondering/soak.ts',
    bare: 'pass --uid <uid> (listed in MEMORY_EVAL_ALLOWED_UIDS), --eval-users, or --job',
    target: (uid) => ({ args: ['--uid', uid], env: {} }),
  },
];

describe("scripts that read one person's data check the allowlist first", () => {
  for (const { script, bare, target } of SCRIPTS) {
    it(`${script} with no env prints only "${bare}"`, () => {
      const { status, output } = run(script, [], {});
      expect(status).toBe(1);
      expect(output.trim()).toBe(bare);
    }, 30_000);

    it(`${script} refuses an unlisted uid, printing only the refusal`, () => {
      const { args, env } = target(UNLISTED);
      const { status, output } = run(script, args, { ...env, [ALLOWLIST_ENV]: LISTED });
      expect(status).toBe(1);
      expect(output.trim()).toBe(REFUSED);
      expect(output).not.toContain(UNLISTED);
      expect(output).not.toContain(NAME);
    }, 30_000);
  }

  it('full-user-dump requires FERNI_USER_ID, with no fallback', () => {
    const { status, output } = run('full-user-dump.ts', [], { [ALLOWLIST_ENV]: LISTED });
    expect(status).toBe(1);
    expect(output.trim()).toBe('FERNI_USER_ID is required');
  }, 30_000);

  it('build-private-cases accepts a listed uid and goes on to the next check', () => {
    // --calls 0 fails the next argument check, so nothing is read.
    const { status, output } = run(
      'memory-eval/build-private-cases.ts',
      ['--uid', LISTED, '--name', NAME, '--calls', '0'],
      { [ALLOWLIST_ENV]: LISTED }
    );
    expect(status).toBe(1);
    expect(output).not.toContain(REFUSED);
    expect(output).toContain('--calls must be a positive integer: 0');
  }, 30_000);

  it('build-private-cases requires --name for a listed uid', () => {
    const { status, output } = run('memory-eval/build-private-cases.ts', ['--uid', LISTED], {
      [ALLOWLIST_ENV]: LISTED,
    });
    expect(status).toBe(1);
    expect(output).toContain('--name is required');
  }, 30_000);
});
