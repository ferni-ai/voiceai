/**
 * MINOR_CARE_SHARED_HOLD at the outbound choke points every path ends in: sendSMS
 * (delivery/sms-delivery.ts) and makeConversationalCall (conversational-calls.ts, which the
 * proactive call scheduler and the scheduled outreach executor use). Neither texts nor calls an
 * account or a number a call held under 18, except a text the person asked for in the call just
 * now. The real senders run; only Twilio, consent and the hold store are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const twilio = vi.hoisted(() => ({
  messagesCreate: vi.fn(async () => ({ sid: 'SM1', status: 'queued' })),
}));
vi.mock('twilio', () => {
  const client = () => ({ messages: { create: twilio.messagesCreate } });
  return { default: Object.assign(client, { validateRequest: () => true }) };
});
/** Texts are allowed; a call stops at consent, so reaching it proves the hold let it through. */
const consentBlocks = vi.hoisted(() =>
  vi.fn(async (_phone: string, channel: string) => (channel === 'call' ? 'opted-out' : null))
);
vi.mock('../../messaging/consent.js', async (orig) => ({
  ...(await orig<object>()),
  consentBlocks,
}));

const { initializeSMSDelivery, sendSMS } = await import('../delivery/sms-delivery.js');
const { makeConversationalCall } = await import('../conversational-calls.js');
const { phoneHoldId } = await import('../checkin-replies.js');
const { setHoldStore } = await import('../minor-care-shared-hold.js');

const PHONE = '+15551234567';
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  holds.clear();
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
