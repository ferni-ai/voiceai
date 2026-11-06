/**
 * A crisis text is answered with 988 whatever fails after the screen. The real
 * route and the real Twilio inbound handler run; storage, the call adapter, the
 * thread router and the classifier's model call are faked. Each write after the
 * screen (the handler as a whole, the thread write, the proactive-reply mark,
 * analytics, and the route's four records) is made to throw in turn: the answer
 * is still a 200 carrying 988, and the failure is logged with no number or words.
 *
 * A "call me" crisis text keeps its call (Seth, 2026-11-06), rung now whatever
 * the calling hours (call-hours-paths.test.ts has the hours rows), and the one
 * text says so beside 988. The screen runs before every write, and a crisis text
 * is never recorded as a consent change or a YES.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../services/outreach/proactive-channels/__tests__/path-firestore.js';

const RILEY = 'riley-test-uid';
const PHONE = '+15555550142';
const docs = new Map<string, Record<string, unknown>>();

/** Every log line, by message, so the failure line can be checked for what it carries. */
const lines = vi.hoisted(() => [] as Array<{ fields: unknown; message: unknown }>);
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  const logger = (): Record<string, unknown> => {
    const write = (fields: unknown, message: unknown) => void lines.push({ fields, message });
    return {
      debug: write,
      info: write,
      warn: write,
      error: write,
      trace: write,
      fatal: write,
      child: logger,
    };
  };
  return { ...real, getLogger: logger, createLogger: logger };
});

const adapter = vi.hoisted(() => ({
  verifiedPhone: vi.fn(async (_userId: string): Promise<string | undefined> => undefined),
  call: vi.fn(async (_req: unknown): Promise<{ success: boolean; status?: string }> => ({
    success: true,
    status: 'initiated',
  })),
}));
vi.mock('../../services/outreach/call-user-adapter.js', () => ({ callUserAdapter: adapter }));
vi.mock('../../services/superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../services/identity/firebase-auth.js', () => {
  const byPhone = vi.fn(async (e164: string) => (e164 === PHONE ? { uid: RILEY } : null));
  return { getFirebaseUserByPhone: byPhone, getFirebaseUserByPhoneOrThrow: byPhone };
});
// The thread write (addMessage) happens inside the router.
const routed = vi.hoisted(() =>
  vi.fn(async () => ({
    routeDecision: { agentId: 'ferni', confidence: 1 },
    shouldInitiateCall: true,
    callNow: true,
  }))
);
vi.mock('../../services/conversation-thread/inbound-router.js', () => ({
  handleInboundSMS: routed,
}));
// sms-replies' markLatest runs inside handleProactiveSmsReply.
const proactive = vi.hoisted(() => vi.fn(async (): Promise<string | undefined> => undefined));
vi.mock('../../services/outreach/proactive-channels/sms-replies.js', () => ({
  handleProactiveSmsReply: proactive,
}));
const analytics = vi.hoisted(() => vi.fn());
vi.mock('../../services/outreach/analytics.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordResponseEvent: analytics,
}));
vi.mock('../../services/contacts/optimal-timing.js', () => ({
  findContactByPhone: vi.fn(async () => null),
  markContactResponded: vi.fn(),
}));
const recordCheckinReply = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/outreach/checkin-replies.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordCheckinReply,
}));
const recordInboundSmsConsent = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/messaging/consent.js', () => ({ recordInboundSmsConsent }));
const recordContactYes = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/messaging/consent-grants.js', () => ({ recordContactYes }));
const recordHolderCode = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../../services/messaging/holder-verification.js', () => ({ recordHolderCode }));
vi.mock('../../services/safety/crisis-classifier.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createGeminiCrisisGenerate: () => async () => '{"risk":"none"}',
}));

// The screen can be made to reject, though by contract it never does.
const screenRejects = vi.hoisted(() => ({ on: false }));
const screened = vi.hoisted(() => vi.fn());
vi.mock('../../services/outreach/sms-crisis-screen.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../services/outreach/sms-crisis-screen.js')>();
  return {
    ...real,
    smsCrisisReply: async (...args: Parameters<typeof real.smsCrisisReply>) => {
      screened();
      if (screenRejects.on) throw new Error('screen down');
      return real.smsCrisisReply(...args);
    },
  };
});

const { handleOutreachWebhookRoutes } = await import('../outreach-webhook-routes.js');
const screen = await import('../../services/outreach/sms-crisis-screen.js');

const PATH = '/api/outreach/webhooks/twilio/sms-inbound';
const CRISIS = 'I want to kill myself, call me';

async function text(body: string, from = PHONE): Promise<{ status: unknown; sent: string }> {
  const params = { From: from, Body: body, MessageSid: 'SM0123456789abcdef', NumMedia: '0' };
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { host: 'app.ferni.example', 'content-type': 'application/x-www-form-urlencoded' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  await handleOutreachWebhookRoutes(req, res as unknown as ServerResponse, PATH);
  return {
    status: res.writeHead.mock.calls[0]?.[0],
    sent: String(res.end.mock.calls[0]?.[0] ?? ''),
  };
}
const boom = () => {
  throw new Error(`write failed for ${PHONE}: ${CRISIS}`);
};

beforeEach(() => {
  vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
  vi.stubEnv('SMS_CALL_ME', 'on');
  vi.stubEnv('CALL_HOURS_GUARD', 'on');
  adapter.verifiedPhone.mockReset().mockResolvedValue(PHONE);
  adapter.call.mockReset().mockResolvedValue({ success: true, status: 'initiated' });
  lines.length = 0;
  screenRejects.on = false;
  docs.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks(); // drops an unused Once, keeps each fake's own default
});

describe('a crisis text survives every write after the screen', () => {
  const writes: Array<[string, () => void]> = [
    ['the whole handler', () => adapter.verifiedPhone.mockImplementationOnce(boom)],
    ['the thread write (router)', () => routed.mockImplementationOnce(boom)],
    ['the proactive-reply mark', () => proactive.mockImplementationOnce(boom)],
    ['analytics', () => analytics.mockImplementationOnce(boom)],
    ['the check-in reply record', () => recordCheckinReply.mockImplementationOnce(boom)],
    ['the consent record', () => recordInboundSmsConsent.mockImplementationOnce(boom)],
    ['the contact-yes record', () => recordContactYes.mockImplementationOnce(boom)],
    ['the holder-code record', () => recordHolderCode.mockImplementationOnce(boom)],
  ];

  it.each(writes)('%s throws: still a 200 with 988', async (_name, makeItThrow) => {
    makeItThrow();
    const { status, sent } = await text(CRISIS);
    expect(status).toBe(200);
    expect(sent).toContain('please call or text 988');
    expect(sent).toContain('741741');
    expect(sent).toContain('call 911');
  });

  it('every write throws at once: still a 200 with 988, and the later records still run', async () => {
    for (const [, makeItThrow] of writes) makeItThrow();
    const { status, sent } = await text(CRISIS);
    expect(status).toBe(200);
    expect(sent).toContain('please call or text 988');
    expect(recordHolderCode).toHaveBeenCalledTimes(1);
  });

  it('the handler that throws is logged as a step with the error class only: no number, no words', async () => {
    proactive.mockImplementationOnce(boom);
    await text(CRISIS);
    const failed = lines.filter((l) => String(l.message).includes('step failed'));
    expect(failed).toHaveLength(1);
    expect(failed[0]?.fields).toEqual({ step: 'handler', crisis: true, errorClass: 'Error' });
    const all = JSON.stringify(failed);
    expect(all).not.toContain('0142');
    expect(all).not.toContain('kill');
  });

  it('an ordinary text whose handler throws gets an empty 200, not a 500', async () => {
    proactive.mockImplementationOnce(boom);
    const { status, sent } = await text('running late, see you at 6');
    expect(status).toBe(200);
    expect(sent).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it('a thrown value that is not an Error (no string form) is logged by type and the text still gets 988', async () => {
    proactive.mockRejectedValueOnce(Object.create(null));
    const { status, sent } = await text(CRISIS);
    expect(status).toBe(200);
    expect(sent).toContain('please call or text 988');
    const failed = lines.filter((l) => String(l.message).includes('step failed'));
    expect(failed[0]?.fields).toEqual({ step: 'handler', crisis: true, errorClass: 'object' });
  });

  it('a crisis text from a number with no account still gets 988 and places no call', async () => {
    const { status, sent } = await text(CRISIS, '+15555550199');
    expect(status).toBe(200);
    expect(sent).toContain('glad you told me');
    expect(sent).toContain('please call or text 988');
    expect(adapter.call).not.toHaveBeenCalled();
  });

  it('a screen that rejects (never by contract) still answers 200 with the usual reply, not a 500', async () => {
    screenRejects.on = true;
    const { status, sent } = await text('call me');
    expect(status).toBe(200);
    expect(sent).toContain('Calling you now.');
    const failed = lines.filter((l) => String(l.message).includes('step failed'));
    expect(failed[0]?.fields).toEqual({ step: 'screen', crisis: false, errorClass: 'Error' });
  });
});

describe('a "call me" crisis text keeps its call and says so in one text', () => {
  it('the call is placed now, and the reply has the calling line and 988', async () => {
    const { sent } = await text(CRISIS);
    expect(adapter.call).toHaveBeenCalledTimes(1);
    expect(adapter.call.mock.calls[0]?.[0]).toMatchObject({ userId: RILEY, phoneNumber: PHONE });
    expect(sent.match(/<Message>/g)).toHaveLength(1);
    expect(sent).toContain('<Message>I&apos;m calling you now. If you might act');
    expect(sent).toContain('please call or text 988 (Suicide &amp; Crisis Lifeline)');
    expect(sent).toContain('text HOME to 741741');
    expect(sent).toContain('call 911');
  });

  it('the call is asked for as a crisis call, so calling hours do not hold it', async () => {
    await text(CRISIS);
    expect(adapter.call.mock.calls[0]?.[0]).toMatchObject({ crisis: true });
  });

  it('a non-crisis "call me" is an ordinary call, which calling hours still hold', async () => {
    await text('call me');
    expect(adapter.call).toHaveBeenCalledTimes(1);
    expect(adapter.call.mock.calls[0]?.[0]).not.toHaveProperty('crisis');
  });

  it.each([
    ['SMS_CALL_ME off', () => vi.stubEnv('SMS_CALL_ME', 'off')],
    ['the call refused', () => adapter.call.mockResolvedValueOnce({ success: false })],
    ['a different sender phone', () => adapter.verifiedPhone.mockResolvedValueOnce('+15555550199')],
    ['the call throws', () => adapter.call.mockRejectedValueOnce(new Error('dial failed'))],
  ])('%s: no call claimed, the usual crisis reply', async (_name, setup) => {
    setup();
    const { sent } = await text(CRISIS);
    expect(sent).not.toMatch(/calling you|I'll call you/i);
    expect(sent).toContain('glad you told me');
    expect(sent).toContain('please call or text 988');
  });

  it('the usual crisis wording is unchanged, byte for byte, and the calling variant keeps all of it after the first line', () => {
    const rest =
      "If you might act on these thoughts or you're not safe right now, please call or text 988 (Suicide & Crisis Lifeline), or text HOME to 741741. If you're in immediate danger, call 911. You can open Ferni anytime and we'll talk.";
    expect(screen.SMS_CRISIS_REPLY).toBe(`I'm really glad you told me, and I'm here. ${rest}`);
    expect(screen.SMS_CRISIS_CALLING_REPLY).toBe(`I'm calling you now. ${rest}`);
    expect(screen.smsCrisisReplyFor(undefined)).toBe(screen.SMS_CRISIS_REPLY);
    expect(screen.smsCrisisReplyFor('later')).toBe(screen.SMS_CRISIS_REPLY);
    expect(Object.keys(screen)).not.toContain('SMS_CRISIS_CALL_LATER_REPLY');
  });

  it('a non-crisis "call me" text keeps the plain "Calling you now." reply', async () => {
    const { sent } = await text('call me');
    expect(sent).toContain('Calling you now.');
    expect(sent).not.toContain('988');
  });
});

describe('the screen comes first, and a crisis text is never a consent', () => {
  const sid = 'SM0123456789abcdef';
  const writes = () => ({
    'proactive-reply mark': proactive,
    analytics,
    'thread write': routed,
    'check-in record': recordCheckinReply,
    'consent record': recordInboundSmsConsent,
    'contact-yes record': recordContactYes,
    'holder-code record': recordHolderCode,
  });
  const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];

  it.each([CRISIS, 'running late, see you at 6'])(
    'the screen runs before every write (%s)',
    async (body) => {
      await text(body);
      const first = order(screened) ?? Infinity;
      for (const [name, fn] of Object.entries(writes())) {
        const at = order(fn);
        if (at !== undefined) expect([name, at > first]).toEqual([name, true]);
      }
      expect(order(proactive)).toBeGreaterThan(first);
    }
  );

  it('a crisis text records no consent change and no YES; the other records still run', async () => {
    await text('YES I want to die');
    expect(recordInboundSmsConsent).not.toHaveBeenCalled();
    expect(recordContactYes).not.toHaveBeenCalled();
    expect(recordCheckinReply).toHaveBeenCalledTimes(1);
    expect(recordHolderCode).toHaveBeenCalledTimes(1);
  });

  it('an ordinary text runs every write once, in the order main runs them, with the same arguments', async () => {
    await text('yes');
    const calls = Object.entries(writes()).map(([name, fn]) => [name, fn.mock.calls.length]);
    expect(calls).toEqual(Object.keys(writes()).map((name) => [name, 1]));
    const seq = Object.values(writes()).map((fn) => order(fn) ?? 0);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    expect(recordCheckinReply).toHaveBeenCalledWith(PHONE, 'yes', sid);
    expect(recordInboundSmsConsent).toHaveBeenCalledWith(PHONE, 'yes');
    expect(recordContactYes).toHaveBeenCalledWith(PHONE, 'yes', sid);
    expect(recordHolderCode).toHaveBeenCalledWith(PHONE, 'yes');
  });
});
