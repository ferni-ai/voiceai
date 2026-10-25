/**
 * "Don't call me again" on a call (recordCallOptOut) also lands in the one
 * consent record, flag or not, so no opt-out is lost before arming.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const writeOptOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../messaging/consent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../messaging/consent.js')>()),
  writeOptOut,
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({ doc: () => ({ set: async () => undefined }) }),
  }),
}));

import { recordCallOptOut } from '../call-retry.js';
import { phoneHash } from '../checkin-replies.js';

const PHONE = '+12025550188';

describe('recordCallOptOut and consent/{phoneHash}', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    writeOptOut.mockClear();
  });

  it('flag on: writes a call opt-out by phone hash, from the call', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    await recordCallOptOut('(202) 555-0188', { callId: 'c1', requesterUserId: 'owner' });
    expect(writeOptOut).toHaveBeenCalledWith(phoneHash(PHONE), 'call', 'voice-call');
  });

  it('flag off: still recorded in consent (nothing reads it until the flag is armed)', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    expect(await recordCallOptOut(PHONE, { callId: 'c1', requesterUserId: 'owner' })).toBe(true);
    expect(writeOptOut).toHaveBeenCalledWith(phoneHash(PHONE), 'call', 'voice-call');
  });

  it('a failed consent write never fails the do-not-call request (it is on the old list)', async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    writeOptOut.mockRejectedValueOnce(new Error('unavailable'));
    expect(await recordCallOptOut(PHONE, { callId: 'c1', requesterUserId: 'owner' })).toBe(true);
  });
});
