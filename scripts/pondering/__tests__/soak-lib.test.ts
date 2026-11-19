import { describe, expect, it } from 'vitest';
import {
  assertSoakAllowed,
  isSoakAllowed,
  parseSoakArgs,
  serviceHasPondering,
} from '../soak-lib.js';

// A fictional listed caller, set through the same env the script reads.
const OWNER = 'testOwnerUid0000000000000000';
const env = { MEMORY_EVAL_ALLOWED_UIDS: OWNER };

describe('soak allowlist', () => {
  it('admits listed callers and the voice-eval seed users only', () => {
    expect(isSoakAllowed(OWNER, env)).toBe(true);
    expect(isSoakAllowed('voice-eval-sam', env)).toBe(true);
    expect(isSoakAllowed('voice-eval-recall-20261010120000-ab12', env)).toBe(true);
    for (const other of ['someone-else-uid', 'voice-eval-', 'xvoice-eval-sam', `${OWNER}x`, ''])
      expect(isSoakAllowed(other, env), other).toBe(false);
  });

  it('admits no real caller when the allowlist is unset', () => {
    expect(isSoakAllowed(OWNER, {})).toBe(false);
    expect(isSoakAllowed('voice-eval-sam', {})).toBe(true);
  });

  it('refuses a run that names anyone else, before anything is read, without naming them', () => {
    expect(() => assertSoakAllowed(['voice-eval-sam', 'real-customer-123'], env)).toThrow(
      new Error('uid not in allowlist')
    );
    expect(() => parseSoakArgs(['--uid', 'real-customer-123'], env)).toThrow(
      /^uid not in allowlist$/
    );
  });
});

describe('soak arguments', () => {
  it('is a dry run for a listed caller unless told otherwise', () => {
    const args = parseSoakArgs(['--uid', OWNER], env);
    expect(args).toMatchObject({ uids: [OWNER], write: false, purge: false });
  });

  it('has no default caller: it needs --uid, --eval-users or --job', () => {
    expect(() => parseSoakArgs([], env)).toThrow(/--uid/);
    expect(parseSoakArgs(['--job'], env)).toMatchObject({ uids: [], job: true });
  });

  it('reads the switches', () => {
    const args = parseSoakArgs(['--eval-users', '--eval-limit', '5', '--write'], env);
    expect(args).toMatchObject({
      uids: [],
      evalUsers: true,
      evalLimit: 5,
      write: true,
    });
  });

  it('will not write and purge in one run, or take unknown flags', () => {
    expect(() => parseSoakArgs(['--write', '--purge'], env)).toThrow(/separate/);
    expect(() => parseSoakArgs(['--job', '--write'], env)).toThrow(/dry run only/);
    expect(() => parseSoakArgs(['--all-users'], env)).toThrow(/Unknown/);
  });
});

describe('prod check', () => {
  const service = (env: Array<{ name: string; value?: string }>) => ({
    spec: { template: { spec: { containers: [{ env }] } } },
  });

  it('blocks the write when prod has PONDERING on, or set from a secret', () => {
    expect(serviceHasPondering(service([{ name: 'PONDERING', value: 'on' }]))).toBe(true);
    expect(serviceHasPondering(service([{ name: 'PONDERING' }]))).toBe(true);
  });

  it('allows it when PONDERING is unset or off', () => {
    expect(serviceHasPondering(service([{ name: 'OTHER', value: 'on' }]))).toBe(false);
    expect(serviceHasPondering(service([{ name: 'PONDERING', value: 'off' }]))).toBe(false);
    expect(serviceHasPondering({})).toBe(false);
  });
});
