/**
 * The Google Calendar token store must not re-read Firestore for a user who
 * has no calendar connected every time a context builder asks: one Peter
 * briefing asked 47 times, and each ask was a Firestore round trip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storeGet = vi.fn<(userId: string) => Promise<{ encrypted: string } | null>>();

vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    get: (userId: string) => storeGet(userId),
    setImmediate: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { getTokens, saveTokens, removeTokens, shutdownTokenStore } =
  await import('../google-calendar-token-store.js');

const TOKENS = { access_token: 'at', refresh_token: 'rt', expires_at: 1_900_000_000_000 };

describe('google-calendar-token-store getTokens', () => {
  beforeEach(async () => {
    await shutdownTokenStore();
    storeGet.mockReset();
    storeGet.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads Firestore once for repeated asks about an unconnected user', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await getTokens('user-none')).toBeNull();
    }
    expect(storeGet).toHaveBeenCalledTimes(1);
  });

  it('shares one read between concurrent first callers', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => getTokens('user-race')));
    expect(results).toEqual([null, null, null, null]);
    expect(storeGet).toHaveBeenCalledTimes(1);
  });

  it('asks Firestore again once the miss has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    await getTokens('user-later');
    vi.setSystemTime(new Date('2026-10-04T12:00:30Z'));
    await getTokens('user-later');
    expect(storeGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-04T12:01:01Z'));
    await getTokens('user-later');
    expect(storeGet).toHaveBeenCalledTimes(2);
  });

  it('returns tokens saved after a miss without waiting for the miss to expire', async () => {
    expect(await getTokens('user-connects')).toBeNull();
    await saveTokens('user-connects', TOKENS);
    expect(await getTokens('user-connects')).toMatchObject(TOKENS);
  });

  it('reads Firestore again after a disconnect instead of trusting an old miss', async () => {
    await getTokens('user-cycle');
    await removeTokens('user-cycle');
    await getTokens('user-cycle');
    expect(storeGet).toHaveBeenCalledTimes(2);
  });

  it('does not remember a hit as a miss', async () => {
    storeGet.mockResolvedValue({ encrypted: JSON.stringify(TOKENS) });
    expect(await getTokens('user-has')).toMatchObject(TOKENS);
    expect(await getTokens('user-has')).toMatchObject(TOKENS);
    expect(storeGet).toHaveBeenCalledTimes(1);
  });
});
