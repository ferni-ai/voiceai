import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWLIST_ENV,
  REFUSED,
  allowedUids,
  assertAllowedUid,
  isAllowedUid,
} from '../allowed-uid.js';

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

/** Runs a script as a CLI with only the given env added; returns exit code and all output. */
function run(script: string, args: string[], env: Record<string, string>) {
  const clean = { ...process.env };
  delete clean[ALLOWLIST_ENV];
  delete clean.FERNI_USER_ID;
  delete clean.GOOGLE_CLOUD_PROJECT;
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(import.meta.dirname, '../..', script), ...args],
    { env: { ...clean, ...env }, encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL' }
  );
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

describe("scripts that read one person's data check the allowlist first", () => {
  const cases: Array<{ script: string; args: string[]; env: Record<string, string> }> = [
    {
      script: 'memory-eval/build-private-cases.ts',
      args: ['--uid', UNLISTED, '--name', NAME],
      env: {},
    },
    { script: 'full-user-dump.ts', args: [], env: { FERNI_USER_ID: UNLISTED } },
  ];

  for (const { script, args, env } of cases) {
    it(`${script} refuses with the allowlist unset, printing only the refusal`, () => {
      const { status, output } = run(script, args, env);
      expect(status).toBe(1);
      expect(output.trim()).toBe(REFUSED);
    }, 30_000);

    it(`${script} refuses an unlisted uid without printing the uid or the name`, () => {
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
