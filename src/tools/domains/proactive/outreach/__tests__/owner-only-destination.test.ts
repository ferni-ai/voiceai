/**
 * The outreach tools exempt from the confirm gate (outbound-gate.ts) are exempt
 * because they only ever reach the account owner: the number and address come
 * from the owner's saved profile. A number or address the model puts in the
 * arguments is ignored. Mocked at the edges: the profile store and the
 * SMS / email / call / reminder senders.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const OWNER = { phone: '+18015550100', email: 'owner@example.com' };
const STRANGER = { phoneNumber: '+12125550199', to: '+12125550199', recipient: '+12125550199' };

const sent = vi.hoisted(() => ({
  sms: vi.fn(async (..._a: unknown[]) => 'sent'),
  email: vi.fn(async (..._a: unknown[]) => 'sent'),
  call: vi.fn(async (..._a: unknown[]) => ({ success: true, callSid: 'CA1' })),
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
}));

vi.mock('../../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => ({
      contactInfo: { phone: '+18015550100', email: 'owner@example.com', timezone: 'UTC' },
      preferences: { proactiveContact: { phone: '+18015550100', email: 'owner@example.com' } },
    }),
  }),
}));
vi.mock('../../../../../services/communication-service.js', () => ({
  sendSMS: sent.sms,
  sendEmail: sent.email,
}));
vi.mock('../../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: sent.call,
}));
vi.mock('../../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: sent.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: async () => undefined,
  recordReminderPromise: async () => undefined,
}));

import type { ToolContext, ToolDefinition } from '../../../../registry/types.js';
import { definitions as schedulingDefs } from '../../../scheduling/index.js';
import { getAgentToUserOutreachDefinitions } from '../agent-to-user.js';
import { setCallUserPort, type CallUserPort } from '../call-user-port.js';
import { getTelephonyToolDefinitions } from '../../../telephony/index.js';

const ctx: ToolContext = { userId: 'owner-uid', agentId: 'ferni', agentDisplayName: 'Ferni' };
const all: ToolDefinition[] = [...schedulingDefs, ...getAgentToUserOutreachDefinitions()];
const run = (id: string, args: Record<string, unknown>) =>
  all
    .find((d) => d.id === id)!
    .create(ctx)
    .execute({ ...args, ...STRANGER }, {});

/** The call-user port with the owner's verified phone and email; texts go through its guarded textOwner. */
const guarded = vi.fn(async (..._a: unknown[]) => ({ sent: true }));
const ownerPort = (call: CallUserPort['call'] = vi.fn()): CallUserPort => ({
  verifiedPhone: async () => OWNER.phone,
  verifiedEmail: async () => OWNER.email,
  textOwner: guarded,
  call,
});

afterEach(() => vi.clearAllMocks());

describe('owner-only tools ignore a destination in their arguments', () => {
  it('sendMessageNow texts the owner, not the supplied number', async () => {
    setCallUserPort(ownerPort());
    await run('sendMessageNow', { message: 'hi' });
    setCallUserPort(undefined);
    // Through the guarded sender, to the owner, never straight to Twilio.
    expect(guarded.mock.calls.map((c) => c[0])).toEqual(['owner-uid']);
    expect(sent.sms).not.toHaveBeenCalled();
  });

  it('sendImmediateOutreach texts, emails and calls only the owner', async () => {
    // Texts and calls go to the verified phone (call-user port), like callUser.
    const placed = vi.fn(async (..._a: unknown[]) => ({ success: true, status: 'initiated' }));
    setCallUserPort(ownerPort(placed));
    try {
      await run('sendImmediateOutreach', { message: 'hi', method: 'sms' });
      await run('sendImmediateOutreach', { message: 'hi', method: 'email' });
      await run('sendImmediateOutreach', { message: 'hi', method: 'call' });
    } finally {
      setCallUserPort(undefined);
    }
    expect(guarded.mock.calls.map((c) => c[0])).toEqual(['owner-uid']);
    expect(sent.sms).not.toHaveBeenCalled();
    expect(sent.email.mock.calls.map((c) => c[0])).toEqual([OWNER.email]);
    expect(placed.mock.calls.map((c) => (c[0] as { phoneNumber: string }).phoneNumber)).toEqual([
      OWNER.phone,
    ]);
  });

  it('callUser calls only the owner, at the verified phone on the account', async () => {
    // Telephony registers the real callUser behind TOOLS_REAL_CALL_USER; it reaches
    // outreach through its port (the account's verified phone), never the arguments.
    vi.stubEnv('TOOLS_REAL_CALL_USER', 'on');
    const placed = vi.fn(async (..._a: unknown[]) => ({ success: true, status: 'initiated' }));
    setCallUserPort({ verifiedPhone: async () => OWNER.phone, call: placed });
    try {
      const callUser = getTelephonyToolDefinitions().find((d) => d.id === 'callUser')!;
      await callUser.create(ctx).execute({ message: 'hi', ...STRANGER }, {});
    } finally {
      setCallUserPort(undefined);
      vi.unstubAllEnvs();
    }
    expect(placed.mock.calls.map((c) => (c[0] as { phoneNumber: string }).phoneNumber)).toEqual([
      OWNER.phone,
    ]);
  });

  it('scheduleMessage / scheduleCall / scheduleEmail deliver only to the owner', async () => {
    setCallUserPort(ownerPort());
    await run('scheduleMessage', { message: 'hi', when: 'in 2 hours' });
    await run('scheduleCall', { message: 'hi', when: 'in 2 hours' });
    await run('scheduleEmail', { subject: 's', message: 'hi', when: 'in 2 hours' });
    setCallUserPort(undefined);
    const addresses = sent.reminder.mock.calls.map(
      (c) => (c[0] as { deliveryAddress: string }).deliveryAddress
    );
    expect(addresses).toEqual([OWNER.phone, OWNER.phone, OWNER.email]);
  });
});
