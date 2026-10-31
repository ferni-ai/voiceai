/**
 * MESSAGING_PIPELINE on: the proactive call scheduler (unified delivery's voice
 * leg) and the scheduled-outreach executor's call branch read
 * consent/{phoneHash} and never ring an opted-out number. Off: as today.
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

const makeConversationalCall = vi.hoisted(() => vi.fn(async () => ({ status: 'ringing' })));
vi.mock('../../outreach/conversational-calls.js', () => ({
  isConversationalCallsConfigured: () => true,
  makeConversationalCall,
}));
const generatePersonalizedContent = vi.hoisted(() =>
  vi.fn(async () => Promise.reject(new Error('stop here')))
);
vi.mock('../../outreach/llm-content-generator.js', () => ({ generatePersonalizedContent }));
vi.mock('../../outreach/quiet-hours.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../outreach/quiet-hours.js')>()),
  callQuietHours: vi.fn(async () => ({ quiet: false })),
}));
const own = vi.hoisted(() => ({ value: false }));
vi.mock('../../outreach/guarded-text.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../outreach/guarded-text.js')>()),
  isOwnVerifiedPhone: async () => own.value,
}));
const callWithPersonaVoice = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice }));
const updateOutreachStatus = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../outreach/scheduled-multi-outreach.js', () => ({
  updateOutreachStatus,
  incrementRetry: vi.fn(),
  patchOutreach: vi.fn(),
  claimPendingOutreach: vi.fn(),
}));
vi.mock('../../outreach/delivery/email-delivery.js', () => ({ sendEmail: vi.fn() }));

import { scheduleProactiveCall } from '../../outreach/proactive-call-scheduler.js';
import { executeScheduledOutreach } from '../../outreach/scheduled-outreach-executor.js';
import type { ScheduledOutreach } from '../../outreach/scheduled-multi-outreach.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { writeOptOut } from '../consent.js';

const PHONE = '+12025550122';
const callOptOut = async () =>
  writeOptOut(
    phoneHash(PHONE, { LOG_HASH_SECRET: 'test-secret' }) as string,
    'call',
    'voice-call',
    {
      env: { MESSAGING_PIPELINE: 'on' },
      store: mem.consent.store,
      now: () => new Date(),
    }
  );
const proactive = {
  userId: 'u1',
  phoneNumber: PHONE,
  userContext: {},
  outreachType: 'check_in',
} as unknown as Parameters<typeof scheduleProactiveCall>[0];
const scheduledCall = (): ScheduledOutreach =>
  ({
    id: 'so1',
    userId: 'u1',
    personaId: 'ferni',
    target: {
      channel: 'call',
      resolvedPhone: PHONE,
      resolvedContactName: 'Mindy Example',
      purpose: 'say happy birthday',
    },
    scheduledFor: new Date(),
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
  }) as unknown as ScheduledOutreach;

beforeEach(() => {
  mem.consent = memoryConsentStore();
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('proactive-call-scheduler.scheduleProactiveCall', () => {
  it('refuses an opted-out number before writing a word of the call', async () => {
    await callOptOut();
    expect(await scheduleProactiveCall(proactive)).toEqual({
      success: false,
      error: 'Not calling: opted-out',
    });
    expect(generatePersonalizedContent).not.toHaveBeenCalled();
  });

  it('flag off: goes on to write the call as today', async () => {
    await callOptOut();
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    await scheduleProactiveCall(proactive);
    expect(generatePersonalizedContent).toHaveBeenCalledOnce();
  });
});

describe('scheduled-outreach executor, call branch', () => {
  it('cancels a scheduled call to a number that asked not to be called', async () => {
    await callOptOut();
    expect(await executeScheduledOutreach(scheduledCall())).toBe('opted-out');
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'u1',
      'so1',
      'cancelled',
      expect.objectContaining({ error: 'skipped: opted-out' })
    );
  });

  it('holds a scheduled call to a third party who never agreed (needs-consent)', async () => {
    own.value = false;
    expect(await executeScheduledOutreach(scheduledCall())).toBe('needs-consent');
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'u1',
      'so1',
      'cancelled',
      expect.objectContaining({ error: 'skipped: needs-consent' })
    );
  });

  it("calls the member's own number with no consent record", async () => {
    own.value = true;
    await executeScheduledOutreach(scheduledCall());
    expect(callWithPersonaVoice).toHaveBeenCalledOnce();
    expect(callWithPersonaVoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ ownerUid: 'u1' })
    );
  });

  it('flag off: places the call as today', async () => {
    await callOptOut();
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    await executeScheduledOutreach(scheduledCall());
    expect(callWithPersonaVoice).toHaveBeenCalledOnce();
  });
});
