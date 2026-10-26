/**
 * MINOR_CARE_SHARED_HOLD at the outbound choke points every path ends in: sendSMS
 * (delivery/sms-delivery.ts), scheduleProactiveCall and its dial (conversational-calls.ts, behind
 * makeConversationalCall, the proactive call scheduler, the scheduled outreach executor and
 * deferred calls), callWithPersonaVoice and the on-behalf first dial (first-dial-opt-out.ts).
 * None texts or calls an account or a number a call held under 18. The only exemptions: a text the
 * person asked for to their own number in the call just now (askedNow), and their own "call me".
 * On-behalf texts to someone else get none. The real senders run; only Twilio, consent and the
 * hold store are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
  });
});
const fetchSpy = vi.hoisted(() =>
  vi.fn(async () => new Response('{"sid":"CA1"}', { status: 201 }))
);
vi.stubGlobal('fetch', fetchSpy);

const twilio = vi.hoisted(() => ({
  messagesCreate: vi.fn(async () => ({ sid: 'SM1', status: 'queued' })),
}));
vi.mock('twilio', () => {
  const client = () => ({ messages: { create: twilio.messagesCreate } });
  return { default: Object.assign(client, { validateRequest: () => true }) };
});
/** Texts are allowed; a call stops at consent, so reaching it proves the hold let it through. */
const callsRefused = async (_phone: string, channel: string) =>
  channel === 'call' ? 'opted-out' : null;
const consentBlocks = vi.hoisted(() => vi.fn());
/** The account's verified phone, as the call-me check re-reads it. */
const reach = vi.hoisted(() => vi.fn(async () => ({ phone: '+15551234567' })));
vi.mock('../user-reach.js', async (orig) => ({ ...(await orig<object>()), userReach: reach }));
vi.mock('../../messaging/consent.js', async (orig) => ({
  ...(await orig<object>()),
  consentBlocks,
}));

const { initializeSMSDelivery, sendSMS } = await import('../delivery/sms-delivery.js');
const { makeConversationalCall, scheduleProactiveCall } =
  await import('../conversational-calls.js');
const { callWithPersonaVoice } = await import('../../voice/voice-call.js');
const { assertNotOptedOut } = await import('../first-dial-opt-out.js');
const { asOwnCallMe } = await import('../held-call.js');
const { callUserAdapter } = await import('../call-user-adapter.js');
const { sendOnBehalfText, textOnBehalf } = await import('../guarded-text.js');
type TextDeps = import('../guarded-text.js').TextDeps;
const { phoneHoldId } = await import('../checkin-replies.js');
const { CACHE_MS, setHoldStore } = await import('../minor-care-shared-hold.js');

const PHONE = '+15551234567';
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  holds.clear();
  consentBlocks.mockImplementation(callsRefused);
  setHoldStore({ heldUntil: async (key) => holds.get(key), write: async () => undefined });
  initializeSMSDelivery({
    twilioAccountSid: 'AC_test',
    twilioAuthToken: 'token',
    twilioPhoneNumber: '+12025550100',
  });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

describe('sendSMS', () => {
  const text = (askedNow?: boolean) =>
    sendSMS({
      to: PHONE,
      body: 'thinking of you',
      personaId: 'ferni',
      userId: 'teen-uid',
      outreachId: 'o1',
      ...(askedNow !== undefined && { askedNow }),
    });

  it.each([
    ['the account', () => holdFor('teen-uid')],
    ['the number', () => holdFor(phoneHoldId(PHONE))],
  ])('held by %s: not sent, Twilio untouched', async (_name, hold) => {
    hold();
    expect(await text()).toMatchObject({ success: false, error: 'Not sent: held' });
    expect(twilio.messagesCreate).not.toHaveBeenCalled();
  });

  it('held, but asked for in the call just now: sent', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await text(true)).toMatchObject({ success: true });
    expect(twilio.messagesCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unheld', 'on'],
    ['flag off', 'off'],
  ])('%s: sent as before', async (name, flag) => {
    if (name === 'flag off') holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    expect(await text()).toMatchObject({ success: true });
    expect(twilio.messagesCreate).toHaveBeenCalledTimes(1);
  });
});

describe('makeConversationalCall (proactive call scheduler, scheduled outreach executor)', () => {
  const call = (userId = 'teen-uid', phoneNumber = PHONE) =>
    makeConversationalCall({ userId, phoneNumber, message: 'checking in' });
  const reachedConsent = () => consentBlocks.mock.calls.some(([, channel]) => channel === 'call');

  it.each([
    ['the account', () => holdFor('teen-uid')],
    ['the number', () => holdFor(phoneHoldId(PHONE))],
  ])('held by %s: no call placed', async (_name, hold) => {
    hold();
    expect(await call()).toMatchObject({ success: false, error: 'Not calling: held' });
    expect(reachedConsent()).toBe(false);
  });

  it.each([
    ['another number', 'on', '+15559876543'],
    ['flag off', 'off', PHONE],
  ])('%s: goes on to the usual checks', async (_name, flag, phone) => {
    holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    expect(await call('adult-uid', phone)).toMatchObject({ error: 'Not calling: opted-out' });
    expect(reachedConsent()).toBe(true);
  });
});

describe('scheduleProactiveCall and its dial', () => {
  const reachedConsent = () => consentBlocks.mock.calls.some(([, channel]) => channel === 'call');
  const request = (reason: string, phoneNumber = PHONE) => ({
    userId: 'teen-uid',
    phoneNumber,
    message: 'checking in',
    ssml: '<speak>checking in</speak>',
    personaId: 'ferni',
    reason,
  });
  const schedule = (reason: string) => scheduleProactiveCall(request(reason));

  it('held: refused before consent, call hours or a deferral', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await schedule('check_in')).toMatchObject({ error: 'Not calling: held' });
    expect(reachedConsent()).toBe(false);
  });

  it('their own "call me" (marked by the adapter, to their verified phone) goes on to the usual checks', async () => {
    holdFor(phoneHoldId(PHONE));
    holdFor('teen-uid');
    expect(await scheduleProactiveCall(asOwnCallMe(request('user_requested_call')))).toMatchObject({
      error: 'Not calling: opted-out',
    });
  });

  it('the in-call "call me" adapter marks its request: a held caller is still rung', async () => {
    holdFor('teen-uid');
    const result = await callUserAdapter.call({
      userId: 'teen-uid',
      phoneNumber: PHONE,
      message: 'you asked me to call',
      personaId: 'ferni',
    } as never);
    expect(result).toMatchObject({ error: 'Not calling: opted-out' });
  });

  it('reason "user_requested_call" from any other caller is still held', async () => {
    holdFor('teen-uid');
    expect(await schedule('user_requested_call')).toMatchObject({ error: 'Not calling: held' });
    expect(
      await makeConversationalCall({
        userId: 'teen-uid',
        phoneNumber: PHONE,
        message: 'hi',
        reason: 'user_requested_call',
      })
    ).toMatchObject({ error: 'Not calling: held' });
    expect(reachedConsent()).toBe(false);
  });

  it('a marked "call me" to a number that is not their verified phone is held', async () => {
    holdFor('teen-uid');
    const other = asOwnCallMe(request('user_requested_call', '+15559876543'));
    expect(await scheduleProactiveCall(other)).toMatchObject({ error: 'Not calling: held' });
  });

  it('their own "call me" keeps its exemption at the dial', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    consentBlocks.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + CACHE_MS);
      holdFor('teen-uid');
      return null;
    });
    const result = await scheduleProactiveCall(asOwnCallMe(request('user_requested_call')));
    expect(result.error).not.toBe('Not calling: held'); // it reached the dial (Twilio is faked)
    vi.useRealTimers();
  });

  it('a hold that starts after scheduling is checked again at the dial', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    consentBlocks.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + CACHE_MS); // past the read cache, as a real deferral is
      holdFor('teen-uid'); // a held call starts while this one waits
      return null;
    });
    expect(await schedule('check_in')).toMatchObject({ error: 'Not calling: held' });
    expect(reachedConsent()).toBe(true);
    vi.useRealTimers();
  });
});

describe('callWithPersonaVoice', () => {
  beforeEach(() => consentBlocks.mockImplementation(async () => null));
  it('held number: not called', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await callWithPersonaVoice(PHONE, 'hi')).toMatchObject({
      success: false,
      message: 'Not calling: held',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('held account (no number hold): not called when the member is named', async () => {
    holdFor('teen-uid');
    expect(await callWithPersonaVoice(PHONE, 'hi', 'ferni', { userId: 'teen-uid' })).toMatchObject({
      success: false,
      message: 'Not calling: held',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('unheld: called as before', async () => {
    expect(
      await callWithPersonaVoice('+15559876543', 'hi', 'ferni', { userId: 'adult-uid' })
    ).toMatchObject({ success: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('the on-behalf first dial (assertNotOptedOut)', () => {
  beforeEach(() => consentBlocks.mockImplementation(async () => null));
  it('held number, or held member: refused (a deferred call comes back through here)', async () => {
    holdFor(phoneHoldId(PHONE));
    await expect(assertNotOptedOut(PHONE, undefined, 'adult-uid')).rejects.toThrow('held');
    holds.clear();
    holdFor('teen-uid');
    await expect(assertNotOptedOut('+15559876543', undefined, 'teen-uid')).rejects.toThrow('held');
  });

  it('unheld: allowed', async () => {
    await expect(assertNotOptedOut(PHONE, undefined, 'adult-uid')).resolves.toBeUndefined();
  });
});

describe('on-behalf texts (to someone else): no askedNow exemption', () => {
  const deps = (): TextDeps => ({
    env: process.env,
    store: {
      forUser: async () => [],
      forPhoneHash: async () => [],
      add: async () => 'new',
      ...atomicLocks(),
      sponsoredPhone: async () => undefined,
      isOptedOut: async () => false,
      consentDoc: async () => undefined,
      userDoc: async () => undefined,
      legacySmsChannels: async () => undefined,
    } as unknown as TextDeps['store'],
    authPhone: async () => undefined,
    send: sendSMS,
    now: () => new Date('2026-10-20T16:00:00Z'), // noon in New York
  });
  const onBehalf = {
    senderUserId: 'adult-uid',
    toPhone: PHONE,
    body: 'Seth says hi',
    refId: 'ob1',
    zone: 'America/New_York',
  };

  it.each([
    ['guarded (ON_BEHALF_TEXT_GUARD on)', 'on'],
    ['legacy (ON_BEHALF_TEXT_GUARD off)', 'off'],
  ])('%s: a held number is not texted', async (_name, guard) => {
    vi.stubEnv('ON_BEHALF_TEXT_GUARD', guard);
    holdFor(phoneHoldId(PHONE));
    const send = guard === 'on' ? sendOnBehalfText : textOnBehalf;
    expect(await send(onBehalf, deps())).toMatchObject({ sent: false });
    expect(twilio.messagesCreate).not.toHaveBeenCalled();
  });

  it('unheld: texted as before', async () => {
    vi.stubEnv('ON_BEHALF_TEXT_GUARD', 'on');
    expect(await sendOnBehalfText(onBehalf, deps())).toEqual({ sent: true });
    expect(twilio.messagesCreate).toHaveBeenCalledTimes(1);
  });
});
