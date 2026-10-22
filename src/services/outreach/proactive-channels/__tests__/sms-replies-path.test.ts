/**
 * Replies to a proactive text, end to end: Twilio's inbound SMS webhook →
 * the proactive reply handler → the user's settings and outreach log, and
 * then the next proactive run obeys them. Firestore is in memory; Firebase
 * Auth (number → account) is stubbed at the SDK boundary.
 */
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const SETH = 'seth-uid';
const PHONE = '+15555550123';

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// The opt-out stores (opt-outs.ts) import the canonical module.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../identity/firebase-auth.js', () => ({
  getFirebaseUserByPhone: vi.fn(async (e164: string) => (e164 === PHONE ? { uid: SETH } : null)),
}));
// The rest of the webhook (profile lookup, conversation routing) after the proactive step.
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ isInitialized: true, listProfiles: async () => [] }),
}));
const routed = vi.fn(async () => ({ routeDecision: {}, shouldInitiateCall: false }));
vi.mock('../../../conversation-thread/inbound-router.js', () => ({ handleInboundSMS: routed }));
vi.mock('../../../contacts/optimal-timing.js', () => ({
  findContactByPhone: vi.fn(async () => null),
  markContactResponded: vi.fn(),
}));

const { handleInboundSMSWebhook } = await import('../../webhooks/twilio-webhooks.js');

const HOUR = 3600_000;
const NOW = new Date('2026-10-12T15:00:00Z');

function inbound(body: string, from = PHONE) {
  return handleInboundSMSWebhook({
    MessageSid: `SM${Math.random()}`,
    Body: body,
    From: from,
    To: '+15555550000',
    NumMedia: '0',
    AccountSid: 'AC1',
  } as never);
}
const prefs = () =>
  (docs.get(`bogle_users/${SETH}`)?.outreachPreferences ?? {}) as Record<string, unknown>;
const logOf = (id: string) => docs.get(`bogle_users/${SETH}/proactive_outreach_log/${id}`);

beforeEach(() => {
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  routed.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
  process.env.SKIP_TWILIO_VALIDATION = 'true';
  docs.set(`bogle_users/${SETH}`, { outreachPreferences: { channels: ['sms'] } });
  docs.set(`bogle_users/${SETH}/proactive_outreach_log/promise:p1`, {
    sourceId: 'promise:p1',
    channel: 'sms',
    at: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    outcome: 'sent',
  });
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
  delete process.env.SKIP_TWILIO_VALIDATION;
});

describe('replies to a proactive text', () => {
  it('"less" steps the frequency down and says so', async () => {
    expect(prefs().proactiveFrequency).toBeUndefined();
    const res = await inbound('Less');
    expect(res.twiml).toContain('Got it. I&apos;ll keep it to once a day');
    expect(prefs()).toMatchObject({ proactiveFrequency: 'light', channels: ['sms'] });
    expect(routed).not.toHaveBeenCalled();
  });

  it('"less" from normal goes to gentle', async () => {
    docs.set(`bogle_users/${SETH}`, { outreachPreferences: { proactiveFrequency: 'normal' } });
    await inbound('less');
    expect(prefs().proactiveFrequency).toBe('gentle');
  });

  it('"not now" snoozes 12 hours and marks the text declined', async () => {
    const res = await inbound('not now');
    expect(res.twiml).toContain('leave you be');
    expect(prefs().proactiveSnoozeUntil).toBe(new Date(NOW.getTime() + 12 * HOUR).toISOString());
    expect(logOf('promise:p1')).toMatchObject({ outcome: 'declined' });
  });

  it('"stop" turns proactive check-ins off; Twilio sends the one confirmation, the app none', async () => {
    const res = await inbound('STOP');
    expect(prefs().proactiveFrequency).toBe('off');
    expect(res.twiml).toBeUndefined();
  });

  it('"Stop." (not a Twilio keyword) gets exactly one app confirmation; HELP is left to Twilio', async () => {
    const stop = await inbound('Stop.');
    expect(stop.twiml).toContain(
      'You&apos;re unsubscribed from Ferni texts. Reply START to resubscribe.'
    );
    expect(stop.twiml?.match(/<Message>/g)).toHaveLength(1);
    expect((await inbound(' HELP ')).twiml).toBeUndefined();
    expect(routed).not.toHaveBeenCalled();
  });

  it('any other answer counts as a reply and goes on to the conversation', async () => {
    const res = await inbound('Pretty good, the boxes are mostly packed');
    expect(res.twiml).toBeUndefined();
    expect(logOf('promise:p1')).toMatchObject({ outcome: 'replied' });
    expect(prefs().proactiveFrequency).toBeUndefined();
  });

  it('a number that is not on an allowlisted account changes nothing', async () => {
    await inbound('less', '+15555550999');
    expect(prefs().proactiveFrequency).toBeUndefined();
    process.env.PROACTIVE_CHANNELS_USERS = 'someone-else';
    await inbound('less');
    expect(prefs().proactiveFrequency).toBeUndefined();
  });

  describe('only from Twilio (X-Twilio-Signature checked before anything changes)', () => {
    const URL = 'https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound';
    const payload = {
      MessageSid: 'SM1',
      Body: 'stop',
      From: PHONE,
      To: '+15555550000',
      NumMedia: '0',
      AccountSid: 'AC1',
    };
    const sign = (token: string) =>
      createHmac('sha1', token)
        .update(
          URL +
            Object.keys(payload)
              .sort()
              .map((k) => k + payload[k as keyof typeof payload])
              .join('')
        )
        .digest('base64');

    beforeEach(() => {
      delete process.env.SKIP_TWILIO_VALIDATION;
      process.env.TWILIO_AUTH_TOKEN = 'tw-token';
    });
    afterEach(() => delete process.env.TWILIO_AUTH_TOKEN);

    it('unsigned or wrongly signed: refused, settings untouched', async () => {
      expect(await handleInboundSMSWebhook(payload as never)).toEqual({ success: false });
      const forged = await handleInboundSMSWebhook(payload as never, sign('not-ours'), URL);
      expect(forged).toEqual({ success: false });
      expect(prefs().proactiveFrequency).toBeUndefined();
    });

    it('signed by Twilio: handled', async () => {
      await handleInboundSMSWebhook(payload as never, sign('tw-token'), URL);
      expect(prefs().proactiveFrequency).toBe('off');
    });
  });
});
