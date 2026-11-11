/**
 * SB 243 at the route that answers Twilio: when SMS_CRISIS_SCREEN answers a sender under a
 * minor-care hold, the crisis reply goes out whole and in order, and "(just a reminder, I'm
 * an AI)" follows it at the end of the last message: on the first reply, then again once 3
 * hours have passed. Adults, and every sender while the hold flags are off, get main's bytes.
 * The screen's read is faked here (its own rows live in outreach-sms-crisis-route.test.ts).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleInboundSMSWebhook = vi.hoisted(() => vi.fn());
vi.mock('../../services/outreach/webhooks/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/webhooks/index.js')>()),
  handleInboundSMSWebhook,
  isSignedInboundSms: () => true,
}));
const findAccountByVerifiedPhone = vi.hoisted(() => vi.fn());
vi.mock('../../services/outreach/webhooks/sms-sender-account.js', () => ({
  findAccountByVerifiedPhone,
}));
const heldSenderStrict = vi.hoisted(() => vi.fn());
vi.mock('../../services/outreach/checkin-replies.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/checkin-replies.js')>()),
  recordCheckinReply: vi.fn(async () => null),
  heldSenderStrict,
  phoneHoldId: () => 'phone#example-hash',
}));
vi.mock('../../services/messaging/consent.js', () => ({ recordInboundSmsConsent: vi.fn() }));
vi.mock('../../services/messaging/consent-grants.js', () => ({ recordContactYes: vi.fn() }));
vi.mock('../../services/messaging/holder-verification.js', () => ({
  recordHolderCode: vi.fn(async () => false),
}));
// The screen's read: these fictional texts stand for texts it reads as a crisis.
const CRISIS_TEXTS = new Set(['crisis row', 'please stop']);
vi.mock('../../services/outreach/sms-crisis-screen.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../services/outreach/sms-crisis-screen.js')>();
  return {
    ...real,
    smsCrisisReply: async (text: string) => (CRISIS_TEXTS.has(text) ? real.SMS_CRISIS_REPLY : null),
  };
});

import { handleOutreachWebhookRoutes } from '../outreach-webhook-routes.js';
import {
  SMS_CRISIS_CALLING_REPLY,
  SMS_CRISIS_REPLY,
  smsReplyTwiml,
} from '../../services/outreach/sms-crisis-screen.js';
import { AI_REMINDER_DECIDE_MS, SMS_AI_REMINDER } from '../../services/outreach/sms-ai-reminder.js';

const PATH = '/api/outreach/webhooks/twilio/sms-inbound';
const HANDLER_TWIML = '<?xml version="1.0"?><Response><Message>Open Ferni</Message></Response>';
const STOP_TWIML =
  '<?xml version="1.0"?><Response><Message>You are unsubscribed</Message></Response>';
const MAIN_CRISIS = smsReplyTwiml(SMS_CRISIS_REPLY);
const MINOR_CRISIS = smsReplyTwiml(`${SMS_CRISIS_REPLY} ${SMS_AI_REMINDER}`);
const HOUR = 3_600_000;
const messageOf = (twiml: string): string => /<Message>([\s\S]*)<\/Message>/.exec(twiml)?.[1] ?? '';

async function text(body: string): Promise<string> {
  const params = { From: '+15555550142', Body: body, MessageSid: 'SM0123456789abcdef' };
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { host: 'app.ferni.example', 'content-type': 'application/x-www-form-urlencoded' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  await handleOutreachWebhookRoutes(req, res as unknown as ServerResponse, PATH);
  return String(res.end.mock.calls[0]?.[0] ?? '');
}

let n = 0;
/** A fresh member per row: the reminder cadence is kept per member for the process. */
function member(held: boolean): string {
  n += 1;
  const userId = `uid-mia-${n}`;
  findAccountByVerifiedPhone.mockResolvedValue(userId);
  heldSenderStrict.mockImplementation(async (id: string | undefined) => held && id === userId);
  return userId;
}

beforeEach(() => {
  vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  handleInboundSMSWebhook
    .mockReset()
    .mockImplementation(async () => ({ success: true, twiml: HANDLER_TWIML }));
  findAccountByVerifiedPhone.mockReset();
  heldSenderStrict.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the route crisis screen and the SB 243 reminder', () => {
  it('a held minor: the whole SMS_CRISIS_REPLY, then the reminder, in one message', async () => {
    member(true);
    const sent = await text('crisis row');
    expect(sent).toBe(MINOR_CRISIS);
    expect(messageOf(sent)).toBe(`${messageOf(MAIN_CRISIS)} (just a reminder, I&apos;m an AI)`);
  });

  it('an adult: SMS_CRISIS_REPLY alone, byte-identical to main (hold flags off)', async () => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    member(false);
    const main = await text('crisis row');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
    member(false);
    const head = await text('crisis row');
    expect(main).toBe(MAIN_CRISIS);
    expect(head).toBe(main);
  });

  it("cadence, as #3722's rule: first reply, none 2 h later, back once 3 h have passed", async () => {
    const start = new Date('2026-11-12T18:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'], now: start });
    member(true);
    const at = async (hours: number) => {
      vi.setSystemTime(start + hours * HOUR);
      return text('crisis row');
    };
    expect(await at(0)).toBe(MINOR_CRISIS);
    expect(await at(2)).toBe(MAIN_CRISIS);
    expect(await at(3)).toBe(MINOR_CRISIS);
  });

  it('a "call me" crisis text: the whole calling reply, then the reminder', async () => {
    member(true);
    handleInboundSMSWebhook.mockResolvedValueOnce({
      success: true,
      twiml: HANDLER_TWIML,
      called: 'now',
    });
    expect(await text('crisis row')).toBe(
      smsReplyTwiml(`${SMS_CRISIS_CALLING_REPLY} ${SMS_AI_REMINDER}`)
    );
  });

  it('a confirmation owed with the crisis reply: confirmation, crisis reply, then the reminder last', async () => {
    member(true);
    handleInboundSMSWebhook.mockResolvedValueOnce({ success: true, twiml: STOP_TWIML });
    const sent = await text('please stop');
    const messages = [...sent.matchAll(/<Message>([\s\S]*?)<\/Message>/g)].map((m) => m[1]);
    expect(messages).toEqual([
      'You are unsubscribed',
      `${messageOf(MAIN_CRISIS)} (just a reminder, I&apos;m an AI)`,
    ]);
  });

  it('a held number with no account gets the reminder too (keyed by its hold id)', async () => {
    findAccountByVerifiedPhone.mockResolvedValue(null);
    heldSenderStrict.mockResolvedValue(true);
    expect(await text('crisis row')).toBe(MINOR_CRISIS);
    expect(heldSenderStrict).toHaveBeenCalledWith(undefined, '+15555550142');
  });

  it('hold flags off: nothing is read and the reply is main', async () => {
    vi.stubEnv('MINOR_CARE', 'off');
    member(true);
    expect(await text('crisis row')).toBe(MAIN_CRISIS);
    expect(findAccountByVerifiedPhone).not.toHaveBeenCalled();
    expect(heldSenderStrict).not.toHaveBeenCalled();
  });

  it('an ordinary text from a held minor: the route adds nothing and reads nothing', async () => {
    member(true);
    expect(await text('walked Biscuit in the rain')).toBe(HANDLER_TWIML);
    expect(heldSenderStrict).not.toHaveBeenCalled();
  });

  it('the hold read rejects: the crisis reply still goes out, whole', async () => {
    member(true);
    heldSenderStrict.mockRejectedValue(new Error('store down'));
    expect(await text('crisis row')).toBe(MAIN_CRISIS);
  });

  it(`the lookup does not answer within ${AI_REMINDER_DECIDE_MS} ms: the crisis reply goes out, whole`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const neverAnswers = (): void => {
      // The lookup hangs: this promise never settles.
    };
    findAccountByVerifiedPhone.mockImplementation(async () => new Promise<string>(neverAnswers));
    heldSenderStrict.mockResolvedValue(true);
    const sent = text('crisis row');
    await vi.advanceTimersByTimeAsync(AI_REMINDER_DECIDE_MS);
    expect(await sent).toBe(MAIN_CRISIS);
  });
});
