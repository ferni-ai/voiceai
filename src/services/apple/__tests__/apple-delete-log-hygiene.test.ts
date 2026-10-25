/**
 * An Apple account-delete notification whose erasure fails must not put the error's
 * message (which can name the person: an email, a phone profile's id) in a log line,
 * in Firestore, or in the result the webhook route logs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FAKE_EMAIL = 'someone@example.com';

const logged = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => ({ ...logged, child: () => logged }),
}));

vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async () => ({
    payload: { sub: 'apple-sub-1', events: JSON.stringify({ 'account-delete': {} }) },
  }),
}));

const updates = vi.hoisted((): unknown[] => []);
vi.mock('../../superhuman/firestore-utils.js', () => ({
  cleanForFirestore: <T>(v: T): T => v,
  getFirestoreDb: () => ({
    collection: () => ({
      where: () => ({
        limit: () => ({ get: async () => ({ empty: false, docs: [{ id: 'u-1' }] }) }),
      }),
      doc: () => ({ update: async (data: unknown) => void updates.push(data) }),
    }),
  }),
}));

const deleteAllData = vi.hoisted(() => vi.fn());
vi.mock('../../data-export.js', () => ({ getDataExportService: () => ({ deleteAllData }) }));
const deleteFirebaseUser = vi.hoisted(() => vi.fn());
vi.mock('../../identity/firebase-auth.js', () => ({ deleteFirebaseUser }));

import { processAppleNotification } from '../apple-signin-notifications.js';

describe('Apple account-delete failure', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_SIGNIN_SERVICES_ID', 'com.example.services');
    updates.length = 0;
    Object.values(logged).forEach((fn) => fn.mockClear());
    deleteAllData.mockRejectedValue(
      Object.assign(new Error(`No document to update: waitlist/${FAKE_EMAIL}`), { code: 5 })
    );
    deleteFirebaseUser.mockResolvedValue(true);
  });

  it('logs, stores and returns the error code, never the message', async () => {
    const result = await processAppleNotification('signed.jwt.token');

    expect(result).toMatchObject({ success: false, eventType: 'account-delete', error: 'Error:5' });
    expect(updates).toContainEqual(expect.objectContaining({ deletionError: 'Error:5' }));
    const lines = JSON.stringify([
      ...Object.values(logged).flatMap((fn) => fn.mock.calls),
      updates,
      result,
    ]);
    expect(lines).toContain('Error:5'); // the failure is still reported
    expect(lines).not.toContain(FAKE_EMAIL);
    expect(lines).not.toContain('No document to update');
  });

  it("logs a failed Firebase user deletion's code, never its message", async () => {
    deleteAllData.mockResolvedValue({});
    deleteFirebaseUser.mockRejectedValue(
      Object.assign(new Error(`could not delete ${FAKE_EMAIL}`), { code: 'auth/internal-error' })
    );
    expect(await processAppleNotification('signed.jwt.token')).toMatchObject({ success: true });
    expect(logged.warn).toHaveBeenCalledWith(
      { error: 'Error:auth/internal-error', userId: 'u-1...' },
      'Firebase user deletion failed (non-fatal)'
    );
    expect(JSON.stringify(logged.warn.mock.calls)).not.toContain(FAKE_EMAIL);
  });
});
