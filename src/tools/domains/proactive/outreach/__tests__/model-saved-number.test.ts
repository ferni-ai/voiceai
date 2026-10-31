/**
 * saveContactInfo stores whatever number the model heard, so it may be anyone's.
 * sendImmediateOutreach and scheduleProactiveReminder used to text or ring that
 * number with no read-back and no yes. They now reach only the verified phone on
 * the account (the call-user port, as callUser does), and refuse without one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const STRANGER = '+12125550199';
const OWNER = '+18015550100';

const sent = vi.hoisted(() => ({
  sms: vi.fn(async (..._a: unknown[]) => 'sent'),
  email: vi.fn(async (..._a: unknown[]) => 'sent'),
  twilioCall: vi.fn(async (..._a: unknown[]) => ({ success: true, callSid: 'CA1' })),
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
  profile: { preferences: {} as Record<string, unknown> },
}));

vi.mock('../../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => sent.profile,
    saveProfile: async (p: { preferences: Record<string, unknown> }) => {
      sent.profile.preferences = p.preferences;
    },
  }),
}));
vi.mock('../../../../../services/communication-service.js', () => ({
  sendSMS: sent.sms,
  sendEmail: sent.email,
}));
vi.mock('../../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: sent.twilioCall,
}));
vi.mock('../../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: sent.reminder,
}));
vi.mock('../../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: async () => undefined,
}));

import type { ToolContext } from '../../../../registry/types.js';
import { getAgentToUserOutreachDefinitions, getUserContactInfo } from '../agent-to-user.js';
import { setCallUserPort } from '../call-user-port.js';

const ctx: ToolContext = {
  userId: 'uid-model-number',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
};
const run = async (id: string, args: Record<string, unknown>) =>
  String(
    await getAgentToUserOutreachDefinitions()
      .find((d) => d.id === id)!
      .create(ctx)
      .execute(args, { ctx: { userData: { userId: ctx.userId, verifiedCaller: true } } })
  );
const portCall = vi.fn(async (..._a: unknown[]) => ({ success: true, status: 'initiated' }));
const guarded = vi.fn(async (..._a: unknown[]) => ({ sent: true }));
const withVerified = (phone: string | undefined, email?: string) =>
  setCallUserPort({
    verifiedPhone: async () => phone,
    verifiedEmail: async () => email,
    textOwner: guarded,
    call: portCall,
  });

afterEach(() => {
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('a number the model saved is never texted or rung', () => {
  it('no verified phone: nothing is texted or called, and it says so', async () => {
    const saved = await run('saveContactInfo', { phone: STRANGER, preferredMethod: 'call' });
    expect(saved).toContain('verified on your account'); // no promise to use the saved number
    withVerified(undefined);
    const text = await run('sendImmediateOutreach', { message: 'hi', method: 'sms' });
    const call = await run('sendImmediateOutreach', { message: 'hi', method: 'call' });
    const later = await run('scheduleProactiveReminder', { message: 'hi', when: 'in 2 hours' });
    expect(sent.sms).not.toHaveBeenCalled();
    expect(sent.twilioCall).not.toHaveBeenCalled();
    expect(portCall).not.toHaveBeenCalled();
    expect(sent.reminder).not.toHaveBeenCalled();
    for (const reply of [text, call, later]) expect(reply).toContain('no verified phone number');
  });

  it('with a verified phone it goes there, not to the saved number', async () => {
    await run('saveContactInfo', { phone: STRANGER, preferredMethod: 'sms' });
    withVerified(OWNER);
    await run('sendImmediateOutreach', { message: 'hi', method: 'sms' });
    await run('sendImmediateOutreach', { message: 'hi', method: 'call' });
    await run('scheduleProactiveReminder', { message: 'hi', when: 'in 2 hours' });
    // The text goes through the guarded sender (STOP, quiet hours), never straight to Twilio.
    expect(guarded.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      [ctx.userId, { askedNow: false }],
    ]);
    expect(sent.sms).not.toHaveBeenCalled();
    expect(portCall.mock.calls.map((c) => (c[0] as { phoneNumber: string }).phoneNumber)).toEqual([
      OWNER,
    ]);
    expect(sent.twilioCall).not.toHaveBeenCalled();
    expect(
      sent.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress)
    ).toEqual([OWNER]);
  });

  it('a held text says why, and nothing goes out', async () => {
    withVerified(OWNER);
    guarded.mockResolvedValueOnce({ sent: false, reason: 'you replied STOP to my texts' } as never);
    const reply = await run('sendImmediateOutreach', { message: 'hi', method: 'sms' });
    expect(reply).toBe("I didn't text you: you replied STOP to my texts.");
    expect(sent.sms).not.toHaveBeenCalled();
  });
});

describe('an email address the model saved is never used', () => {
  it('no verified email: nothing is sent or scheduled, and it says so', async () => {
    await run('saveContactInfo', { email: 'stranger@example.com', preferredMethod: 'email' });
    withVerified(OWNER, undefined);
    const now = await run('sendImmediateOutreach', { message: 'hi', method: 'email' });
    const later = await run('scheduleProactiveReminder', {
      message: 'hi',
      when: 'in 2 hours',
      method: 'email',
    });
    expect(sent.email).not.toHaveBeenCalled();
    expect(sent.reminder).not.toHaveBeenCalled();
    for (const reply of [now, later]) expect(reply).toContain('no verified email address');
  });

  it('with a verified email it goes there, not to the saved address', async () => {
    await run('saveContactInfo', { email: 'stranger@example.com', preferredMethod: 'email' });
    withVerified(OWNER, 'owner@example.com');
    await run('sendImmediateOutreach', { message: 'hi', method: 'email' });
    await run('scheduleProactiveReminder', { message: 'hi', when: 'in 2 hours', method: 'email' });
    expect(sent.email.mock.calls.map((c) => c[0])).toEqual(['owner@example.com']);
    expect(
      sent.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress)
    ).toEqual(['owner@example.com']);
  });
});

describe('the saved contact info', () => {
  it('hands out only preferences, never the saved phone or email', async () => {
    await run('saveContactInfo', { phone: STRANGER, email: 'stranger@example.com' });
    const info = await getUserContactInfo(ctx.userId);
    expect(info?.preferredMethod).toBe('sms');
    expect(info?.phone).toBeUndefined();
    expect(info?.email).toBeUndefined();
  });
});
