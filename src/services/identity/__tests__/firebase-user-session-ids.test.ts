/**
 * getFirebaseUser does not look up session ids that name no account.
 *
 * anon: (an unrecognised caller) and onbehalf: (a call placed for someone) ids
 * are minted per session. Each was looked up in Firebase Auth, failed, and was
 * logged as "Failed to get Firebase user" (prod logs, 2026-10-18).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin', () => ({
  default: { apps: [{}], auth: () => ({ getUser }) },
}));
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));

import { getFirebaseUser } from '../firebase-auth.js';

beforeEach(() => {
  getUser.mockReset();
  vi.clearAllMocks();
});

describe('getFirebaseUser session ids', () => {
  it.each(['onbehalf:+15551234567', 'anon:session-123', ' anon:padded '])(
    '%s is null without a lookup or an error',
    async (uid) => {
      getUser.mockRejectedValue(
        Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
      );
      expect(await getFirebaseUser(uid)).toBeNull();
      expect(getUser).not.toHaveBeenCalled();
      expect(log.error).not.toHaveBeenCalled();
    }
  );

  it('still looks up a real uid', async () => {
    getUser.mockResolvedValue({ uid: 'aliceUid' });
    expect(await getFirebaseUser('aliceUid')).toEqual({ uid: 'aliceUid' });
    expect(getUser).toHaveBeenCalledWith('aliceUid');
  });
});
