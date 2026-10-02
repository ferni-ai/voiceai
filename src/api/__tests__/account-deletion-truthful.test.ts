/**
 * Account deletion must be recursive and the response truthful:
 * "all associated data have been deleted" only when nothing is left.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountDeletionReport } from '../../services/memory-control/index.js';
import { fakeRequest, fakeResponse } from './http-test-utils.js';

const h = vi.hoisted(() => ({
  report: null as unknown,
  deleteUserAccountData: vi.fn(),
  deleteProfile: vi.fn(),
}));

vi.mock('../../services/memory-control/index.js', () => ({
  deleteUserAccountData: h.deleteUserAccountData,
}));
vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async () => ({ userId: 'user-a' })),
}));
vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn(async () => undefined),
  recordDataAccess: vi.fn(async () => undefined),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  deleteFirebaseUser: vi.fn(async () => false),
  getFirebaseUser: vi.fn(async () => null),
}));
vi.mock('../../services/wellbeing-tracking/persistence.js', () => ({
  deleteWellbeingData: vi.fn(async () => false),
}));
vi.mock('../../memory/index.js', () => ({
  getDefaultStore: () => ({ initialize: async () => undefined, deleteProfile: h.deleteProfile }),
}));

import { sendAccountDeletionResult, incompleteParts } from '../account-deletion-response.js';
import { handleGDPRRoutes } from '../gdpr-routes.js';
import handleAccountRoutes from '../account-routes.js';

function report(overrides: Partial<AccountDeletionReport> = {}): AccountDeletionReport {
  return {
    complete: true,
    existed: true,
    firestore: { bogle_users: 'deleted', users: 'absent' },
    embeddings: 3,
    graphRecords: 0,
    storage: {},
    domains: {},
    errors: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendAccountDeletionResult', () => {
  it('says everything was deleted only when complete', () => {
    const res = fakeResponse();
    sendAccountDeletionResult(res.res, report(), { firebaseDeleted: true });
    expect(res.status()).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      message: 'Your account and all associated data have been deleted.',
    });
  });

  it('returns 500 and lists what is left when incomplete, without internal error text', () => {
    const res = fakeResponse();
    const partial = report({
      complete: false,
      firestore: { bogle_users: 'failed', users: 'deleted' },
      storage: { 'b/voice-messages/u/': 'failed' },
      errors: ['firestore bogle_users: secret internals', 'vectors: down'],
    });
    sendAccountDeletionResult(res.res, partial, { firebaseDeleted: true });
    expect(res.status()).toBe(500);
    const body = res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.incomplete).toEqual([
      'firestore:bogle_users',
      'storage:b/voice-messages/u/',
      'vectors',
    ]);
    expect(JSON.stringify(body)).not.toContain('secret internals');
  });

  it('reports when there was nothing to delete', () => {
    const res = fakeResponse();
    sendAccountDeletionResult(res.res, report({ existed: false }), { firebaseDeleted: false });
    expect(res.json()).toMatchObject({
      success: false,
      message: 'No account data found to delete.',
    });
  });

  it('incompleteParts dedupes', () => {
    expect(incompleteParts(report({ errors: ['graph: a', 'graph: b'] }))).toEqual(['graph']);
  });
});

describe('DELETE /api/gdpr/account', () => {
  const send = async (): Promise<ReturnType<typeof fakeResponse>> => {
    const req = fakeRequest({
      method: 'DELETE',
      url: '/api/gdpr/account',
      body: JSON.stringify({ confirmation: 'DELETE_MY_DATA' }),
    });
    const res = fakeResponse();
    await handleGDPRRoutes(req, res.res, '/api/gdpr/account');
    return res;
  };

  it('deletes recursively (never the top-level-only deleteProfile)', async () => {
    h.deleteUserAccountData.mockResolvedValue(report());
    const res = await send();
    expect(h.deleteUserAccountData).toHaveBeenCalledWith('user-a');
    expect(h.deleteProfile).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({ success: true });
  });

  it('does not claim success when the deletion was incomplete', async () => {
    h.deleteUserAccountData.mockResolvedValue(
      report({ complete: false, errors: ['vectors: down'] })
    );
    const res = await send();
    expect(res.status()).toBe(500);
    expect(res.json()).toMatchObject({ success: false });
  });
});

describe('DELETE /api/account', () => {
  const send = async (): Promise<ReturnType<typeof fakeResponse>> => {
    const req = fakeRequest({
      method: 'DELETE',
      url: '/api/account',
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
    });
    const res = fakeResponse();
    await handleAccountRoutes(req, res.res, '/api/account');
    return res;
  };

  it('deletes recursively and reports truthfully', async () => {
    h.deleteUserAccountData.mockResolvedValue(report());
    expect((await send()).json()).toMatchObject({ success: true });
    expect(h.deleteProfile).not.toHaveBeenCalled();

    h.deleteUserAccountData.mockResolvedValue(
      report({ complete: false, firestore: { bogle_users: 'failed' } })
    );
    const res = await send();
    expect(res.status()).toBe(500);
    expect(res.json()).toMatchObject({ success: false, incomplete: ['firestore:bogle_users'] });
  });
});
