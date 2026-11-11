/**
 * SMS_REPLY through the real inbound webhook and router: what goes back to Twilio, what the
 * thread keeps, and what the next reply sees. Storage, the sender lookup, the crisis read and
 * the readers are fakes. Fictional people only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PHONE = '+15555550142';
const kept = vi.hoisted(() => [] as Array<{ role: string; content: string }>);
vi.mock('../../../conversation-thread/thread-persistence.js', () => ({
  saveThread: async () => undefined,
  loadThread: async () => null,
  loadActiveThread: async () => null,
  saveMessage: async (_u: string, m: { role: string; content: string }) => void kept.push(m),
  loadMessages: async () => [],
}));
vi.mock('../../conversation-context-bridge.js', () => ({
  getConversationBridgeContext: async () => null,
}));
vi.mock('../../../identity/firebase-auth.js', async (orig) => ({
  ...(await orig<object>()),
  getFirebaseUserByPhoneOrThrow: async (e164: string) =>
    e164 === PHONE ? { uid: 'uid-sam' } : null,
}));
vi.mock('../../proactive-channels/sms-replies.js', () => ({
  handleProactiveSmsReply: async () => null,
}));
vi.mock('../../../contacts/optimal-timing.js', () => ({
  findContactByPhone: async () => null,
  markContactResponded: vi.fn(),
}));
const gate = vi.hoisted(() => ({ action: 'pass' as 'pass' | 'replace' }));
vi.mock('../../../../agents/personas/crisis-gate-text.js', () => ({
  readTypedMessageForCrisis: async (message: string) => ({
    action: gate.action,
    message,
    reply: 'x',
  }),
}));
const generate = vi.hoisted(() =>
  vi.fn(async (_system: string, _contents: string) => 'Biscuit in the rain, classic.')
);
vi.mock('../sms-reply-reads.js', () => ({
  defaultSmsReplyReads: {
    refusal: async () => null,
    lastCrisisAt: async () => undefined,
    recall: async () => ({ note: null, count: 0 }),
    identity: async () => 'You are Ferni.',
    generate,
  },
}));

const { handleInboundSMSWebhook } = await import('../../webhooks/twilio-webhooks.js');
const { SMS_CRISIS_REPLY } = await import('../../sms-crisis-screen.js');
const { setHoldStore } = await import('../../minor-care-shared-hold.js');
const { SMS_AI_REMINDER } = await import('../sms-reply-text.js');

let sid = 0;
const text = (body: string, crisis = false) =>
  handleInboundSMSWebhook(
    {
      MessageSid: `SM${++sid}`,
      Body: body,
      From: PHONE,
      To: '+15555550100',
      NumMedia: '0',
    } as never,
    undefined,
    undefined,
    { crisis }
  );

beforeEach(() => {
  kept.length = 0;
  gate.action = 'pass';
  generate.mockClear();
  vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SMS_REPLY', 'on');
  vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

describe('a member text at the webhook', () => {
  it('SMS_REPLY off: no reply, as on main, and no model call', async () => {
    vi.stubEnv('SMS_REPLY', 'off');
    expect(await text('walked Biscuit in the rain')).toEqual({ success: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it('on: the reply goes back as TwiML, the thread keeps it, and the next reply sees both texts', async () => {
    const first = await text('walked Biscuit in the rain');
    expect(first.twiml).toContain('<Message>Biscuit in the rain, classic.</Message>');
    await vi.waitFor(() => expect(kept.map((m) => m.role)).toEqual(['user', 'agent']));
    await text('he is soaked');
    const contents = generate.mock.calls[1]?.[1] ?? '';
    expect(contents).toContain('They: walked Biscuit in the rain');
    expect(contents).toContain('You: Biscuit in the rain, classic.');
    expect(contents.endsWith('he is soaked')).toBe(true);
  });

  it('on: a "call me" text keeps its call answer; no model reply', async () => {
    const out = await text('call me');
    expect(out.twiml).toBeDefined();
    expect(generate).not.toHaveBeenCalled();
  });

  it("on: the screen read a crisis: the reply path isn't entered (the route sends 988)", async () => {
    expect(await text('walked Biscuit in the rain', true)).toEqual({ success: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it("on: the text's own crisis read: SMS_CRISIS_REPLY, flagged crisis for the route", async () => {
    gate.action = 'replace';
    const out = await text('walked Biscuit in the rain');
    expect(out.crisis).toBe(true);
    expect(out.twiml).toContain('988');
    expect(SMS_CRISIS_REPLY).toContain('988');
    expect(generate).not.toHaveBeenCalled();
  });

  it('on: a held minor (minor_care_holds): answered with the AI reminder, nothing kept', async () => {
    const until = Date.now() + 60_000;
    setHoldStore({
      heldUntil: async (id) => (id === 'uid-sam' ? until : undefined),
      write: async () => undefined,
    });
    const out = await text('walked Biscuit in the rain');
    expect(out.twiml).toContain(SMS_AI_REMINDER.replace("'", '&apos;'));
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(kept).toEqual([]);
  });
});
