import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin', () => ({
  default: { apps: [{}], auth: () => ({ getUser }) },
}));

import { getFirebaseUserOrThrow } from '../firebase-auth.js';

const failWith = (code: string) => {
  getUser.mockImplementation(async () => {
    throw Object.assign(new Error(code), { code });
  });
};

describe('getFirebaseUserOrThrow', () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it('is null when Firebase has no such user', async () => {
    failWith('auth/user-not-found');
    expect(await getFirebaseUserOrThrow('gone')).toBeNull();
  });

  it('is null for an id Firebase could never have issued (device ids, over 128 characters)', async () => {
    failWith('auth/invalid-uid');
    expect(await getFirebaseUserOrThrow(`device:${'x'.repeat(130)}`)).toBeNull();
  });

  it('throws on any other failure, so erasure fails instead of skipping keys', async () => {
    failWith('auth/internal-error');
    await expect(getFirebaseUserOrThrow('u-1')).rejects.toThrow('auth/internal-error');
  });
});
