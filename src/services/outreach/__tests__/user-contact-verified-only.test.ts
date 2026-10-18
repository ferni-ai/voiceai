/**
 * user-contact.ts hands goal outreach, calendar briefings, onboarding and the
 * outreach admin the user's phone and email. profile.contactInfo is written by
 * saveContactInfo from whatever the model heard, so only the account's verified
 * phone (userReach) and Firebase-verified email may come out of it, and the
 * scheduled texts, calls and emails go only there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STRANGER = { phone: '+12125550199', email: 'stranger@example.com' };
const OWNER = { phone: '+18015550100', email: 'owner@example.com' };

const h = vi.hoisted(() => ({
  profile: { contactInfo: {} as Record<string, unknown> } as Record<string, unknown>,
  verifiedPhone: undefined as string | undefined,
  firebaseUser: null as null | { email?: string; emailVerified: boolean },
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
}));

vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => h.profile,
    saveProfile: async (p: Record<string, unknown>) => {
      h.profile = p;
    },
  }),
}));
vi.mock('../user-reach.js', () => ({
  userReach: async () =>
    h.verifiedPhone ? { phone: h.verifiedPhone } : { reason: 'no_verified_phone' },
}));
vi.mock('../../identity/firebase-auth.js', () => ({ getFirebaseUser: async () => h.firebaseUser }));
vi.mock('../../scheduling/reminder-scheduler.js', () => ({ createReminder: h.reminder }));

import {
  canReachUser,
  clearContactCache,
  getUserContactInfo,
  NO_VERIFIED_EMAIL,
  NO_VERIFIED_PHONE,
  scheduleCall,
  scheduleEmail,
  scheduleText,
  setUserContactInfo,
} from '../user-contact.js';

const UID = 'uid-user-contact';
const later = new Date('2026-10-20T15:00:00.000Z');
const addresses = () =>
  h.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress);

beforeEach(() => {
  clearContactCache();
  h.profile = { contactInfo: { ...STRANGER, timezone: 'America/Denver' } };
  h.verifiedPhone = undefined;
  h.firebaseUser = null;
});
afterEach(() => vi.clearAllMocks());

describe('only verified addresses come out of user-contact', () => {
  it('a saved (model-written) phone and email are never handed out or used', async () => {
    const info = await getUserContactInfo(UID);
    expect(info).toMatchObject({ timezone: 'America/Denver' });
    expect(info?.phone).toBeUndefined();
    expect(info?.email).toBeUndefined();
    expect(await canReachUser(UID, 'sms')).toBe(false);
    expect(await scheduleText(UID, 'hi', later)).toEqual({
      success: false,
      error: NO_VERIFIED_PHONE,
    });
    expect(await scheduleCall(UID, 'hi', later)).toEqual({
      success: false,
      error: NO_VERIFIED_PHONE,
    });
    expect(await scheduleEmail(UID, 's', 'hi', later)).toEqual({
      success: false,
      error: NO_VERIFIED_EMAIL,
    });
    expect(h.reminder).not.toHaveBeenCalled();
  });

  it('scheduled texts, calls and emails go to the verified phone and email', async () => {
    h.verifiedPhone = OWNER.phone;
    h.firebaseUser = { email: OWNER.email, emailVerified: true };
    await scheduleText(UID, 'hi', later);
    await scheduleCall(UID, 'hi', later);
    await scheduleEmail(UID, 's', 'hi', later);
    expect(addresses()).toEqual([OWNER.phone, OWNER.phone, OWNER.email]);
  });

  it('a number saved during this process is not handed out from the cache', async () => {
    h.verifiedPhone = OWNER.phone;
    await setUserContactInfo(UID, { phone: STRANGER.phone });
    expect((await getUserContactInfo(UID))?.phone).toBe(OWNER.phone);
  });

  it('an email Firebase has not verified is not used', async () => {
    h.firebaseUser = { email: OWNER.email, emailVerified: false };
    expect((await getUserContactInfo(UID))?.email).toBeUndefined();
  });
});
