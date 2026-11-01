/**
 * STOP means STOP, end to end (TCPA): an inbound opt-out through Twilio's
 * webhook route (every handler behind it), then every kind of text the guarded
 * sender carries is refused: the post-call check-in, a reminder, the morning
 * brief, a text the owner asked for, and a text to a third party.
 *
 * Production code throughout: the route, the real Firestore stores over an
 * in-memory Firestore, sendGuardedText / textOnBehalf / guardReminderText /
 * callUserAdapter.textOwner. Only Twilio's transport, Firebase Auth and the
 * profile scan are stubbed. Every number is a 555-01xx fiction.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../outreach/proactive-channels/__tests__/path-firestore.js';

type Json = Record<string, unknown>;
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
/** Make one store unreadable: 'fail' rejects, 'hang' never answers. */
const fault = vi.hoisted(() => ({
  consent: 'ok' as 'ok' | 'fail' | 'hang',
  feature_checkin_optouts: 'ok' as 'ok' | 'fail' | 'hang',
}));
const sendSMS = vi.hoisted(() => vi.fn(async () => ({ success: true, messageSid: 'SM1' })));
const OWNER_UID = 'owner-uid';
const OWNER = '+12025550143';
const FRIEND = '+13125550199';

function faultyDb() {
  const real = pathFirestore(docs);
  return {
    ...real,
    collection: (name: string) => {
      const c = real.collection(name) as Json & { doc: (id: string) => Json };
      const mode = fault[name as keyof typeof fault] ?? 'ok';
      if (mode === 'ok') return c;
      const get =
        mode === 'fail'
          ? async () => Promise.reject(new Error('unavailable'))
          : async () =>
              new Promise<never>(() => {
                // never settles: the read timeout decides
              });
      return { ...c, doc: (id: string) => ({ ...c.doc(id), get }) };
    },
  };
}
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => faultyDb(),
}));
vi.mock('../../superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => faultyDb(),
}));
const byPhone = vi.hoisted(() =>
  vi.fn(async (e164: string) => (e164 === OWNER ? { uid: OWNER_UID } : null))
);
vi.mock('../../identity/firebase-auth.js', async (orig) => ({
  ...(await orig<object>()),
  getFirebaseUser: vi.fn(async (uid: string) =>
    uid === OWNER_UID ? { phoneNumber: OWNER } : null
  ),
  getFirebaseUserByPhone: byPhone,
  // The webhook's sender lookup (sms-sender-account.ts) reads the strict variant.
  getFirebaseUserByPhoneOrThrow: byPhone,
}));
vi.mock('../../outreach/delivery/sms-delivery.js', async (orig) => ({
  ...(await orig<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS,
}));
// The webhook's profile scan finds the owner, so ordinary texts reach the thread router.
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    isInitialized: true,
    listProfiles: async () => [{ id: OWNER_UID, contactInfo: { phone: OWNER } }],
  }),
}));
const routed = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ routeDecision: {}, shouldInitiateCall: false }))
);
vi.mock('../../conversation-thread/inbound-router.js', () => ({ handleInboundSMS: routed }));
vi.mock('../../contacts/optimal-timing.js', () => ({
  findContactByPhone: vi.fn(async () => null),
  markContactResponded: vi.fn(),
}));

const { handleOutreachWebhookRoutes } = await import('../../../api/outreach-webhook-routes.js');
const { sendGuardedText, textOnBehalf } = await import('../../outreach/guarded-text.js');
const { guardReminderText } = await import('../../outreach/reminder-texts.js');
const { callUserAdapter } = await import('../../outreach/call-user-adapter.js');
const { phoneHash } = await import('../../outreach/checkin-replies.js');
const { CONSENT_READ_TIMEOUT_MS } = await import('../../outreach/text-consent.js');
const { keywordReply, inboundKeyword } = await import('../sms-keywords.js');

const SECRET = 'test-hash-secret';
const hashOf = (phone: string): string => phoneHash(phone, { LOG_HASH_SECRET: SECRET }) ?? '';
const CONFIRM = keywordReply(inboundKeyword('please stop')) ?? '';
const CALLS_TOO = keywordReply(inboundKeyword('stop calling me')) ?? '';
const WELCOME = keywordReply(inboundKeyword('Start.')) ?? '';
/** Twilio confirms its own keywords; the app confirms every other explicit phrase, once. */
const replyTo = (phrase: string): string[] =>
  inboundKeyword(phrase)?.kind === 'opt-out' && !/^(stop|revoke|optout)$/i.test(phrase)
    ? [CONFIRM]
    : [];

const unescape = (x: string): string =>
  x
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** POST an inbound text to the real route; the replies its TwiML sends back. */
async function inbound(body: string, from = OWNER): Promise<string[]> {
  const path = '/api/outreach/webhooks/twilio/sms-inbound';
  const form = new URLSearchParams({ From: from, Body: body, MessageSid: 'SM0123456789abcdef' });
  const req = Readable.from([form.toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: path,
    headers: { host: 'app.ferni.example', 'content-type': 'application/x-www-form-urlencoded' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  await handleOutreachWebhookRoutes(req, res as unknown as ServerResponse, path);
  const twiml = String(res.end.mock.calls[0]?.[0] ?? '');
  return [...twiml.matchAll(/<Message>([^<]*)<\/Message>/g)].map((m) => unescape(m[1] ?? ''));
}

let n = 0;
/** Each send a few minutes after the last, so per-kind gaps never decide a test. */
const later = (): string => {
  vi.setSystemTime(new Date(Date.now() + 11 * 60_000));
  return `ref${(n += 1)}`;
};
const owned = (kind: 'checkin' | 'morning-brief', askedNow = false) =>
  sendGuardedText({
    userId: OWNER_UID,
    body: 'hi',
    kind,
    refId: later(),
    minGapMs: 60_000,
    askedNow,
  });
const SENDERS = {
  'post-call check-in': async () => owned('checkin'),
  'morning brief': async () => owned('morning-brief'),
  reminder: async () => {
    const id = later();
    const r = { id, userId: OWNER_UID, message: 'call the dentist', timezone: 'America/New_York' };
    const due = { ...r, deliveryMethod: 'sms', deliveryAddress: OWNER, scheduledFor: new Date() };
    return guardReminderText(due as never);
  },
  'text the owner asked for': async () => {
    later();
    return callUserAdapter.textOwner!(OWNER_UID, 'the address', { askedNow: true });
  },
  'third party': async () =>
    textOnBehalf({ senderUserId: OWNER_UID, toPhone: FRIEND, body: 'hi', refId: later() }),
} as const;
type Sender = keyof typeof SENDERS;
const OWN_SENDERS = Object.keys(SENDERS).filter((s) => s !== 'third party') as Sender[];
const PROACTIVE = ['post-call check-in', 'morning brief', 'reminder'] as const;

/** Whether `sender` reached Twilio, and what it said back. */
async function attempt(sender: Sender): Promise<{ texted: boolean; outcome: unknown }> {
  sendSMS.mockClear();
  const outcome = await SENDERS[sender]();
  return { texted: sendSMS.mock.calls.length > 0, outcome };
}

beforeEach(() => {
  docs.clear();
  routed.mockClear();
  fault.consent = 'ok';
  fault.feature_checkin_optouts = 'ok';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T14:00:00Z')); // 10:00 in New York, 09:00 in Chicago
  process.env.LOG_HASH_SECRET = SECRET;
  process.env.SKIP_TWILIO_VALIDATION = 'true';
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = OWNER_UID;
  docs.set(`bogle_users/${OWNER_UID}`, { outreachPreferences: { channels: ['sms'] } });
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of ['LOG_HASH_SECRET', 'SKIP_TWILIO_VALIDATION', 'PROACTIVE_CHANNELS']) {
    delete process.env[k];
  }
  delete process.env.PROACTIVE_CHANNELS_USERS;
});

describe('before any opt-out, every sender texts', () => {
  it.each(Object.keys(SENDERS) as Sender[])('%s goes', async (sender) => {
    expect((await attempt(sender)).texted).toBe(true);
  });
});

const OPT_OUTS = ['STOP', 'revoke', 'REVOKE', 'opt out', 'Opt-Out', 'optout', 'please stop'];

describe.each(OPT_OUTS)('the owner texts %j', (phrase) => {
  it('every inbound handler acts on it: at most one confirmation, both stores, proactive off', async () => {
    expect(await inbound(phrase)).toEqual(replyTo(phrase));
    expect(routed).not.toHaveBeenCalled();
    expect(docs.get(`consent/${hashOf(OWNER)}`)).toMatchObject({ sms: { state: 'opted-out' } });
    expect(docs.has(`feature_checkin_optouts/${hashOf(OWNER)}`)).toBe(true);
    const prefs = docs.get(`bogle_users/${OWNER_UID}`)?.outreachPreferences as Json;
    expect(prefs.proactiveFrequency).toBe('off');
  });

  it.each(OWN_SENDERS)('then no %s is texted', async (sender) => {
    await inbound(phrase);
    expect((await attempt(sender)).texted).toBe(false);
  });
});

describe.each(['STOP', 'revoke', 'opt out'])('a third party texts %j', (phrase) => {
  it('then no text goes to them for a member, and Ferni is told why', async () => {
    expect(await inbound(phrase, FRIEND)).toEqual(replyTo(phrase));
    expect(await attempt('third party')).toEqual({
      texted: false,
      outcome: { sent: false, reason: 'opted-out' },
    });
  });
});

describe('either store stops a text; "allowed" in one never outweighs "stopped" in the other', () => {
  const stopIn = (phone: string, consent: Json | undefined, oldStore: boolean): void => {
    if (consent) docs.set(`consent/${hashOf(phone)}`, consent);
    if (oldStore) docs.set(`feature_checkin_optouts/${hashOf(phone)}`, { via: 'reply' });
  };
  const REVOKED = { sms: { state: 'opted-out', source: 'inbound-sms' } };
  const ALLOWED = { sms: { state: 'opted-in', source: 'inbound-sms' } };
  // A "revoke" recorded before this fix reached consent/ only.
  it.each([
    ['consent/ only', REVOKED, false],
    ['feature_checkin_optouts only', undefined, true],
    ['the old store, though consent/ says opted-in', ALLOWED, true],
  ] as const)('stopped in %s', async (_, consent, oldStore) => {
    stopIn(OWNER, consent, oldStore);
    stopIn(FRIEND, consent, oldStore);
    for (const sender of Object.keys(SENDERS) as Sender[]) {
      // eslint-disable-next-line no-await-in-loop
      expect({ sender, ...(await attempt(sender)) }).toMatchObject({ sender, texted: false });
    }
  });
});

describe('START and UNSTOP re-opt in, in both stores', () => {
  it.each(['START', 'unstop'])('%s after STOP: every sender texts again', async (optIn) => {
    await inbound('revoke');
    await inbound('revoke', FRIEND);
    expect(await inbound(optIn)).toEqual([]); // Twilio's own welcome; no second from the app
    await inbound(optIn, FRIEND);
    expect(docs.has(`feature_checkin_optouts/${hashOf(OWNER)}`)).toBe(false);
    expect(docs.get(`consent/${hashOf(OWNER)}`)).toMatchObject({ sms: { state: 'opted-in' } });
    for (const sender of Object.keys(SENDERS) as Sender[]) {
      // eslint-disable-next-line no-await-in-loop
      expect({ sender, ...(await attempt(sender)) }).toMatchObject({ sender, texted: true });
    }
  });
});

describe('fails closed when the consent record cannot be read', () => {
  it.each([...PROACTIVE, 'third party'] as const)('consent/ unreadable: no %s', async (sender) => {
    fault.consent = 'fail';
    expect((await attempt(sender)).texted).toBe(false);
  });

  it('a check-in and a third-party text report why', async () => {
    fault.consent = 'fail';
    expect((await attempt('post-call check-in')).outcome).toEqual({
      sent: false,
      reason: 'consent-unknown',
    });
    expect((await attempt('third party')).outcome).toEqual({
      sent: false,
      reason: 'consent-unknown',
    });
  });

  it('consent/ not answering: refused once the read times out', async () => {
    fault.consent = 'hang';
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    sendSMS.mockClear();
    const pending = Promise.all([owned('checkin'), SENDERS['third party']()]);
    await vi.advanceTimersByTimeAsync(CONSENT_READ_TIMEOUT_MS);
    expect(await pending).toEqual([
      { sent: false, reason: 'consent-unknown' },
      { sent: false, reason: 'consent-unknown' },
    ]);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('a text the owner just asked for still goes when the old store says no STOP', async () => {
    fault.consent = 'fail';
    expect(await attempt('text the owner asked for')).toEqual({
      texted: true,
      outcome: { sent: true },
    });
  });

  it('but not when the old store has their STOP', async () => {
    docs.set(`feature_checkin_optouts/${hashOf(OWNER)}`, { via: 'reply' });
    fault.consent = 'fail';
    expect((await attempt('text the owner asked for')).texted).toBe(false);
  });

  it('nor when the old store is unreadable too', async () => {
    fault.consent = 'fail';
    fault.feature_checkin_optouts = 'fail';
    expect(await attempt('text the owner asked for')).toEqual({
      texted: false,
      outcome: { sent: false, reason: "I couldn't check your text settings just now" },
    });
  });

  it('and only for a text asked for now: the same owner text, not asked for, is held', async () => {
    fault.consent = 'fail';
    sendSMS.mockClear();
    expect(await owned('checkin', false)).toEqual({ sent: false, reason: 'consent-unknown' });
    expect(await owned('checkin', true)).toEqual({ sent: true });
  });
});

describe('confirmations: exactly one per opt-out, and an ordinary text is never swallowed', () => {
  it.each([
    ['STOP', []],
    ['stop', []],
    ['START', []],
    ['UNSTOP', []],
    ['HELP', []],
    ['Stop.', [CONFIRM]],
    ['OPT OUT', [CONFIRM]],
    ['please stop', [CONFIRM]],
    ['stop calling me', [CALLS_TOO]],
    ['Start.', [WELCOME]],
  ])('%j gets %j from the app', async (body, replies) => {
    expect(await inbound(body)).toEqual(replies);
  });

  it.each(['cancel my 3pm', "don't stop", 'end of day works', 'quit my job today', 'help!'])(
    '%j reaches Ferni and opts nobody out',
    async (body) => {
      expect(await inbound(body)).toEqual([]);
      expect(routed).toHaveBeenCalledWith(OWNER_UID, OWNER, body, false, false);
      expect(docs.has(`consent/${hashOf(OWNER)}`)).toBe(false);
      expect(docs.has(`feature_checkin_optouts/${hashOf(OWNER)}`)).toBe(false);
      for (const sender of Object.keys(SENDERS) as Sender[]) {
        // eslint-disable-next-line no-await-in-loop
        expect({ sender, ...(await attempt(sender)) }).toMatchObject({ sender, texted: true });
      }
    }
  );

  it('"stop calling me" with MESSAGING_PIPELINE off still reaches the do-not-call list', async () => {
    await inbound('stop calling me');
    expect(docs.has(`call_opt_outs/${OWNER}`)).toBe(true);
    expect(docs.get(`consent/${hashOf(OWNER)}`)).toMatchObject({ call: { state: 'opted-out' } });
  });
});

describe('a possible opt-out pauses texts (leaning toward stopping) and asks', () => {
  it.each(['please cancel', 'Can you cancel?', 'leave me alone'])(
    '%j: no opt-out, no confirmation, Ferni sees it flagged, texts paused',
    async (body) => {
      expect(await inbound(body)).toEqual([]);
      expect(routed).toHaveBeenCalledWith(OWNER_UID, OWNER, body, true, false);
      expect(docs.has(`feature_checkin_optouts/${hashOf(OWNER)}`)).toBe(false);
      const consent = docs.get(`consent/${hashOf(OWNER)}`);
      expect(consent?.sms).toBeUndefined();
      expect(consent?.smsPause).toMatchObject({ source: 'inbound-sms' });
      for (const sender of PROACTIVE) {
        // eslint-disable-next-line no-await-in-loop
        expect(await attempt(sender)).toMatchObject({ texted: false });
      }
      expect((await attempt('post-call check-in')).outcome).toEqual({
        sent: false,
        reason: 'paused',
      });
      expect((await attempt('text the owner asked for')).texted).toBe(true);
    }
  );

  it('a third party\'s "Can you cancel?" pauses texts to them', async () => {
    await inbound('Can you cancel?', FRIEND);
    expect(await attempt('third party')).toEqual({
      texted: false,
      outcome: { sent: false, reason: 'paused' },
    });
  });

  it('"yes, stop" then opts out for good, with one confirmation', async () => {
    await inbound('please cancel');
    expect(await inbound('yes, stop')).toEqual([CONFIRM]);
    expect(docs.has(`feature_checkin_optouts/${hashOf(OWNER)}`)).toBe(true);
    expect(docs.get(`consent/${hashOf(OWNER)}`)?.smsPause).toBeUndefined();
    expect((await attempt('text the owner asked for')).texted).toBe(false);
  });

  it.each(['keep texting me', "no, don't stop"])('%j lifts the pause', async (body) => {
    await inbound('please cancel');
    expect(await inbound(body)).toEqual([]);
    expect(docs.get(`consent/${hashOf(OWNER)}`)?.smsPause).toBeUndefined();
    expect((await attempt('post-call check-in')).texted).toBe(true);
  });

  it('the pause clears itself after 7 days', async () => {
    await inbound('please cancel');
    vi.setSystemTime(new Date(Date.now() + 6 * 24 * 3_600_000));
    expect((await attempt('morning brief')).texted).toBe(false);
    vi.setSystemTime(new Date(Date.now() + 24 * 3_600_000));
    expect((await attempt('morning brief')).texted).toBe(true);
  });
});
