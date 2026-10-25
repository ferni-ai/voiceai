/**
 * MESSAGING_PIPELINE on: every call path tells the shared senders whose call
 * it is, and they refuse a number that isn't that owner's own verified number
 * unless the owner holds a call grant (fails closed with no owner). Each path
 * below refuses Mom with no grant, and places the call to the owner's own
 * number. The real consent code runs over an in-memory Firestore.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConsentDb } from './memory-consent.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    TWILIO_STREAM_WEBHOOK_URL: 'wss://stream.example.test',
    LIVEKIT_URL: 'wss://livekit.example.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
  });
});
const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof fakeConsentDb> }));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fake.db.db,
}));
vi.mock('../../superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => null,
}));
const OWN = '+12025550101';
vi.mock('../../outreach/guarded-text.js', async (orig) => ({
  ...(await orig<typeof import('../../outreach/guarded-text.js')>()),
  // Only u1's own number is u1's.
  isOwnVerifiedPhone: async (uid: string, phone: string) =>
    uid === 'u1' && phone.replace(/\D/g, '') === '12025550101',
}));
vi.mock('../../outreach/deferred-calls.js', () => ({
  holdForCallHours: async () => ({ id: 'held' }),
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));
vi.mock('../../background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: vi.fn(async () => undefined),
}));
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async (_u: string, q: string) =>
    q === 'Mom'
      ? [{ id: 'c-mom', name: 'Mom', phone: '+12025550177' }]
      : q === 'Me'
        ? [{ id: 'c-me', name: 'Me', phone: '+12025550101' }]
        : []
  ),
  recordInteraction: vi.fn(async () => undefined),
  getContact: vi.fn(),
  getContactContext: vi.fn(),
  getInteractionHistory: vi.fn(async () => []),
  getTopicsToDiscuss: vi.fn(async () => []),
}));
vi.mock('../../../tools/domains/communication/outreach/message-crafting.js', () => ({
  craftPersonalizedMessage: vi.fn(async () => 'Thinking of you'),
}));
const fetchSpy = vi.fn(
  async (_url: string | URL, _init?: unknown) =>
    new Response(JSON.stringify({ sid: 'CA1' }), { status: 201 })
);
vi.stubGlobal('fetch', fetchSpy);

import { callWithPersonaVoice } from '../../voice/voice-call.js';
import { makeConversationalCall } from '../../voice/conversational-call-service.js';
import { scheduleProactiveCall } from '../../outreach/conversational-calls.js';
import {
  makeConversationalReferralCall,
  makeVoiceReferralCall,
} from '../../../tools/domains/referral/voice-referral.js';
import { schedulingExecutor } from '../../../agents/shared/tool-executors/scheduling-executor.js';
import { createCommunicationTools } from '../../../tools/domains/communication/communication-tools.js';
import { executeCall } from '../../background-agents/executors/call-executor.js';
import { createMultiOutreachTool } from '../../../tools/domains/communication/outreach/multi-outreach.js';
import { registerMessagingConsent } from '../consent.js';

// The senders below L4 ask utils/consent-port.ts; register it as each process entry does.
registerMessagingConsent();

const MOM = '+12025550177';
const twilioCalls = () =>
  fetchSpy.mock.calls.filter(([u]) => String(u).includes('/Calls.json')).length;

beforeEach(() => {
  fake.db = fakeConsentDb();
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  fetchSpy.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => vi.unstubAllGlobals());

describe('voice-call callWithPersonaVoice', () => {
  it("refuses Mom for an owner with no grant, and with no owner at all; rings the owner's own", async () => {
    expect(await callWithPersonaVoice(MOM, 'hi', 'ferni', { ownerUid: 'u1' })).toMatchObject({
      success: false,
      message: 'Not calling: needs-consent',
    });
    expect(await callWithPersonaVoice(OWN, 'hi', 'ferni')).toMatchObject({ success: false });
    expect(twilioCalls()).toBe(0);
    await callWithPersonaVoice(OWN, 'hi', 'ferni', { ownerUid: 'u1', fallbackToTwilioVoice: true });
    expect(twilioCalls()).toBe(1);
  });
});

describe('voice/conversational-call-service makeConversationalCall (backgroundCall)', () => {
  const req = (phone: string) =>
    ({ userId: 'u1', phone, recipientName: 'Pat', purpose: 'check in' }) as Parameters<
      typeof makeConversationalCall
    >[0];
  it("refuses Mom; the owner's own number gets past the gate", async () => {
    expect(await makeConversationalCall(req(MOM))).toMatchObject({
      success: false,
      message: 'Not calling: needs-consent',
    });
    expect((await makeConversationalCall(req(OWN))).message).not.toMatch(/^Not calling/);
  });
});

describe('outreach scheduleProactiveCall (multiOutreach conversation, callUser)', () => {
  const req = (phoneNumber: string) => ({
    userId: 'u1',
    phoneNumber,
    message: 'hi',
    ssml: '<speak>hi</speak>',
    personaId: 'ferni',
    reason: 'test',
  });
  it("refuses Mom; holds the owner's own call for calling hours", async () => {
    expect(await scheduleProactiveCall(req(MOM))).toEqual({
      success: false,
      error: 'Not calling: needs-consent',
    });
    expect(await scheduleProactiveCall(req(OWN))).toMatchObject({ success: true });
  });
});

describe('voice-referral', () => {
  const ref = (recipientPhone: string) => ({
    referrerId: 'u1',
    referrerName: 'Seth',
    recipientName: 'Pat',
    recipientPhone,
  });
  it("the voice-message referral is placed for the referrer: Mom refused, the referrer's own rings", async () => {
    expect((await makeVoiceReferralCall(ref(MOM))).success).toBe(false);
    expect(twilioCalls()).toBe(0);
    await makeVoiceReferralCall(ref(OWN));
    expect(twilioCalls()).toBe(1);
  });
  it('the conversational referral acts for the referrer, and a refusal is reported', async () => {
    vi.stubEnv('TWILIO_STREAM_WEBHOOK_URL', 'wss://stream.example.test');
    const out = await makeConversationalReferralCall(ref(MOM));
    expect(out.success).toBe(false);
    expect(twilioCalls()).toBe(0);
    expect((await makeConversationalReferralCall(ref(OWN))).success).toBe(true);
  });
});

describe('agent tools', () => {
  it('scheduling executor makePhoneCall: Mom refused for the caller; their own number rung', async () => {
    const run = async (phoneNumber: string) =>
      schedulingExecutor.execute('makePhoneCall', { phoneNumber, message: 'hi' }, {
        userId: 'u1',
        personaId: 'ferni',
      } as never);
    expect(String(await run(MOM))).toContain("haven't said yes");
    expect(twilioCalls()).toBe(0);
    await run(OWN);
    expect(twilioCalls()).toBe(1);
  });

  it('communication tools makePhoneCall: Mom refused for the caller; their own number rung', async () => {
    const tools = createCommunicationTools() as unknown as Record<
      string,
      { execute: (a: Record<string, unknown>, o: unknown) => Promise<unknown> }
    >;
    const opts = { ctx: { userData: { userId: 'u1' } } };
    expect(
      String(await tools.makePhoneCall.execute({ phoneNumber: MOM, message: 'hi' }, opts))
    ).toContain("haven't said yes");
    expect(twilioCalls()).toBe(0);
    await tools.makePhoneCall.execute({ phoneNumber: OWN, message: 'hi' }, opts);
    expect(twilioCalls()).toBe(1);
  });
});

describe('background call (call-executor executeCall)', () => {
  it('refuses Mom for the user who asked', async () => {
    const out = await executeCall({
      userId: 'u1',
      contactName: 'Mom',
      contactPhone: MOM,
      objective: 'hi',
    });
    expect(out.success).toBe(false);
    expect(twilioCalls()).toBe(0);
  });
});

describe('multiOutreach call to Mom (test-only OUTBOUND_CONFIRM=off sends at once)', () => {
  it("is refused for the caller with no grant from Mom; the caller's own number rings", async () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    const tool = createMultiOutreachTool({
      userId: 'u1',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    });
    await (tool as unknown as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
      { targets: [{ contact: 'Mom', channel: 'call', message: 'hi' }] },
      {}
    );
    expect(twilioCalls()).toBe(0);
    await (tool as unknown as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
      { targets: [{ contact: 'Me', channel: 'call', message: 'hi' }] },
      {}
    );
    expect(twilioCalls()).toBe(1);
  });
});
