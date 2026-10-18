/**
 * proactive/outreach/service.ts is what the scheduling tools, the chat executor
 * and the outreach routes use to reach the owner. profile.contactInfo is written
 * by saveContactInfo from whatever the model heard, so a saved phone or email
 * with no verified reach must lead to 0 sends, and getUserContactInfo must not
 * hand the saved ones out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STRANGER = { phone: '+12125550199', email: 'stranger@example.com' };

const h = vi.hoisted(() => ({
  sms: vi.fn(async (..._a: unknown[]) => 'sent'),
  email: vi.fn(async (..._a: unknown[]) => 'sent'),
  twilioCall: vi.fn(async (..._a: unknown[]) => ({ success: true, callSid: 'CA1' })),
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
}));

vi.mock('../../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => ({ contactInfo: { ...STRANGER, timezone: 'America/Denver' } }),
    saveProfile: async () => undefined,
  }),
}));
vi.mock('../../../../../services/communication-service.js', () => ({
  sendSMS: h.sms,
  sendEmail: h.email,
}));
vi.mock('../../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: h.twilioCall,
}));
vi.mock('../../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: h.reminder,
  startReminderScheduler: () => undefined,
}));

import { setCallUserPort } from '../call-user-port.js';
import {
  callUser,
  canReachUser,
  emailUser,
  getUserContactInfo,
  scheduleCall,
  scheduleEmail,
  scheduleText,
  setUserContactInfo,
  textUser,
} from '../service.js';

const UID = 'uid-service-verified';
const later = new Date('2026-10-20T15:00:00.000Z');
const textOwner = vi.fn(async (..._a: unknown[]) => ({ sent: true }));

beforeEach(() => {
  // The port is installed, but this account has no verified phone or email.
  setCallUserPort({
    verifiedPhone: async () => undefined,
    verifiedEmail: async () => undefined,
    textOwner,
    call: vi.fn(),
  });
});
afterEach(() => {
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('a saved phone or email with no verified reach', () => {
  it('leads to 0 sends on every path', async () => {
    await setUserContactInfo(UID, STRANGER); // what saveContactInfo does
    const results = [
      await textUser(UID, 'hi'),
      await emailUser(UID, 's', 'hi'),
      await callUser(UID, 'hi'),
      await scheduleText(UID, 'hi', later),
      await scheduleCall(UID, 'hi', later),
      await scheduleEmail(UID, 's', 'hi', later),
    ];
    expect(results.every((r) => !r.success)).toBe(true);
    expect(h.sms).not.toHaveBeenCalled();
    expect(textOwner).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
    expect(h.twilioCall).not.toHaveBeenCalled();
    expect(h.reminder).not.toHaveBeenCalled();
    expect(await canReachUser(UID, 'sms')).toBe(false);
    expect(await canReachUser(UID, 'email')).toBe(false);
  });

  it('is never handed out by getUserContactInfo, cached or not', async () => {
    const info = await getUserContactInfo(UID);
    expect(info?.phone).toBeUndefined();
    expect(info?.email).toBeUndefined();
  });
});

describe('callUser with a verified phone', () => {
  it('tells the shared call sender whose call it is (it re-checks own number or grant)', async () => {
    setCallUserPort({
      verifiedPhone: async () => '+15550000111',
      verifiedEmail: async () => undefined,
      textOwner,
      call: vi.fn(),
    });
    await callUser(UID, 'hi');
    expect(h.twilioCall).toHaveBeenCalledWith(
      '+15550000111',
      'hi',
      expect.anything(),
      expect.objectContaining({ ownerUid: UID })
    );
  });
});
