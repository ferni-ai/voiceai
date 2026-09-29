/**
 * POST /api/auth/migrate must take the destination account from a verified
 * Firebase token, never from the request body.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRequest, fakeResponse } from './http-test-utils.js';

const { mockVerify, mockMigrate } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockMigrate: vi.fn(),
}));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: mockVerify,
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object' && !('expired' in r),
}));

vi.mock('../../services/user-migration.js', () => ({
  getMigratedUid: vi.fn(),
  isAlreadyMigrated: vi.fn(),
  migrateUserData: mockMigrate,
  validateMigrationRequest: () => ({ valid: true }),
}));

vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false }));

import { handleMigrationRoutes } from '../migration-routes.js';

async function migrate(body: Record<string, string>, headers: Record<string, string> = {}) {
  const out = fakeResponse();
  await handleMigrationRoutes(
    fakeRequest({
      url: '/api/auth/migrate',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    out.res,
    '/api/auth/migrate'
  );
  return out;
}

describe('POST /api/auth/migrate', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockMigrate.mockReset();
    mockMigrate.mockResolvedValue({ success: true, conversationsMigrated: 2 });
  });

  it('rejects a body firebaseUid without a token', async () => {
    const out = await migrate({ deviceId: 'device:abc', firebaseUid: 'victim-uid' });
    expect(out.status()).toBe(401);
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    mockVerify.mockResolvedValue(null);
    const out = await migrate({ deviceId: 'device:abc' }, { authorization: 'Bearer bad' });
    expect(out.status()).toBe(401);
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('rejects a body uid that differs from the token', async () => {
    mockVerify.mockResolvedValue({ uid: 'alice', email: 'a@x.example' });
    const out = await migrate(
      { deviceId: 'device:abc', firebaseUid: 'mallory' },
      { authorization: 'Bearer good' }
    );
    expect(out.status()).toBe(403);
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('migrates into the token uid', async () => {
    mockVerify.mockResolvedValue({ uid: 'alice', email: 'a@x.example' });
    const out = await migrate(
      { deviceId: 'device:abc', firebaseUid: 'alice' },
      { authorization: 'Bearer good' }
    );
    expect(out.status()).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith('good');
    expect(mockMigrate).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device:abc', firebaseUid: 'alice', email: 'a@x.example' })
    );
  });
});
