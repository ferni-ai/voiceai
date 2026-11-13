/**
 * The inbound webhook marks a text `unverified` only when no member's verified phone sent it
 * and it isn't a maybe-"stop". The sender lookup, routing and proactive replies are fakes.
 * Fictional numbers only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEMBER = '+15555550142';
vi.mock('../../webhooks/sms-sender-account.js', () => ({
  findAccountByVerifiedPhone: async (e164: string) => (e164 === MEMBER ? 'uid-sam' : null),
}));
vi.mock('../../proactive-channels/sms-replies.js', () => ({
  handleProactiveSmsReply: async () => null,
}));
vi.mock('../../../contacts/optimal-timing.js', () => ({
  findContactByPhone: async () => null,
  markContactResponded: vi.fn(),
}));
vi.mock('../../../conversation-thread/inbound-router.js', () => ({
  handleInboundSMS: async () => ({
    routeDecision: { agentId: 'ferni', confidence: 1 },
    shouldInitiateCall: false,
    callNow: false,
  }),
}));

const { handleInboundSMSWebhook } = await import('../../webhooks/twilio-webhooks.js');

let sid = 0;
const text = (From: string, Body: string) =>
  handleInboundSMSWebhook({
    MessageSid: `SM${++sid}`,
    Body,
    From,
    To: '+15555550100',
    NumMedia: '0',
  } as never);

beforeEach(() => {
  vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
  vi.stubEnv('NODE_ENV', 'test');
});

describe('who is unverified at the webhook', () => {
  it('a number no member verified: marked', async () => {
    expect(await text('+15555550188', 'hey who is this')).toEqual({
      success: true,
      unverified: true,
    });
  });

  it("a member's verified phone: not marked", async () => {
    expect(await text(MEMBER, 'walked Biscuit in the rain')).toEqual({ success: true });
  });

  it('a stranger\'s maybe-"stop": not marked; a STOP gets only the keyword answer', async () => {
    expect(await text('+15555550188', 'leave me alone')).toEqual({ success: true });
    expect((await text('+15555550188', 'STOP')).unverified).toBeUndefined();
  });
});
