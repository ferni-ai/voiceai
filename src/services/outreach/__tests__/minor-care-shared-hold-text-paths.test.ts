/**
 * MINOR_CARE_SHARED_HOLD on the texting paths that skip delivery/sms-delivery.ts: sendSMS in
 * communication-service.ts (outreach integration, task queue, batch contact texts, phone
 * verification, voice-message fallback), the voice-message MMS (reminder-scheduler.ts),
 * notification-delivery.ts deliverSms and unified-delivery.ts deliver('sms'). None texts an
 * account or a number a call held under 18; the code a person asked for in the call still goes.
 * The real senders run; only Twilio, consent, Firestore and the hold store are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
  });
});
const fetchSpy = vi.hoisted(() =>
  vi.fn(async () => new Response('{"sid":"SM1"}', { status: 201 }))
);
vi.stubGlobal('fetch', fetchSpy);
const twilio = vi.hoisted(() => ({
  messagesCreate: vi.fn(async () => ({ sid: 'SM1', status: 'queued' })),
}));
vi.mock('twilio', () => ({ default: () => ({ messages: { create: twilio.messagesCreate } }) }));
vi.mock('../../messaging/consent.js', async (orig) => ({
  ...(await orig<object>()),
  consentBlocks: async () => null,
}));
const firestore = vi.hoisted(() => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ phone: '+15551234567' }) }) }),
    }),
  }),
}));
vi.mock('../../../utils/firebase-admin-app.js', async (orig) => ({
  ...(await orig<object>()),
  getAdminFirestore: firestore.getAdminFirestore,
}));
vi.mock('../../contacts/contact-relationship-service.js', async (orig) => ({
  ...(await orig<object>()),
  getContact: async () => ({ id: 'c1' }),
  recordInteraction: async () => undefined,
}));
vi.mock('../../trust-and-identity/verification-store.js', async (orig) => ({
  ...(await orig<object>()),
  createVerificationCode: async () => ({ code: '123456', expiresAt: new Date() }),
}));
vi.mock('../../trust-and-identity/identity-orchestrator.js', async (orig) => ({
  ...(await orig<object>()),
  startIdentitySession: async () => ({ userId: 'teen-uid' }),
  generateIdentityContextForLLM: () => '',
}));

const { sendSMS } = await import('../../communication-service.js');
const { executeOutreach, setUserPreferences } =
  await import('../../trust-systems/outreach-integration.js');
const { getTaskHandler } = await import('../../scheduling/task-queue.js');
const { sendBatchMessages } = await import('../../contacts/personalized-outreach.js');
const { onSessionStart, startPhoneVerification } =
  await import('../../trust-and-identity/voice-agent-integration.js');
const { createVoiceMessage, sendVoiceMessage } =
  await import('../../scheduling/reminder-scheduler.js');
const { deliverSms } = await import('../../trust-systems/notification-delivery.js');
const { deliver } = await import('../unified-delivery.js');
const { phoneHoldId } = await import('../checkin-replies.js');
const { setHoldStore } = await import('../minor-care-shared-hold.js');
type OutreachItem = import('../../trust-systems/outreach-integration.js').OutreachItem;
type PersonalizedMessage = import('../../../types/contacts.js').PersonalizedMessage;
type BackgroundTask = import('../../scheduling/background-types.js').BackgroundTask;

const PHONE = '+15551234567';
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);
const sent = () => fetchSpy.mock.calls.length + twilio.messagesCreate.mock.calls.length;

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  holds.clear();
  setHoldStore({ heldUntil: async (key) => holds.get(key), write: async () => undefined });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

describe('communication-service sendSMS', () => {
  it.each([
    ['the account', () => holdFor('teen-uid')],
    ['the number', () => holdFor(phoneHoldId(PHONE))],
  ])('held by %s: throws, Twilio untouched', async (_name, hold) => {
    hold();
    await expect(sendSMS(PHONE, 'hi', { userId: 'teen-uid' })).rejects.toThrow('held');
    expect(sent()).toBe(0);
  });

  it('held, but asked for just now (a code): sent', async () => {
    holdFor('teen-uid');
    await sendSMS(PHONE, 'code', { userId: 'teen-uid', askedNow: true });
    expect(sent()).toBe(1);
  });

  it.each([
    ['unheld', 'on'],
    ['flag off', 'off'],
  ])('%s: sent as before', async (name, flag) => {
    if (name === 'flag off') holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    await sendSMS(PHONE, 'hi', { userId: 'teen-uid' });
    expect(sent()).toBe(1);
  });
});

/** Each caller names the member, so a hold on the account alone (not the number) stops it. */
describe('callers of sendSMS pass the member: an account-only hold stops them', () => {
  const item = (userId: string): OutreachItem => ({
    id: `i-${userId}`,
    userId,
    type: 'thinking_of_you',
    priority: 'medium',
    message: 'thinking of you',
    ssml: '',
    scheduledFor: new Date(),
    metadata: {},
  });
  const msg = { approved: true, channel: 'sms', channelValue: PHONE, message: 'hi' };
  const paths: Array<[string, (userId: string) => Promise<unknown>]> = [
    [
      'outreach integration (proactive text)',
      (userId) => {
        setUserPreferences(userId, {
          enabled: true,
          quietHoursStart: '0:00',
          quietHoursEnd: '0:00',
        });
        return executeOutreach(item(userId), 'sms');
      },
    ],
    [
      'task queue send_sms',
      (userId) =>
        getTaskHandler('send_sms')!({
          userId,
          parameters: { to: PHONE, message: 'hi' },
        } as unknown as BackgroundTask).catch(() => undefined),
    ],
    [
      'batch contact texts',
      (userId) => sendBatchMessages(userId, [{ ...msg, contactId: 'c1' } as PersonalizedMessage]),
    ],
    [
      'voice message (MMS, else SMS)',
      async (userId) => {
        const voice = await createVoiceMessage({ userId, message: 'hi' });
        return sendVoiceMessage(voice.id, PHONE).catch(() => undefined);
      },
    ],
    ['notification delivery', (userId) => deliverSms(item(userId), PHONE)],
    [
      'unified delivery',
      (userId) =>
        deliver({
          userId,
          channel: 'sms',
          phone: PHONE,
          content: { text: 'hi', ssml: '' },
          outreachType: 'check_in',
        } as unknown as Parameters<typeof deliver>[0]),
    ],
  ];

  it.each(paths)('%s: held account, not sent', async (_name, run) => {
    holdFor('teen-uid');
    await run('teen-uid');
    expect(sent()).toBe(0);
  });

  it.each(paths)('%s: unheld, sent as before', async (_name, run) => {
    holdFor('teen-uid');
    await run('adult-uid');
    expect(sent()).toBe(1);
  });

  it.each(paths)('%s: flag off, sent as before', async (_name, run) => {
    holdFor('teen-uid');
    holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    await run('teen-uid');
    expect(sent()).toBe(1);
  });

  // The hold is checked on the number the MMS dials, so a spelling the hold key can't read is held
  it.each(['555/123/4567', 'tel:+15551234567', '555-123-4567 ext'])(
    'voice message to %j, a held number: not sent',
    async (spelled) => {
      holdFor(phoneHoldId(PHONE));
      const voice = await createVoiceMessage({ userId: 'adult-uid', message: 'hi' });
      expect(await sendVoiceMessage(voice.id, spelled)).toBe('Not sent: held');
      expect(sent()).toBe(0);
    }
  );

  it('voice message, held: says it was not sent', async () => {
    holdFor(phoneHoldId(PHONE));
    const voice = await createVoiceMessage({ userId: 'adult-uid', message: 'hi' });
    expect(await sendVoiceMessage(voice.id, PHONE)).toBe('Not sent: held');
  });
});

describe('phone verification code (asked for in the call)', () => {
  it('held account and number: the code still goes', async () => {
    holdFor('teen-uid');
    holdFor(phoneHoldId(PHONE));
    await onSessionStart('s-verify', {});
    expect(await startPhoneVerification('s-verify', PHONE)).toMatchObject({ success: true });
    expect(sent()).toBe(1);
  });
});
