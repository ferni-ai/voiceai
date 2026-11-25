/**
 * The hold a data-only erasure puts on a sign-in (#3292): refused like a deleted account
 * while the erasure runs, then released. A release never reopens a deleted account, and a
 * failed erasure keeps the sign-in refused until an erasure begun after it fully succeeds
 * with none still running, so a retry gets the sign-in back.
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
  it('is refused like a deleted account until released erased, then accepted', async () => {
    const { check, hold, release } = revocationCheck();
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
    const held = hold('u-1');
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    expect(await check(token('u-1'), lookup, T0, true)).toBe('gone'); // strict included
    release(held, 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it('stays refused while another erasure of the same account still holds it', async () => {
    const { check, hold, release } = revocationCheck();
    const first = hold('u-1');
    const second = hold('u-1');
    release(first, 'erased');
    release(first, 'erased'); // a second release of the same hold changes nothing
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    release(second, 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it('is never released past an account deletion, before or after the hold', async () => {
    const { check, invalidate, hold, release } = revocationCheck();
    invalidate('u-1', 'gone', T0);
    release(hold('u-1'), 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    const held = hold('u-2');
    invalidate('u-2', 'gone', T0);
    release(held, 'erased');
    expect(await check(token('u-2'), lookup, T0)).toBe('gone');
  });

  it('keeps a revoke made during the hold once released', async () => {
    const { check, invalidate, hold, release } = revocationCheck();
    const held = hold('u-1');
    invalidate('u-1', 'revoked', T0);
    release(held, 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('revoked');
  });

  it('releasing a hold of another check, or one never made, changes nothing', async () => {
    const { check, release } = revocationCheck();
    release(revocationCheck().hold('u-1'), 'failed');
    release({ uid: 'u-1', seq: 1 }, 'failed');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });
});

describe('a failed data-only erasure', () => {
  it('stays refused after its release, and a retry that fully succeeds accepts it', async () => {
    const { check, hold, release } = revocationCheck();
    release(hold('u-1'), 'failed');
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    release(hold('u-1'), 'failed'); // a retry that fails too
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    release(hold('u-1'), 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it('is not cleared by a success that ends while another erasure still holds it', async () => {
    const { check, hold, release } = revocationCheck();
    release(hold('u-1'), 'failed');
    const retry = hold('u-1');
    const other = hold('u-1');
    release(retry, 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    release(other, 'erased'); // begun after the failure, and the last to end
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it.each([
    ['the failure', 'failed', 'erased'],
    ['the success', 'erased', 'failed'],
  ] as const)(
    'two at once, one fails, one succeeds, %s ending first: refused until a later success',
    async (_first, firstEnds, secondEnds) => {
      const { check, hold, release } = revocationCheck();
      const first = hold('u-1');
      const second = hold('u-1');
      release(first, firstEnds);
      release(second, secondEnds);
      expect(await check(token('u-1'), lookup, T0)).toBe('gone');
      release(hold('u-1'), 'erased');
      expect(await check(token('u-1'), lookup, T0)).toBe('ok');
    }
  );

  it('is not cleared by a later success while one that overlapped the failure still runs', async () => {
    const { check, hold, release } = revocationCheck();
    const overlapping = hold('u-1');
    release(hold('u-1'), 'failed');
    release(hold('u-1'), 'erased'); // begun after the failure, but another erasure still runs
    release(overlapping, 'erased'); // the last to end, but begun before the failure
    expect(await check(token('u-1'), lookup, T0)).toBe('gone');
    release(hold('u-1'), 'erased');
    expect(await check(token('u-1'), lookup, T0)).toBe('ok');
  });

  it('marks only its own account', async () => {
    const { check, hold, release } = revocationCheck();
    release(hold('u-1'), 'failed');
    expect(await check(token('u-2'), lookup, T0)).toBe('ok');
  });
});
