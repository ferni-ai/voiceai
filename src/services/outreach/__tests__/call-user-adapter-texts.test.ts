/**
 * The call-user port's outreach side: texts to the owner go through the guarded
 * sender (STOP, texts off), Ferni-initiated ones are held in quiet hours, and the
 * only email is the one Firebase verified.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  guarded: vi.fn(
    async (..._a: unknown[]) => ({ sent: true }) as { sent: boolean; reason?: string }
  ),
  zone: 'America/New_York' as string | undefined,
  user: null as null | { email?: string; emailVerified: boolean },
}));

vi.mock('../guarded-text.js', () => ({ sendGuardedText: h.guarded }));
vi.mock('../../../utils/caller-time-zone.js', () => ({ userTimeZone: () => h.zone }));
vi.mock('../../identity/firebase-auth.js', () => ({ getFirebaseUser: async () => h.user }));
vi.mock('../conversational-calls.js', () => ({ scheduleProactiveCall: vi.fn() }));
vi.mock('../user-reach.js', () => ({ userReach: async () => ({ phone: '+18015550100' }) }));

import { callUserAdapter, installCallUserPort } from '../call-user-adapter.js';
import { verifiedAddressFor } from '../../engagement/engagement-reach-port.js';

const NOON_NY = new Date('2026-10-15T16:00:00.000Z');
const ELEVEN_PM_NY = new Date('2026-10-16T03:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('textOwner', () => {
  it('sends through the guarded sender, as a message to the owner', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    expect(await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: false })).toEqual({
      sent: true,
    });
    expect(h.guarded).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'uid-1', body: 'hi', kind: 'message' })
    );
  });

  it('a STOP or texts-off held by the guard comes back as a reason to say', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    h.guarded.mockResolvedValueOnce({ sent: false, reason: 'opted-out' });
    const out = await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: true });
    expect(out).toEqual({ sent: false, reason: 'you replied STOP to my texts' });
  });

  it('Ferni-initiated texts are held in quiet hours; one they just asked for is not', async () => {
    vi.useFakeTimers({ now: ELEVEN_PM_NY });
    const unasked = await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: false });
    expect(unasked).toEqual({ sent: false, reason: "it's quiet hours where you are" });
    expect(h.guarded).not.toHaveBeenCalled();
    await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: true });
    expect(h.guarded).toHaveBeenCalledTimes(1);
  });
});

describe('verifiedEmail', () => {
  it('only an address Firebase verified', async () => {
    h.user = { email: 'owner@example.com', emailVerified: true };
    expect(await callUserAdapter.verifiedEmail!('uid-1')).toBe('owner@example.com');
    h.user = { email: 'owner@example.com', emailVerified: false };
    expect(await callUserAdapter.verifiedEmail!('uid-1')).toBeUndefined();
    expect(await callUserAdapter.verifiedEmail!('phone:+18015550100')).toBeUndefined();
  });
});

describe('installCallUserPort', () => {
  it('also installs the engagement port with the same verified-only reach', async () => {
    h.user = { email: 'owner@example.com', emailVerified: true };
    installCallUserPort();
    expect(await verifiedAddressFor('uid-1', 'sms')).toBe('+18015550100');
    expect(await verifiedAddressFor('uid-1', 'email')).toBe('owner@example.com');
  });
});
