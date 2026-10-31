/**
 * MINOR_CARE_SHARED_HOLD in the API server and workers: a caller held under 18 by a call in
 * another process (minor_care_holds/{key}) has no inbound text kept (the SMS thread, a check-in
 * reply) and gets no outreach (guarded texts they didn't just ask for, deliverOutreach). The hold
 * is matched by account id or by the caller's number (its keyed hash): a phone call runs as an
 * anon: id, a text from that number as whatever account the number names. The text is still
 * routed and answered. Unheld users, and everyone with the flag off, as before. The real webhook,
 * voice-side hold writer and senders run; only storage, Twilio and push are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';

const PHONE = '+15551234567';
const OTHER = '+15559876543';
const PROFILE = 'profile-uid';

const threads = vi.hoisted(() => ({
  getOrCreateThread: vi.fn(async () => ({ id: 't1' })),
  addMessage: vi.fn(async () => undefined),
  getActiveThread: vi.fn(async () => null),
}));
vi.mock('../../conversation-thread/thread-manager.js', () => threads);
vi.mock('../conversation-context-bridge.js', () => ({
  getConversationBridgeContext: async () => null,
}));
// The webhook names the account by its verified phone (sms-sender-account.ts): here the Firebase one.
vi.mock('../../identity/firebase-auth.js', async (orig) => ({
  ...(await orig<object>()),
  getFirebaseUserByPhoneOrThrow: async (e164: string) =>
    ({ '+15551234567': { uid: 'profile-uid' }, '+15559876543': { uid: 'adult-uid' } })[e164] ??
    null,
}));
vi.mock('../proactive-channels/sms-replies.js', () => ({
  handleProactiveSmsReply: async () => null,
}));
vi.mock('../../contacts/optimal-timing.js', () => ({
  findContactByPhone: async () => null,
  markContactResponded: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn(async () => [{ success: true, messageId: 'p1' }]));
vi.mock('../delivery/push-reach.js', () => ({ hasPushDevice: async () => true })); // a device is registered
vi.mock('../delivery/push-notifications.js', async (orig) => ({
  ...(await orig<object>()),
  isPushNotificationsAvailable: () => true,
  sendPushNotification: push,
}));
const sms = vi.hoisted(() => vi.fn(async () => ({ success: true, messageSid: 'SM1' })));
vi.mock('../delivery/sms-delivery.js', async (orig) => ({
  ...(await orig<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: sms,
}));
/** profiles/{uid}.phoneNumber, which deliverOutreach texts. */
vi.mock('../firestore-persistence.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreClient: () => ({
    collection: () => ({
      doc: (uid: string) => ({
        get: async () => ({
          data: () => ({ phoneNumber: uid === 'profile-uid' ? '+15551234567' : '+15559876543' }),
        }),
      }),
    }),
  }),
}));

const { handleInboundSMSWebhook } = await import('../webhooks/twilio-webhooks.js');
const { phoneHash, phoneHoldId, recordCheckinReply } = await import('../checkin-replies.js');
const { sendGuardedText } = await import('../guarded-text.js');
const { deliverOutreach } = await import('../delivery/index.js');
const { setHoldStore } = await import('../minor-care-shared-hold.js');
const minorCare = await import('../../../utils/minor-care.js');
const { rememberCallerPhone } =
  await import('../../../agents/voice-agent-entry/caller-recognition.js');
// Registers the voice agent's hold writer (minor-care-purge.ts), as the voice process does.
await import('../../../agents/voice-agent/minor-care-purge.js');
type TextStore = import('../guarded-text.js').TextStore;
type TextDeps = import('../guarded-text.js').TextDeps;

const ENV = { LOG_HASH_SECRET: 'test-secret' };
/** minor_care_holds, by key: heldUntil. */
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);
const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', ENV.LOG_HASH_SECRET);
  vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
  vi.stubEnv('NODE_ENV', 'test');
  holds.clear();
  minorCare.resetMinorCare();
  setHoldStore({
    heldUntil: async (key) => holds.get(key),
    write: async (key, record) => void holds.set(key, record.heldUntil),
  });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

const text = (from: string, body: string) =>
  handleInboundSMSWebhook({
    MessageSid: `SM${Math.random()}`,
    Body: body,
    From: from,
    To: '+15555550000',
    NumMedia: '0',
    AccountSid: 'AC1',
  } as never);

describe('an inbound SMS (the real Twilio webhook)', () => {
  it('a held phone call (an anon: id) holds a text from the same number: answered, not kept', async () => {
    // The voice side: an unverified phone caller, run as a per-call anon: id, says they're 15.
    minorCare.bindSessionUser('call-1', 'anon:abc');
    rememberCallerPhone('call-1', {
      remoteParticipants: new Map([['c', { attributes: { 'sip.phoneNumber': PHONE } }]]),
    } as never);
    expect(minorCare.noteCallerWords('call-1', "I'm 15 years old")).toBe(true);
    await settle();
    expect([...holds.keys()].sort()).toEqual(['anon:abc', `phone#${phoneHash(PHONE)}`]);
    expect([...holds.keys()].join()).not.toContain('5551234567'); // never the number itself

    // A whole-text ask (detectCallIntent): it gets an answer, and still nothing is kept
    const reply = await text(PHONE, 'call me');
    expect(reply.twiml).toContain('Open Ferni whenever'); // answered honestly (sms-call-me.ts)
    expect(threads.getOrCreateThread).not.toHaveBeenCalled();
    expect(threads.addMessage).not.toHaveBeenCalled();
  });

  it('held by the account the number names: not kept', async () => {
    holdFor(PROFILE);
    await text(PHONE, 'hi');
    expect(threads.addMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['a text from another number', OTHER, 'on'],
    ['the flag off', PHONE, 'off'],
  ])('%s: kept as before', async (_name, from, flag) => {
    holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    await text(from, 'sounds good');
    expect(threads.addMessage).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ content: 'sounds good', direction: 'inbound' })
    );
  });
});

describe('a reply to a check-in (recordCheckinReply)', () => {
  const run = async (userId: string) => {
    const addReply = vi.fn(async () => undefined);
    const checkin = {
      id: 'c1',
      userId,
      sessionId: 's0',
      sentAt: new Date(Date.now() - 3_600_000).toISOString(),
      question: 'q',
      status: 'sent' as const,
      phoneLast4: '4567',
      phoneHash: phoneHash(PHONE) ?? '',
    };
    const store = { forPhoneHash: async () => [checkin], addReply };
    const deps = { store: store as never, now: () => new Date(), env: process.env };
    return { id: await recordCheckinReply(PHONE, 'my school is X', 'SM1', deps), addReply };
  };

  it.each([
    ['the account', () => holdFor('teen-uid')],
    ['the number', () => holdFor(phoneHoldId(PHONE))],
  ])('held by %s: not kept', async (_name, hold) => {
    hold();
    const { id, addReply } = await run('teen-uid');
    expect(id).toBeNull();
    expect(addReply).not.toHaveBeenCalled();
  });

  it('unheld: kept under the check-in', async () => {
    const { id, addReply } = await run('adult-uid');
    expect(id).toBe('c1');
    expect(addReply).toHaveBeenCalledTimes(1);
  });
});

describe('a guarded text (sendGuardedText)', () => {
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
    } as unknown as TextStore,
    authPhone: async () => PHONE,
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => new Date(),
  });
  const guarded = (askedNow?: boolean) => ({
    userId: 'teen-uid',
    body: 'thinking of you',
    kind: 'proactive' as const,
    refId: 'r1',
    minGapMs: 60_000,
    ...(askedNow !== undefined && { askedNow }),
  });

  it.each([
    ['the account', () => holdFor('teen-uid')],
    ['the number it goes to', () => holdFor(phoneHoldId(PHONE))],
  ])('held by %s: a text they did not just ask for is not sent', async (_name, hold) => {
    hold();
    const d = deps();
    expect(await sendGuardedText(guarded(), d)).toEqual({ sent: false, reason: 'held' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('held, but asked for in the call just now: sent, and the sender is told so', async () => {
    holdFor('teen-uid');
    const d = deps();
    expect(await sendGuardedText(guarded(true), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ askedNow: true }));
  });

  it('unheld: sent as before', async () => {
    const d = deps();
    expect(await sendGuardedText(guarded(), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});

describe('outreach delivery (deliverOutreach)', () => {
  const send = (userId: string, channel: 'push' | 'sms') =>
    deliverOutreach({ userId, channel, message: 'hey', personaId: 'ferni' });

  it('held account: no push', async () => {
    holdFor(PROFILE);
    expect(await send(PROFILE, 'push')).toMatchObject({ success: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('held number (a phone call): no text to it', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await send(PROFILE, 'sms')).toMatchObject({ success: false });
    expect(sms).not.toHaveBeenCalled();
  });

  it.each([
    ['an unheld user', 'adult-uid', 'on'],
    ['the flag off', PROFILE, 'off'],
  ])('%s: delivered as before', async (_name, userId, flag) => {
    holdFor(PROFILE);
    holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    expect(await send(userId, 'push')).toMatchObject({ success: true });
    expect(await send(userId, 'sms')).toMatchObject({ success: true });
    expect(push).toHaveBeenCalledTimes(1);
    expect(sms).toHaveBeenCalledTimes(1);
  });
});
