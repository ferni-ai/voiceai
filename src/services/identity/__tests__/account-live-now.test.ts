/**
 * accountLiveNow answers from an uncached Firebase lookup, and a failed lookup is never "live".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('../firebase-auth.js', () => ({ getFirebaseUserOrThrow: lookup }));

import { accountLiveNow } from '../account-live-now.js';

const UID = 'Wd3Lk7Pn1Xs5Qv9Mb2Hr6Tc8Fj4Y';

beforeEach(() => {
  lookup.mockReset();
});

describe('accountLiveNow', () => {
  it('is live for an enabled Firebase user', async () => {
    lookup.mockResolvedValue({ uid: UID, disabled: false });
    expect(await accountLiveNow(UID)).toBe('live');
    expect(lookup).toHaveBeenCalledWith(UID);
  });

  it('is gone when Firebase has no such user', async () => {
    lookup.mockResolvedValue(null);
    expect(await accountLiveNow(UID)).toBe('gone');
  });

  it('is disabled for a disabled user', async () => {
    lookup.mockResolvedValue({ uid: UID, disabled: true });
    expect(await accountLiveNow(UID)).toBe('disabled');
  });

  it('is unavailable, not live, when the lookup fails', async () => {
    lookup.mockImplementation(async () => {
      throw Object.assign(new Error('deadline'), { code: 'app/network-timeout' });
    });
    expect(await accountLiveNow(UID)).toBe('unavailable');
  });
});
