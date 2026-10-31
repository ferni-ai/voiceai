/**
 * Revoking or deleting an account refuses its tokens at once (#3208 review): the
 * account check's cache entry is invalidated, so the next normal (cached) check fails
 * immediately instead of after the cache minute.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifyIdToken: vi.fn(async (token: string) => ({
    uid: token,
    auth_time: Math.floor(Date.now() / 1000) - 60,
    exp: 4102444800,
    firebase: { sign_in_provider: 'password' },
  })),
  getUser: vi.fn(async () => ({ disabled: false, providerData: [{ providerId: 'password' }] })),
  revokeRefreshTokens: vi.fn(async () => undefined),
  deleteUser: vi.fn(async () => undefined),
}));
vi.mock('firebase-admin', () => ({ default: { apps: [{}], auth: () => auth } }));

const { verifyFirebaseToken, revokeRefreshTokens, deleteFirebaseUser } =
  await import('../firebase-auth.js');

beforeEach(() => vi.clearAllMocks());

describe('invalidating the account check', () => {
  it('after revokeRefreshTokens, the next check refuses the token with no lookup', async () => {
    expect(await verifyFirebaseToken('uid-revoke-1')).not.toBeNull(); // cached live
    expect(await verifyFirebaseToken('uid-revoke-1')).not.toBeNull(); // the fresh entry
    expect(auth.getUser).toHaveBeenCalledTimes(1);

    expect(await revokeRefreshTokens('uid-revoke-1')).toBe(true);

    expect(await verifyFirebaseToken('uid-revoke-1')).toBeNull();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('after deleteFirebaseUser, the next check refuses the token with no lookup', async () => {
    expect(await verifyFirebaseToken('uid-delete-1')).not.toBeNull();

    expect(await deleteFirebaseUser('uid-delete-1')).toBe(true);

    expect(await verifyFirebaseToken('uid-delete-1')).toBeNull();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });
});
