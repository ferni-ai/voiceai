/**
 * The web tells the server the person's time zone so check-ins and outreach
 * arrive at their local hour. It remembers the zone it last sent, so it only
 * sends again when the zone changes. It used to remember the zone even when
 * the send was skipped (no signed-in user id yet) or failed, so the server
 * never heard it and check-ins could arrive at the wrong hour. Now it only
 * remembers a zone the server accepted, and a later start tries again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock('../../src/utils/api.js', () => ({ apiPost: mocks.apiPost }));

import { detectAndSyncTimezone, detectTimezone } from '../../src/services/timezone.service.js';

const CACHE_KEY = 'ferni_user_timezone';
const USER_ID_KEY = 'ferni_user_id';

const cachedZone = (): string | undefined => {
  const raw = localStorage.getItem(CACHE_KEY);
  return raw ? (JSON.parse(raw) as { timezone: string }).timezone : undefined;
};

beforeEach(() => {
  localStorage.clear();
  mocks.apiPost.mockReset();
  mocks.apiPost.mockResolvedValue({ ok: true, status: 200 });
});

describe('detectAndSyncTimezone', () => {
  it('without a user id: sends nothing, remembers nothing, and syncs once the id exists', async () => {
    await detectAndSyncTimezone();

    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(cachedZone()).toBeUndefined();

    localStorage.setItem(USER_ID_KEY, 'uid-42');
    await detectAndSyncTimezone();

    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/user/timezone', {
      userId: 'uid-42',
      timezone: detectTimezone(),
    });
    expect(cachedZone()).toBe(detectTimezone());
  });

  it('a rejected sync is not remembered, so the next start sends it again', async () => {
    localStorage.setItem(USER_ID_KEY, 'uid-42');
    mocks.apiPost.mockResolvedValueOnce({ ok: false, status: 503, error: 'unavailable' });

    await detectAndSyncTimezone();

    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(cachedZone()).toBeUndefined();

    await detectAndSyncTimezone();

    expect(mocks.apiPost).toHaveBeenCalledTimes(2);
    expect(cachedZone()).toBe(detectTimezone());
  });

  it('a sync that throws is not remembered', async () => {
    localStorage.setItem(USER_ID_KEY, 'uid-42');
    mocks.apiPost.mockRejectedValueOnce(new Error('network down'));

    await detectAndSyncTimezone();

    expect(cachedZone()).toBeUndefined();
  });

  it('an accepted sync is remembered', async () => {
    localStorage.setItem(USER_ID_KEY, 'uid-42');

    await expect(detectAndSyncTimezone()).resolves.toBe(detectTimezone());

    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(cachedZone()).toBe(detectTimezone());
  });

  it('an unchanged, already-synced zone sends nothing', async () => {
    localStorage.setItem(USER_ID_KEY, 'uid-42');
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timezone: detectTimezone(),
        offset: 0,
        lastDetected: '2026-11-01T00:00:00Z',
      })
    );

    await detectAndSyncTimezone();

    expect(mocks.apiPost).not.toHaveBeenCalled();
  });
});
