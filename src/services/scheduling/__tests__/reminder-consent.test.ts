/**
 * MESSAGING_PIPELINE on: a reminder call, which dials deliveryAddress, reads
 * consent/{phoneHash} first, and a refused reminder is delivered in the app
 * instead. Before, the call path rang with no STOP check at all. Off: as today.
 * Reminder texts only go through the guarded sender, which checks consent
 * itself (consent-text-senders.test.ts has the owner's no-record case).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from '../../messaging/__tests__/memory-consent.js';

const mem = vi.hoisted(() => ({
  consent: null as unknown as ReturnType<typeof memoryConsentStore>,
}));
vi.mock('../../messaging/consent.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../messaging/consent.js')>();
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
const update = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../superhuman/firestore-utils.js', () => {
  const doc = (): unknown => ({ collection: () => ({ doc }), update });
  return { getFirestoreDb: () => ({ collection: () => ({ doc }) }) };
});
const callWithPersonaVoice = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, callSid: 'CA1' }))
);
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice }));
const sendReminder = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../../communication-service.js', () => ({
  sendEmail: vi.fn(),
  sendReminder,
  sendSMS: vi.fn(),
}));
const saveInAppMessage = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('../../outreach/unified-delivery.js', () => ({ saveInAppMessage }));
const ownNumber = vi.hoisted(() => ({ value: true }));
vi.mock('../../outreach/guarded-text.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../outreach/guarded-text.js')>()),
  isOwnVerifiedPhone: async () => ownNumber.value,
}));

const { deliverReminder, reminderFromDoc } = await import('../reminder-scheduler.js');
// What the job route and startup do: installs the owner's-number check this path asks.
(await import('../../outreach/reminder-texts.js')).installReminderTexts();
const { phoneHash } = await import('../../outreach/checkin-replies.js');
const { writeOptOut } = await import('../../messaging/consent.js');

const PHONE = '+12025550133';
const reminder = (deliveryMethod: 'call' | 'sms') =>
  reminderFromDoc('rem-1', {
    userId: 'u1',
    message: 'take your meds',
    scheduledFor: '2026-10-18T16:00:00.000Z',
    deliveryMethod,
    deliveryAddress: PHONE,
    status: 'sending',
  });
const optOut = async (channel: 'sms' | 'call') =>
  writeOptOut(
    phoneHash(PHONE, { LOG_HASH_SECRET: 'test-secret' }) as string,
    channel,
    'inbound-sms',
    {
      env: { MESSAGING_PIPELINE: 'on' },
      store: mem.consent.store,
      now: () => new Date(),
    }
  );

beforeEach(() => {
  mem.consent = memoryConsentStore();
  ownNumber.value = true;
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('reminder call path (the STOP gap)', () => {
  it('does not ring a number that said "stop calling"; the reminder lands in the app', async () => {
    await optOut('call');
    await deliverReminder(reminder('call'));
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(saveInAppMessage).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'reminder', text: 'take your meds' })
    );
  });

  it('call_opt_outs alone still stops it (fallback)', async () => {
    mem.consent.legacyCall.add(PHONE);
    await deliverReminder(reminder('call'));
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(saveInAppMessage).toHaveBeenCalledOnce();
  });

  it('a reminder call to someone else who never agreed lands in the app (nothing confirms it)', async () => {
    ownNumber.value = false;
    await deliverReminder(reminder('call'));
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(saveInAppMessage).toHaveBeenCalledOnce();
  });

  it("rings the owner's own number with no consent record", async () => {
    expect(await deliverReminder(reminder('call'))).toBe(true);
    expect(callWithPersonaVoice).toHaveBeenCalledOnce();
  });

  it('flag off: rings as today', async () => {
    await optOut('call');
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    expect(await deliverReminder(reminder('call'))).toBe(true);
    expect(callWithPersonaVoice).toHaveBeenCalledOnce();
    expect(saveInAppMessage).not.toHaveBeenCalled();
  });
});

describe('reminder texts (the guarded sender)', () => {
  it('refuses the owner after a STOP', async () => {
    await optOut('sms');
    await deliverReminder(reminder('sms'));
    expect(sendReminder).not.toHaveBeenCalled();
    expect(saveInAppMessage).toHaveBeenCalledOnce();
  });

  it('refuses a deliveryAddress that is not the owner and never opted in', async () => {
    ownNumber.value = false;
    await deliverReminder(reminder('sms'));
    expect(sendReminder).not.toHaveBeenCalled();
    expect(saveInAppMessage).toHaveBeenCalledOnce();
  });
});
