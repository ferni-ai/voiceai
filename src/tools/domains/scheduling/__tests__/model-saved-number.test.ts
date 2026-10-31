/**
 * The scheduling domain's saveContactInfo writes profile.contactInfo from
 * whatever number the model heard. sendMessageNow, scheduleMessage and
 * scheduleCall used to text or ring that number with no read-back and no yes.
 * They now reach only the verified phone on the account (the call-user port).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const STRANGER = '+12125550199';
const OWNER = '+18015550100';

const sent = vi.hoisted(() => ({
  sms: vi.fn(async (..._a: unknown[]) => 'sent'),
  twilioCall: vi.fn(async (..._a: unknown[]) => ({ success: true, callSid: 'CA1' })),
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
  profile: { contactInfo: {} as Record<string, unknown> },
}));

vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => sent.profile,
    saveProfile: async (p: { contactInfo: Record<string, unknown> }) => {
      sent.profile.contactInfo = p.contactInfo;
    },
  }),
}));
vi.mock('../../../../services/communication-service.js', () => ({
  sendSMS: sent.sms,
  sendEmail: vi.fn(async () => 'sent'),
}));
vi.mock('../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: sent.twilioCall,
}));
vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: sent.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: async () => undefined,
  recordReminderPromise: async () => undefined,
}));

import type { ToolContext } from '../../../registry/types.js';
import { setCallUserPort } from '../../proactive/outreach/call-user-port.js';
import { definitions } from '../index.js';

const ctx: ToolContext = {
  userId: 'uid-saved-number',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
};
const run = async (id: string, args: Record<string, unknown>): Promise<string> =>
  String(
    await definitions
      .find((d) => d.id === id)!
      .create(ctx)
      .execute(args, { ctx: { userData: { userId: ctx.userId, verifiedCaller: true } } })
  );
const guarded = vi.fn(async (..._a: unknown[]) => ({ sent: true }));
const port = (phone?: string, email?: string) => ({
  verifiedPhone: async () => phone,
  verifiedEmail: async () => email,
  textOwner: guarded,
  call: vi.fn(),
});
const addresses = (): string[] =>
  sent.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress);

afterEach(() => {
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('a number the model saved is never texted or rung', () => {
  it('no verified phone: nothing is sent or scheduled, and it says so', async () => {
    const saved = await run('saveContactInfo', { phone: STRANGER });
    expect(saved).toContain('verified on your account'); // no promise to use the saved number
    setCallUserPort(port(undefined));
    const replies = [
      await run('sendMessageNow', { message: 'hi' }),
      await run('scheduleMessage', { message: 'hi', when: 'in 2 hours' }),
      await run('scheduleCall', { message: 'hi', when: 'in 2 hours' }),
    ];
    expect(sent.sms).not.toHaveBeenCalled();
    expect(sent.twilioCall).not.toHaveBeenCalled();
    expect(sent.reminder).not.toHaveBeenCalled();
    for (const reply of replies) expect(reply).toContain('no verified phone number');
  });

  it('with a verified phone it goes there, not to the saved number', async () => {
    await run('saveContactInfo', { phone: STRANGER });
    setCallUserPort(port(OWNER));
    await run('sendMessageNow', { message: 'hi' });
    await run('scheduleMessage', { message: 'hi', when: 'in 2 hours' });
    await run('scheduleCall', { message: 'hi', when: 'in 2 hours' });
    // Through the guarded sender (STOP, texts off); they just asked, so quiet hours don't hold it.
    expect(guarded.mock.calls.map((c) => [c[0], c[2]])).toEqual([[ctx.userId, { askedNow: true }]]);
    expect(sent.sms).not.toHaveBeenCalled();
    expect(addresses()).toEqual([OWNER, OWNER]);
  });

  it('with no port in this process it fails closed', async () => {
    await run('saveContactInfo', { phone: STRANGER });
    await run('sendMessageNow', { message: 'hi' });
    expect(sent.sms).not.toHaveBeenCalled();
  });

  it('an email address the model saved is never used', async () => {
    await run('saveContactInfo', { email: 'stranger@example.com' });
    setCallUserPort(port(OWNER, undefined));
    const reply = await run('scheduleEmail', { subject: 's', message: 'hi', when: 'in 2 hours' });
    expect(reply).toContain('no verified email address');
    expect(sent.reminder).not.toHaveBeenCalled();
    setCallUserPort(port(OWNER, 'owner@example.com'));
    await run('scheduleEmail', { subject: 's', message: 'hi', when: 'in 2 hours' });
    expect(addresses()).toEqual(['owner@example.com']);
  });
});
