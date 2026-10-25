/**
 * MINOR_CARE_SHARED_HOLD on the senders that reach Twilio themselves (no sendSMS, no delivery
 * service): the group call (conference-call-manager), the Twilio SMS adapter (external-apis),
 * the voice-message MMS (contacts), and the in-call tools: communication-tools makePhoneCall,
 * the scheduling executor's makePhoneCall, and the communication and legacy executors' text and
 * voice message. None reaches an account, or a number, a call held under 18; the code a person
 * asked for still goes. The real senders run; only Twilio, ElevenLabs/GCS, the contact lookup,
 * consent and the hold store are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    ELEVENLABS_API_KEY: 'el-test',
    GCS_BUCKET_NAME: 'bucket-test',
  });
});
const twilio = vi.hoisted(() => {
  const callsCreate = vi.fn(async (..._a: unknown[]) => ({ sid: 'CA1', status: 'queued' }));
  const messagesCreate = vi.fn(async (..._a: unknown[]) => ({ sid: 'SM1', status: 'queued' }));
  const client = { calls: { create: callsCreate }, messages: { create: messagesCreate } };
  return { callsCreate, messagesCreate, client };
});
vi.mock('twilio', () => ({
  default: () => twilio.client,
  Twilio: function Twilio() {
    return twilio.client;
  },
}));
const fetchSpy = vi.hoisted(() =>
  vi.fn(async (url: string | URL) =>
    String(url).includes('elevenlabs')
      ? new Response(new Uint8Array([1, 2, 3]), { status: 200 })
      : new Response('{"sid":"X1"}', { status: 201 })
  )
);
vi.stubGlobal('fetch', fetchSpy);
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file: () => ({ save: async () => undefined, makePublic: async () => undefined }) };
    }
  },
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));
vi.mock('../../messaging/consent.js', async (orig) => ({
  ...(await orig<object>()),
  consentBlocks: async () => null,
}));
vi.mock('../voice-synthesis.js', () => ({
  isVoiceSynthesisAvailable: () => true,
  generateVoiceMessage: async () => ({ audioUrl: 'https://media.example.test/a.mp3' }),
}));
vi.mock('../../contacts/contact-relationship-service.js', async (orig) => ({
  ...(await orig<object>()),
  searchContacts: async () => [{ name: 'Pat', phone: '+15551234567' }],
}));

const { ConferenceCallManager } =
  await import('../../../agents/group-conversation/conference-call-manager.js');
const { sendSMS, sendVerificationCode } = await import('../../external-apis/twilio-sms.js');
const { sendVoiceMessageMMS } = await import('../../contacts/voice-message-service.js');
const { createCommunicationTools } =
  await import('../../../tools/domains/communication/communication-tools.js');
const { schedulingExecutor } =
  await import('../../../agents/shared/tool-executors/scheduling-executor.js');
const { communicationExecutor } =
  await import('../../../agents/shared/tool-executors/communication-executor.js');
const { executeLegacyFallback } =
  await import('../../../agents/shared/tool-executors/legacy-fallback-executor.js');
const { phoneHoldId } = await import('../checkin-replies.js');
const { setHoldStore, sharedHeld } = await import('../minor-care-shared-hold.js');

const PHONE = '+15551234567';
const UID = 'teen-uid';
const holds = new Map<string, number>();
const holdFor = (key: string | undefined) => holds.set(key ?? 'none', Date.now() + 60_000);
const isTwilio = (u: unknown): boolean => {
  try {
    const host = new URL(String(u)).hostname;
    return host === 'twilio.com' || host.endsWith('.twilio.com');
  } catch {
    return false;
  }
};
/** Every request that reached Twilio: its REST API by fetch, or the SDK's create(). */
const sent = () =>
  fetchSpy.mock.calls.filter(([u]) => isTwilio(u)).length +
  twilio.callsCreate.mock.calls.length +
  twilio.messagesCreate.mock.calls.length;

type Tools = Record<
  string,
  { execute: (a: Record<string, unknown>, o: unknown) => Promise<unknown> }
>;
const ctx = { userId: UID, personaId: 'ferni' } as never;

/** Each direct sender, run as its callers run it, for the member UID to PHONE. */
const SENDERS: Array<[string, () => Promise<unknown>]> = [
  [
    'conference-call-manager addParticipant',
    () =>
      new ConferenceCallManager({
        room: {} as never,
        sessionId: 's1',
        userId: UID,
        webhookBaseUrl: 'https://app.example.test',
        twilio: { accountSid: 'AC_test', authToken: 'token', phoneNumber: '+12025550100' },
      } as unknown as ConstructorParameters<typeof ConferenceCallManager>[0]).addParticipant({
        phoneNumber: PHONE,
        name: 'Pat',
      } as never),
  ],
  [
    'voice-message-service sendVoiceMessageMMS',
    () =>
      sendVoiceMessageMMS({
        userId: UID,
        contactId: 'c1',
        contactName: 'Pat',
        contactPhone: PHONE,
        message: 'hi',
        deliveryMethod: 'mms',
      }),
  ],
  [
    'communication-tools makePhoneCall',
    () =>
      (createCommunicationTools() as unknown as Tools).makePhoneCall.execute(
        { phoneNumber: PHONE, message: 'hi' },
        { ctx: { userData: { userId: UID } } }
      ),
  ],
  [
    'communication-tools sendTextMessage (sendSMS, now told the member)',
    () => {
      vi.stubEnv('ON_BEHALF_TEXT_GUARD', 'off'); // its store is Firestore; sendSMS is under test
      return (createCommunicationTools() as unknown as Tools).sendTextMessage.execute(
        { to: PHONE, message: 'hi' },
        { ctx: { userData: { userId: UID } } }
      );
    },
  ],
  [
    'scheduling-executor makePhoneCall',
    async () =>
      schedulingExecutor.execute('makePhoneCall', { phoneNumber: PHONE, message: 'hi' }, ctx),
  ],
  [
    'communication-executor sendText',
    async () =>
      communicationExecutor.execute('sendText', { contactName: 'Pat', message: 'hi' }, ctx),
  ],
  [
    'communication-executor sendVoiceMessage',
    async () =>
      communicationExecutor.execute('sendVoiceMessage', { contactName: 'Pat', message: 'hi' }, ctx),
  ],
  [
    'legacy-fallback sendText',
    () => executeLegacyFallback('sendText', { contactName: 'Pat', message: 'hi' }, ctx),
  ],
  [
    'legacy-fallback sendVoiceMessage',
    () => executeLegacyFallback('sendVoiceMessage', { contactName: 'Pat', message: 'hi' }, ctx),
  ],
];

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  vi.stubEnv('MESSAGING_PIPELINE', 'off');
  holds.clear();
  setHoldStore({ heldUntil: async (key) => holds.get(key), write: async () => undefined });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setHoldStore();
});

describe.each(SENDERS)('%s', (_name, send) => {
  it('held by the account: nothing reaches Twilio', async () => {
    holdFor(UID);
    expect(await sharedHeld(UID)).toBe(true);
    await send().catch(() => undefined); // sendSMS throws 'held'
    expect(sent()).toBe(0);
  });

  it('held by the number: nothing reaches Twilio', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await sharedHeld(phoneHoldId(PHONE))).toBe(true);
    await send().catch(() => undefined);
    expect(sent()).toBe(0);
  });

  it('not held: sent as before', async () => {
    expect(await sharedHeld(UID)).toBe(false);
    expect(await sharedHeld(phoneHoldId(PHONE))).toBe(false);
    await send();
    expect(sent()).toBe(1);
  });

  it('flag off: sent as before, even with a hold on record', async () => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    holdFor(UID);
    holdFor(phoneHoldId(PHONE));
    expect(await sharedHeld(UID)).toBe(false);
    await send();
    expect(sent()).toBe(1);
  });
});

/** The adapter has no account to check (its one caller sends a code): the number is held. */
describe('external-apis twilio-sms', () => {
  it('held number: sendSMS sends nothing', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await sharedHeld(phoneHoldId(PHONE))).toBe(true);
    expect(await sendSMS(PHONE, 'hi')).toBeNull();
    expect(sent()).toBe(0);
  });

  it('held account named by the caller: sendSMS sends nothing', async () => {
    holdFor(UID);
    expect(await sharedHeld(UID)).toBe(true);
    expect(await sendSMS(PHONE, 'hi', { userId: UID })).toBeNull();
    expect(sent()).toBe(0);
  });

  it('held, but the code they asked for just now: sent', async () => {
    holdFor(phoneHoldId(PHONE));
    expect(await sharedHeld(phoneHoldId(PHONE))).toBe(true);
    expect(await sendVerificationCode(PHONE, '123456')).toBe('SM1');
    expect(sent()).toBe(1);
  });

  it.each([
    ['not held', 'on'],
    ['flag off', 'off'],
  ])('%s: sent as before', async (name, flag) => {
    if (name === 'flag off') holdFor(phoneHoldId(PHONE));
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', flag);
    expect(await sharedHeld(phoneHoldId(PHONE))).toBe(false);
    expect(await sendSMS(PHONE, 'hi')).toBe('SM1');
    expect(sent()).toBe(1);
  });
});
