/**
 * deleteFirebaseUser runs on every account deletion. Its failure log carries the
 * error's code and a truncated uid, never the Firebase message, which can name
 * the account (an email or a phone number).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteUser = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin', () => ({
  default: { apps: [{}], auth: () => ({ deleteUser }) },
}));

const logged = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => ({ ...logged, child: () => logged }),
}));

import { deleteFirebaseUser } from '../firebase-auth.js';

const UID = 'test-uid-0123456789abcdef';

describe('deleteFirebaseUser', () => {
  beforeEach(() => {
    deleteUser.mockReset();
    logged.error.mockClear();
  });

  it("logs the failure's code and a truncated uid, never the message", async () => {
    deleteUser.mockRejectedValue(
      Object.assign(new Error('There is no user record for someone@example.com'), {
        code: 'auth/internal-error',
      })
    );
    expect(await deleteFirebaseUser(UID)).toBe(false);
    expect(logged.error).toHaveBeenCalledWith(
      { error: 'Error:auth/internal-error', uid: 'test-uid...' },
      'Failed to delete Firebase user'
    );
    const lines = JSON.stringify(logged.error.mock.calls);
    expect(lines).not.toContain('someone@example.com');
    expect(lines).not.toContain(UID);
  });
});
