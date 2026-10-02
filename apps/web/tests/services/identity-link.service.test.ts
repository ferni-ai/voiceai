/**
 * Identity carry-over: after sign-in, the browser's earlier anonymous session
 * and device id are sent (with proof) so its memory follows the account.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  capturePriorIdentity,
  IDENTITY_LINK_PATH,
  linkPriorIdentity,
} from '../../src/services/identity-link.service';
import { STORAGE_KEYS } from '../../src/config/storage-keys';

function user(uid: string, isAnonymous: boolean, token: string): User {
  return { uid, isAnonymous, getIdToken: vi.fn().mockResolvedValue(token) } as unknown as User;
}

describe('identity carry-over', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, 'dev-1234-5678');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('captures the anonymous token and device id before sign-in', async () => {
    const prior = await capturePriorIdentity(user('anon', true, 'anon-token'));
    expect(prior).toEqual({ anonymousIdToken: 'anon-token', deviceId: 'dev-1234-5678' });
  });

  it('never captures a token for an already signed-in account', async () => {
    const prior = await capturePriorIdentity(user('acct', false, 'acct-token'));
    expect(prior.anonymousIdToken).toBeUndefined();
  });

  it('posts the earlier identity with the new account token', async () => {
    await linkPriorIdentity(
      { anonymousIdToken: 'anon-token', deviceId: 'dev-1234-5678' },
      user('acct', false, 'acct-token')
    );
    expect(fetchMock).toHaveBeenCalledWith(IDENTITY_LINK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer acct-token' },
      body: JSON.stringify({ anonymousIdToken: 'anon-token', deviceId: 'dev-1234-5678' }),
    });
  });

  it('does nothing when the signed-in user is anonymous or there is nothing to link', async () => {
    await linkPriorIdentity({ deviceId: 'dev-1234-5678' }, user('anon', true, 't'));
    await linkPriorIdentity({}, user('acct', false, 't'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network failures so sign-in is never blocked', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(
      linkPriorIdentity({ deviceId: 'd' }, user('acct', false, 't'))
    ).resolves.toBeUndefined();
  });
});
