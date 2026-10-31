/**
 * MESSAGING_PIPELINE on: the agent tools and side services that call Twilio
 * themselves refuse an opted-out number before any Twilio request. The real
 * consentBlocks runs, over an in-memory store.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    PLAID_CLIENT_ID: 'plaid-id',
    PLAID_SECRET: 'plaid-secret',
    PLAID_LINK_BASE_URL: 'https://link.example.test',
  });
});
const mem = vi.hoisted(() => ({
  consent: null as unknown as ReturnType<typeof memoryConsentStore>,
}));
vi.mock('../consent.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../consent.js')>();
  return {
    ...real,
    consentBlocks: async (...[phone, channel, allow]: Parameters<typeof real.consentBlocks>) =>
      real.consentBlocks(phone, channel, allow, {
        env: { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' },
        store: mem.consent.store,
        now: () => new Date(),
      }),
  };
});
// The Plaid owner text's guarded sender: its stores over an in-memory Firestore, and the
// account's verified phone (Firebase Auth), which is the opted-out number.
const ownerText = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../utils/firestore-utils.js', async (orig) => {
  const real = await orig<{ getFirestoreDb: () => unknown }>();
  return { ...real, getFirestoreDb: () => ownerText.db ?? real.getFirestoreDb() };
});
vi.mock('../../superhuman/firestore-utils.js', async (orig) => {
  const real = await orig<{ getFirestoreDb: () => unknown }>();
  return { ...real, getFirestoreDb: () => ownerText.db ?? real.getFirestoreDb() };
});
vi.mock('../../identity/firebase-auth.js', async (orig) => {
  const real = await orig<{ getFirebaseUser: (uid: string) => Promise<unknown> }>();
  return {
    ...real,
    getFirebaseUser: async (uid: string) =>
      ownerText.db ? { phoneNumber: '+12025550166' } : real.getFirebaseUser(uid),
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));
vi.mock('../../outreach/guarded-text.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../outreach/guarded-text.js')>()),
  isOwnVerifiedPhone: async () => false,
}));
const callsCreate = vi.hoisted(() => vi.fn(async () => ({ sid: 'CA1' })));
vi.mock('twilio', () => ({ default: () => ({ calls: { create: callsCreate } }) }));
const fetchSpy = vi.fn(async (url: string | URL) =>
  String(url).includes('plaid')
    ? new Response(JSON.stringify({ link_token: 'link-sandbox-1' }), { status: 200 })
    : new Response('{}', { status: 201 })
);
vi.stubGlobal('fetch', fetchSpy);

import { SmsSender } from '../../concierge/outreach/sms-sender.js';
import { PhoneCaller } from '../../concierge/outreach/phone-caller.js';
import { ConferenceCallManager } from '../../../agents/group-conversation/conference-call-manager.js';
import { schedulingExecutor } from '../../../agents/shared/tool-executors/scheduling-executor.js';
import { createCommunicationTools } from '../../../tools/domains/communication/communication-tools.js';
import { createPlaidTools } from '../../../tools/domains/finance/plaid.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { consentBlocks, writeOptOut } from '../consent.js';
import { registerConsentCheck, registerGrantChecks } from '../../../utils/consent-port.js';
import { recordOwnerAttestation } from '../consent-grants.js';
import { ownerRefusal, thirdPartyRefusal } from '../consent-reach.js';
import { setCallUserPort } from '../../../tools/domains/proactive/outreach/call-user-port.js';
import { callUserAdapter } from '../../outreach/call-user-adapter.js';
import { pathFirestore } from '../../outreach/proactive-channels/__tests__/path-firestore.js';

// The senders below L4 ask the port; register it as each process entry does, over the memory store.
registerConsentCheck((phone, channel, allow) => consentBlocks(phone, channel, allow));
registerGrantChecks({ thirdPartyRefusal, recordOwnerAttestation, ownerRefusal });

const PHONE = '+12025550166';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const target = { id: 't1', requestId: 'r1', name: 'Example Dental', phone: PHONE, attempts: 0 };
/** A request to Twilio, by host (not a substring of the whole URL). */
const isTwilio = (u: unknown): boolean => {
  try {
    const host = new URL(String(u)).hostname;
    return host === 'twilio.com' || host.endsWith('.twilio.com');
  } catch {
    return false;
  }
};
const twilioCalls = () => fetchSpy.mock.calls.filter(([u]) => isTwilio(u));

beforeEach(async () => {
  mem.consent = memoryConsentStore();
  const deps = { env, store: mem.consent.store, now: () => new Date() };
  const hash = phoneHash(PHONE, env) as string;
  await writeOptOut(hash, 'sms', 'inbound-sms', deps);
  await writeOptOut(hash, 'call', 'voice-call', deps);
  vi.clearAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

describe('concierge', () => {
  it('SmsSender refuses before sending', async () => {
    const result = await new SmsSender({ userId: 'u1', userName: 'Pat' }).send({
      target,
      domain: 'dental',
      type: 'inquiry',
      requirements: {},
      customMessage: 'hi',
    } as unknown as Parameters<SmsSender['send']>[0]);
    expect(result).toMatchObject({ success: false });
    expect(String(result.error)).toContain('opted-out');
  });

  it('PhoneCaller refuses before dialling', async () => {
    const result = await new PhoneCaller({ userId: 'u1', userName: 'Pat' }).call({
      target,
      domain: 'dental',
      requirements: {},
    } as unknown as Parameters<PhoneCaller['call']>[0]);
    expect(result).toEqual({ success: false, error: 'Not calling: opted-out' });
  });
});

it('conference-call-manager does not dial a participant who opted out', async () => {
  const manager = new ConferenceCallManager({
    room: {} as never,
    sessionId: 's1',
    userId: 'u1',
    webhookBaseUrl: 'https://app.example.test',
    twilio: { accountSid: 'AC_test', authToken: 'token', phoneNumber: '+12025550100' },
  } as unknown as ConstructorParameters<typeof ConferenceCallManager>[0]);
  const result = await manager.addParticipant({ phoneNumber: PHONE, name: 'Pat Example' } as never);
  expect(result).toEqual({ success: false, error: 'Not calling: opted-out' });
  expect(callsCreate).not.toHaveBeenCalled();
});

it('conference-call-manager does not dial a participant who never agreed to calls', async () => {
  mem.consent = memoryConsentStore();
  const manager = new ConferenceCallManager({
    room: {} as never,
    sessionId: 's1',
    userId: 'u1',
    webhookBaseUrl: 'https://app.example.test',
    twilio: { accountSid: 'AC_test', authToken: 'token', phoneNumber: '+12025550100' },
  } as unknown as ConstructorParameters<typeof ConferenceCallManager>[0]);
  const result = await manager.addParticipant({ phoneNumber: PHONE, name: 'Pat Example' } as never);
  expect(result).toEqual({ success: false, error: 'Not calling: needs-consent' });
  expect(callsCreate).not.toHaveBeenCalled();
});

it('scheduling executor makePhoneCall refuses an opted-out number', async () => {
  const reply = await schedulingExecutor.execute(
    'makePhoneCall',
    { phoneNumber: PHONE, message: 'running late' },
    { userId: 'u1', personaId: 'ferni' } as never
  );
  expect(String(reply)).toContain('asked not to be called');
  expect(twilioCalls()).toHaveLength(0);
});

it('communication tools makePhoneCall refuses an opted-out number', async () => {
  const tools = createCommunicationTools() as unknown as Record<
    string,
    { execute: (args: Record<string, unknown>, ctx: unknown) => Promise<unknown> }
  >;
  const reply = await tools.makePhoneCall.execute({ phoneNumber: PHONE, message: 'hi' }, {});
  expect(String(reply)).toContain('asked not to be called');
  expect(twilioCalls()).toHaveLength(0);
});

describe('plaid linkBankAccount by text: the guarded owner text to the verified phone', () => {
  const linkByText = (verifiedCaller: boolean) =>
    (
      createPlaidTools() as unknown as Record<
        string,
        { execute: (args: Record<string, unknown>, ctx: unknown) => Promise<unknown> }
      >
    ).linkBankAccount.execute(
      { userId: 'someone-else', deliveryMethod: 'sms', contact: '+12025550177' },
      { ctx: { userData: { userId: 'u1', verifiedCaller } } }
    );

  beforeEach(() => {
    vi.stubEnv('LOG_HASH_SECRET', env.LOG_HASH_SECRET); // the guarded sender keys records by phone hash
    ownerText.db = pathFirestore(new Map());
    setCallUserPort(callUserAdapter);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    ownerText.db = null;
    setCallUserPort(undefined);
  });

  it('will not text the link when the verified phone opted out', async () => {
    const reply = await linkByText(true);
    expect(String(reply)).toContain('you replied STOP');
    expect(twilioCalls()).toHaveLength(0);
  });

  it('control: the same verified phone with no opt-out on record is not refused as STOP', async () => {
    mem.consent = memoryConsentStore();
    expect(String(await linkByText(true))).not.toContain('you replied STOP');
  });

  it('a caller the server did not verify: nothing sent', async () => {
    const reply = await linkByText(false);
    expect(String(reply)).toContain('signed in to the Ferni app');
    expect(twilioCalls()).toHaveLength(0);
  });
});

it("plaid linkBankAccount acts only for the session's caller, never a model-supplied id", async () => {
  const tools = createPlaidTools() as unknown as Record<
    string,
    { execute: (args: Record<string, unknown>, ctx: unknown) => Promise<unknown> }
  >;
  const reply = await tools.linkBankAccount.execute(
    { userId: 'u1', deliveryMethod: 'sms', contact: PHONE },
    {}
  );
  expect(String(reply)).toContain("only send the link to the person I'm talking with");
  expect(twilioCalls()).toHaveLength(0);
});
