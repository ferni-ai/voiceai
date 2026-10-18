/**
 * MESSAGING_PIPELINE on: callUser's call path (conversational-calls), the
 * on-behalf first dial, and the proactive tick's text and call read
 * consent/{phoneHash} and refuse an opted-out number. Off: as today.
 * The real consentBlocks runs, over an in-memory store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';

const mem = vi.hoisted(() => ({
  consent: null as unknown as ReturnType<typeof memoryConsentStore>,
}));
vi.mock('../consent.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../consent.js')>();
  return {
    ...real,
    consentBlocks: async (...[phone, channel, allow]: Parameters<typeof real.consentBlocks>) =>
      real.consentBlocks(phone, channel, allow, {
        env: process.env,
        store: mem.consent.store,
        now: () => new Date(),
      }),
  };
});

const holdForCallHours = vi.hoisted(() => vi.fn(async () => ({ id: 'held-1' })));
vi.mock('../../outreach/deferred-calls.js', () => ({ holdForCallHours }));
vi.mock('../../outreach/quiet-hours.js', () => ({ callQuietHours: vi.fn() }));
const sendSMS = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../../communication-service.js', () => ({ sendSMS }));
const placeSelfCall = vi.hoisted(() => vi.fn(async () => 'answered'));
vi.mock('../../outreach/proactive-channels/self-call.js', () => ({
  canPlaceCalls: () => true,
  placeSelfCall,
}));
vi.mock('../../outreach/unified-delivery.js', () => ({ saveInAppMessage: vi.fn() }));

import { scheduleProactiveCall } from '../../outreach/conversational-calls.js';
import { assertNotOptedOut } from '../../outreach/first-dial-opt-out.js';
import { defaultProactiveDeps } from '../../outreach/proactive-channels/default-deps.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { writeOptOut } from '../consent.js';
import type { ProactiveTrigger } from '../../outreach/proactive-channels/types.js';

const PHONE = '+12025550111';
const hash = () => phoneHash(PHONE, { LOG_HASH_SECRET: 'test-secret' }) as string;
const optOut = async (channel: 'sms' | 'call') =>
  writeOptOut(hash(), channel, 'inbound-sms', {
    env: { MESSAGING_PIPELINE: 'on' },
    store: mem.consent.store,
    now: () => new Date(),
  });
const callRequest = {
  userId: 'u1',
  phoneNumber: PHONE,
  message: 'Calling as you asked.',
  ssml: '<speak>Calling as you asked.</speak>',
  personaId: 'ferni',
  reason: 'user_requested_call',
};
const trigger = { text: 'Thinking of you', kind: 'checkin', sourceId: 's1' } as unknown as ProactiveTrigger;

beforeEach(() => {
  mem.consent = memoryConsentStore();
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('callUser / proactive calls (conversational-calls.scheduleProactiveCall)', () => {
  it('refuses a number that said "stop calling", before anything is scheduled', async () => {
    await optOut('call');
    const result = await scheduleProactiveCall(callRequest);
    expect(result).toEqual({ success: false, error: 'Not calling: opted-out' });
    expect(holdForCallHours).not.toHaveBeenCalled();
  });

  it('a call_opt_outs entry alone still refuses (fallback)', async () => {
    mem.consent.legacyCall.add(PHONE);
    expect((await scheduleProactiveCall(callRequest)).success).toBe(false);
    expect(holdForCallHours).not.toHaveBeenCalled();
  });

  it('a text STOP does not stop a call the owner asked for', async () => {
    await optOut('sms');
    expect(await scheduleProactiveCall(callRequest)).toMatchObject({ success: true });
    expect(holdForCallHours).toHaveBeenCalledOnce();
  });

  it('flag off: the opt-out is not read and the call goes on as today', async () => {
    await optOut('call');
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    expect(await scheduleProactiveCall(callRequest)).toMatchObject({ success: true });
    expect(holdForCallHours).toHaveBeenCalledOnce();
  });
});

describe('on-behalf first dial (assertNotOptedOut)', () => {
  it('throws for a call opt-out in consent, even with ON_BEHALF_DNC_CHECK off', async () => {
    await optOut('call');
    await expect(assertNotOptedOut(PHONE, async () => false)).rejects.toThrow(
      'asked not to be called'
    );
  });

  it('flag off: as today (the DNC check is off, so it dials)', async () => {
    await optOut('call');
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    await expect(assertNotOptedOut(PHONE, async () => false)).resolves.toBeUndefined();
  });
});

describe('proactive tick (default-deps)', () => {
  it('a STOP keeps the proactive text off Twilio (it falls back to in-app)', async () => {
    await optOut('sms');
    expect(await defaultProactiveDeps().sendSms(PHONE, 'hi')).toBe(false);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('"stop calling" means the proactive call is not placed', async () => {
    await optOut('call');
    expect(await defaultProactiveDeps().placeCall?.('u1', PHONE, trigger)).toBe('failed');
    expect(placeSelfCall).not.toHaveBeenCalled();
  });

  it('flag off: texts and calls as today', async () => {
    await optOut('sms');
    await optOut('call');
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    expect(await defaultProactiveDeps().sendSms(PHONE, 'hi')).toBe(true);
    expect(await defaultProactiveDeps().placeCall?.('u1', PHONE, trigger)).toBe('answered');
  });
});
