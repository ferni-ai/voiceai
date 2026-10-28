/**
 * MINOR_CARE_SHARED_HOLD on the call paths #2789 left open: the proactive tools' callUser
 * (makePhoneCall now names the member), voice referrals (the referrer), the proactive check-in
 * call over LiveKit SIP (default-deps placeCall), the background agent's conversational call
 * (conversational-call-service.ts) and the SIP bridge's outbound call (sip-bridge.ts). None rings for an account or a number a call held under 18.
 * The real senders run; only Twilio, LiveKit, consent and the hold store are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    TWILIO_STREAM_WEBHOOK_URL: 'wss://example.test/stream',
    LIVEKIT_URL: 'wss://lk.example.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
    CARTESIA_API_KEY: '',
  });
});
const fetchSpy = vi.hoisted(() =>
  vi.fn(async () => new Response('{"sid":"CA1"}', { status: 201 }))
);
vi.stubGlobal('fetch', fetchSpy);
vi.mock('../../messaging/consent.js', async (orig) => ({
  ...(await orig<object>()),
  consentBlocks: async () => null,
}));
const placeSelfCall = vi.hoisted(() => vi.fn(async () => 'answered' as const));
vi.mock('../proactive-channels/self-call.js', async (orig) => ({
  ...(await orig<object>()),
  placeSelfCall,
}));
const callsCreate = vi.hoisted(() => vi.fn(async () => ({ sid: 'CA2' })));
vi.mock('twilio', () => ({ default: () => ({ calls: { create: callsCreate } }) }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = async () => ({});
  },
}));
vi.mock('../../voice/twilio-stream-bridge.js', () => ({
  getTwilioStreamBridge: () => ({ on: () => undefined }),
  generateStreamTwiml: () => '<Response/>',
}));

const { callUser } = await import('../../../tools/domains/proactive/outreach/service.js');
const { setCallUserPort } =
  await import('../../../tools/domains/proactive/outreach/call-user-port.js');
const { makeVoiceReferralCall } = await import('../../../tools/domains/referral/voice-referral.js');
const { defaultProactiveDeps } = await import('../proactive-channels/default-deps.js');
const { makeConversationalCall } = await import('../../voice/conversational-call-service.js');
const { initializeSIPBridge, initiateConversationalCall } = await import('../sip-bridge.js');
const { phoneHoldId } = await import('../checkin-replies.js');
const { setHoldStore } = await import('../minor-care-shared-hold.js');
type ProactiveTrigger = import('../proactive-channels/types.js').ProactiveTrigger;

const PHONE = '+15551234567';
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);
const rang = () =>
  fetchSpy.mock.calls.length + placeSelfCall.mock.calls.length + callsCreate.mock.calls.length;

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  holds.clear();
  setHoldStore({ heldUntil: async (key) => holds.get(key), write: async () => undefined });
  setCallUserPort({ verifiedPhone: async () => PHONE } as never);
  initializeSIPBridge({ twilioAccountSid: 'AC_test', twilioPhoneNumber: '+12025550100' } as never);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
  setCallUserPort(undefined);
});

/** Each path names the member, so a hold on the account alone (not the number) stops it. */
const paths: Array<[string, (userId: string) => Promise<unknown>]> = [
  ['callUser (call_user_now, outreach routes)', (userId) => callUser(userId, 'hi')],
  [
    'voice referral',
    (userId) =>
      makeVoiceReferralCall({
        referrerId: userId,
        referrerName: 'Sam',
        recipientName: 'Alex',
        recipientPhone: PHONE,
      }),
  ],
  [
    'proactive check-in call (LiveKit SIP)',
    (userId) =>
      defaultProactiveDeps().placeCall!(userId, PHONE, {
        kind: 'checkin',
        text: 'hi',
        sourceId: 's1',
      } as unknown as ProactiveTrigger),
  ],
  [
    'background conversational call',
    (userId) =>
      makeConversationalCall({ userId, phone: PHONE, recipientName: 'Alex', purpose: 'hi' }),
  ],
  [
    'SIP bridge outbound call',
    (userId) =>
      initiateConversationalCall({
        userId,
        toPhone: PHONE,
        personaId: 'ferni',
        context: 'checkin',
        message: 'hi',
        webhookBaseUrl: 'https://example.test',
      }),
  ],
];

describe('call paths name the member', () => {
  it.each(paths)('%s: held account, not called', async (_name, run) => {
    holdFor('teen-uid');
    await run('teen-uid');
    expect(rang()).toBe(0);
  });

  it.each(paths)('%s: held number, not called', async (_name, run) => {
    holdFor(phoneHoldId(PHONE));
    await run('adult-uid');
    expect(rang()).toBe(0);
  });

  it.each(paths)('%s: unheld, called as before', async (_name, run) => {
    holdFor('teen-uid');
    await run('adult-uid');
    expect(rang()).toBe(1);
  });

  it.each(paths)('%s: flag off, called as before', async (_name, run) => {
    holdFor('teen-uid');
    holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    await run('teen-uid');
    expect(rang()).toBe(1);
  });

  // Checked on the number it dials, so a spelling the hold key can't read is still held
  it.each(['555/123/4567', 'tel:+15551234567', '555-123-4567 ext'])(
    'background conversational call to %j, a held number: not called',
    async (spelled) => {
      holdFor(phoneHoldId(PHONE));
      await makeConversationalCall({
        userId: 'adult-uid',
        phone: spelled,
        recipientName: 'Alex',
        purpose: 'hi',
      });
      expect(rang()).toBe(0);
    }
  );

  it('says why: held', async () => {
    holdFor('teen-uid');
    expect(await callUser('teen-uid', 'hi')).toMatchObject({ error: 'Not calling: held' });
    expect(
      await makeConversationalCall({
        userId: 'teen-uid',
        phone: PHONE,
        recipientName: 'Alex',
        purpose: 'hi',
      })
    ).toMatchObject({ error: 'HELD' });
  });
});
