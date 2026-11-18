/**
 * The hold a data-only erasure puts on a sign-in (#3292): refused like a deleted account
 * while the erasure runs, then restored, and a restore never reopens a deleted account.
 */
import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log, getLogger: () => log }));

import { revocationCheck, type AccountRecord } from '../token-revocation.js';

const T0 = Date.parse('2026-11-18T12:00:00.000Z');
const MINUTE = 60_000;
const token = (uid: string) => ({
  uid,
  auth_time: (T0 - 10 * MINUTE) / 1000,
  firebase: { sign_in_provider: 'password' },
});
const live: AccountRecord = { disabled: false, providerData: [{ providerId: 'password' }] };
const lookup = async () => live;

describe('a sign-in held during a data-only erasure', () => {
  it('is refused like a deleted account until it is restored, then accepted', async () => {
    const { check, invalidate, restore } = revocationCheck();
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
    invalidate('u-1', 'erasing', T0);
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    expect(await check(token('u-1'), lookup, T0, true)).toBe('gone'); // strict included
    restore('u-1');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it('stays refused while another erasure of the same account still holds it', async () => {
    const { check, invalidate, restore } = revocationCheck();
    invalidate('u-1', 'erasing', T0);
    invalidate('u-1', 'erasing', T0);
    restore('u-1');
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    restore('u-1');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it('is never restored past an account deletion, before or after the hold', async () => {
    const { check, invalidate, restore } = revocationCheck();
    invalidate('u-1', 'gone', T0);
    invalidate('u-1', 'erasing', T0);
    restore('u-1');
    restore('u-1'); // however many restores follow
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    invalidate('u-2', 'erasing', T0);
    invalidate('u-2', 'gone', T0);
    restore('u-2');
    restore('u-2');
    expect(await check(token('u-2'), lookup, T0)).toBe('gone');
  });

  it('keeps a revoke made during the hold once restored', async () => {
    const { check, invalidate, restore } = revocationCheck();
    invalidate('u-1', 'erasing', T0);
    invalidate('u-1', 'revoked', T0);
    restore('u-1');
    expect(await check(token('u-1'), lookup, T0)).toBe('revoked');
  });

  it('restoring an account that was never held changes nothing', async () => {
    const { check, restore } = revocationCheck();
    restore('u-1');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });
});
