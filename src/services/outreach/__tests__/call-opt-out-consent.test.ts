/**
 * "Don't call me again" on a call (recordCallOptOut) also lands in the one
 * consent record when MESSAGING_PIPELINE is on, and only then.
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

  it('flag off: only the old do-not-call list, as today', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    expect(await recordCallOptOut(PHONE, { callId: 'c1', requesterUserId: 'owner' })).toBe(true);
    expect(writeOptOut).not.toHaveBeenCalled();
  });
});
