/**
 * MESSAGING_PIPELINE on: the shared senders every caller ends up in refuse a
 * number that opted out, before Twilio is touched. Each test asserts the
 * refusal names the opt-out, so it can only pass because the consent gate
 * fired. The real consentBlocks runs, over an in-memory store.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';

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
const twilio = vi.hoisted(() => ({
  messagesCreate: vi.fn(async () => ({ sid: 'SM1', status: 'queued' })),
  callsCreate: vi.fn(async () => ({ sid: 'CA1' })),
}));
vi.mock('twilio', () => {
  const client = () => ({
    messages: { create: twilio.messagesCreate },
    calls: { create: twilio.callsCreate },
  });
  return { default: Object.assign(client, { validateRequest: () => true }) };
});
const fetchSpy = vi.fn(async () => new Response('{}', { status: 201 }));
vi.stubGlobal('fetch', fetchSpy);

import { callWithPersonaVoice } from '../../voice/voice-call.js';
import { makeConversationalCall } from '../../voice/conversational-call-service.js';
import { sendSMS as sendRestSms } from '../../communication-service.js';
import { deliver } from '../../outreach/unified-delivery.js';
import {
  initializeSMSDelivery,
  sendSMS as sendDeliverySms,
} from '../../outreach/delivery/sms-delivery.js';
import { sendSMS as sendBreakerSms } from '../../external-apis/twilio-sms.js';
import { initializeSIPBridge, initiateConversationalCall } from '../../outreach/sip-bridge.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { consentBlocks, writeOptOut } from '../consent.js';
import { registerConsentCheck } from '../../../utils/consent-port.js';

// The senders below L4 ask the port; register it as each process entry does, over the memory store.
registerConsentCheck((phone, channel, allow) => consentBlocks(phone, channel, allow));

const PHONE = '+12025550155';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };

beforeEach(async () => {
  mem.consent = memoryConsentStore();
  const deps = { env, store: mem.consent.store, now: () => new Date() };
  const hash = phoneHash(PHONE, env) as string;
  await writeOptOut(hash, 'sms', 'inbound-sms', deps);
  await writeOptOut(hash, 'call', 'voice-call', deps);
  vi.clearAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

const untouched = () => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(twilio.messagesCreate).not.toHaveBeenCalled();
  expect(twilio.callsCreate).not.toHaveBeenCalled();
};

describe('calls', () => {
  it('voice-call callWithPersonaVoice (callUser, outreach call tools, voicemail)', async () => {
    expect(await callWithPersonaVoice(PHONE, 'hi')).toEqual({
      success: false,
      message: 'Not calling: opted-out',
    });
    untouched();
  });

  it('conversational-call-service makeConversationalCall', async () => {
    const result = await makeConversationalCall({
      phone: PHONE,
      recipientName: 'Pat Example',
      userId: 'u1',
      purpose: 'check in',
    } as Parameters<typeof makeConversationalCall>[0]);
    expect(result).toMatchObject({ success: false, message: 'Not calling: opted-out' });
    untouched();
  });

  it('sip-bridge initiateConversationalCall', async () => {
    initializeSIPBridge({
      twilioAccountSid: 'AC_test',
      twilioAuthToken: 'token',
      twilioPhoneNumber: '+12025550100',
      livekitHost: 'wss://livekit.example.test',
      livekitApiKey: 'key',
      livekitApiSecret: 'secret',
      sipTrunkNumber: '+12025550100',
      sipDomain: 'sip.example.test',
    } as Parameters<typeof initializeSIPBridge>[0]);
    const result = await initiateConversationalCall({
      userId: 'u1',
      toPhone: PHONE,
      personaId: 'ferni',
      message: 'hi',
      webhookBaseUrl: 'https://app.example.test',
    } as Parameters<typeof initiateConversationalCall>[0]);
    expect(result).toEqual({ success: false, error: 'Not calling: opted-out' });
    untouched();
  });
});

describe('texts', () => {
  it('communication-service sendSMS (raw REST)', async () => {
    await expect(sendRestSms(PHONE, 'hi')).rejects.toThrow('SMS not sent: opted-out');
    untouched();
  });

  it('unified-delivery deliver (sms)', async () => {
    const result = await deliver({
      userId: 'u1',
      channel: 'sms',
      phone: PHONE,
      content: { text: 'hi' },
      outreachType: 'check_in',
    } as unknown as Parameters<typeof deliver>[0]);
    expect(result).toMatchObject({ success: false, error: 'Not sent: opted-out' });
    untouched();
  });

  it('delivery/sms-delivery sendSMS (the guarded sender transport)', async () => {
    initializeSMSDelivery({
      twilioAccountSid: 'AC_test',
      twilioAuthToken: 'token',
      twilioPhoneNumber: '+12025550100',
    } as Parameters<typeof initializeSMSDelivery>[0]);
    const result = await sendDeliverySms({
      to: PHONE,
      body: 'hi',
      personaId: 'ferni',
      userId: 'u1',
    } as Parameters<typeof sendDeliverySms>[0]);
    expect(result).toEqual({ success: false, error: 'Not sent: opted-out' });
    untouched();
  });

  it('external-apis/twilio-sms sendSMS', async () => {
    expect(await sendBreakerSms(PHONE, 'hi')).toBeNull();
    untouched();
  });
});
