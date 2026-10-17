import { describe, expect, it } from 'vitest';
import {
  SOAK_OWNER_UID,
  assertSoakAllowed,
  isSoakAllowed,
  parseSoakArgs,
  serviceHasPondering,
} from '../soak-lib.js';

describe('soak allowlist', () => {
  it('admits Seth and the voice-eval seed users only', () => {
    expect(isSoakAllowed(SOAK_OWNER_UID)).toBe(true);
    expect(isSoakAllowed('voice-eval-sam')).toBe(true);
    expect(isSoakAllowed('voice-eval-recall-20261010120000-ab12')).toBe(true);
    for (const other of [
      'someone-else-uid',
      'voice-eval-',
      'xvoice-eval-sam',
      `${SOAK_OWNER_UID}x`,
      '',
    ])
      expect(isSoakAllowed(other), other).toBe(false);
  });

  it('refuses a run that names anyone else, before anything is read', () => {
    expect(() => assertSoakAllowed(['voice-eval-sam', 'real-customer-123'])).toThrow(
      /real-customer-123/
    );
    expect(() => parseSoakArgs(['--uid', 'real-customer-123'])).toThrow(/allowlist/);
  });
});

describe('soak arguments', () => {
  it('is a dry run for Seth unless told otherwise', () => {
    const args = parseSoakArgs([]);
    expect(args).toMatchObject({ uids: [SOAK_OWNER_UID], write: false, purge: false });
  });

  it('reads the switches', () => {
    const args = parseSoakArgs(['--eval-users', '--eval-limit', '5', '--write']);
    expect(args).toMatchObject({
      uids: [],
      evalUsers: true,
      evalLimit: 5,
      write: true,
    });
  });

  it('will not write and purge in one run, or take unknown flags', () => {
    expect(() => parseSoakArgs(['--write', '--purge'])).toThrow(/separate/);
    expect(() => parseSoakArgs(['--all-users'])).toThrow(/Unknown/);
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
