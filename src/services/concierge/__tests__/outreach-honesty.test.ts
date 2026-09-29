/**
 * Concierge outreach must never report a send that didn't happen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConciergeTarget } from '../types.js';

const target = {
  id: 't1',
  requestId: 'r1',
  name: 'Harbor Hotel',
  phone: '+15551230000',
  email: 'front@harbor.example',
  attempts: 0,
  status: 'pending',
} as unknown as ConciergeTarget;

describe('PhoneCaller', () => {
  it('reports calling as unavailable and never fabricates a result', async () => {
    const { PhoneCaller } = await import('../outreach/phone-caller.js');
    expect(PhoneCaller.isCallingAvailable()).toBe(false);

    const caller = new PhoneCaller({ userId: 'u1' });
    const result = await caller.call({ target, domain: 'hotel', requirements: {} });
    expect(result.success).toBe(false);
    expect(result.simulated).toBe(true);
    expect(result.result).toBeUndefined();
    expect(result.error).toMatch(/not called/);
  });
});

describe('SmsSender', () => {
  it('fails honestly when Twilio is not configured', async () => {
    const { SmsSender } = await import('../outreach/sms-sender.js');
    if (SmsSender.isConfigured()) return; // env-dependent guard
    const sender = new SmsSender({ userId: 'u1', userName: 'Sam' });
    const result = await sender.send({
      target,
      domain: 'hotel',
      type: 'quote',
      requirements: {},
    });
    expect(result.success).toBe(false);
    expect(result.result).toBeUndefined();
  });
});

describe('EmailSender', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fails honestly when SendGrid is not configured', async () => {
    vi.stubEnv('SENDGRID_API_KEY', '');
    const { EmailSender } = await import('../outreach/email-sender.js');
    const sender = new EmailSender({ userId: 'u1', userName: 'Sam', userEmail: 's@x.example' });
    const result = await sender.send({ target, domain: 'hotel', type: 'quote', requirements: {} });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends through SendGrid and returns the real message id', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'SG.test');
    fetchMock.mockResolvedValue(
      new Response('', { status: 202, headers: { 'x-message-id': 'msg-42' } })
    );
    const { EmailSender } = await import('../outreach/email-sender.js');
    const sender = new EmailSender({ userId: 'u1', userName: 'Sam', userEmail: 's@x.example' });
    const result = await sender.send({ target, domain: 'hotel', type: 'quote', requirements: {} });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-42');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    const payload = JSON.parse(String(init.body)) as {
      personalizations: Array<{ to: Array<{ email: string }> }>;
      reply_to?: { email: string };
    };
    expect(payload.personalizations[0].to[0].email).toBe('front@harbor.example');
    expect(payload.reply_to?.email).toBe('s@x.example');
  });

  it('reports failure when SendGrid rejects the send', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'SG.test');
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));
    const { EmailSender } = await import('../outreach/email-sender.js');
    const sender = new EmailSender({ userId: 'u1', userName: 'Sam', userEmail: 's@x.example' });
    const result = await sender.send({ target, domain: 'hotel', type: 'quote', requirements: {} });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SendGrid error: 400/);
  });
});

describe('result notifier SMS', () => {
  afterEach(() => {
    vi.doUnmock('../../integrations/twilio-sms.js');
    vi.resetModules();
  });

  it('does not report an SMS as sent when Twilio returns no sid', async () => {
    vi.resetModules();
    vi.doMock('../../integrations/twilio-sms.js', () => ({
      isTwilioConfigured: () => true,
      sendSMS: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('../../superhuman/firestore-utils.js', () => ({
      getFirestoreDb: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({ phone: '+15550001111', notificationPrefs: { preferredChannel: 'sms' } }),
            }),
          }),
        }),
      }),
    }));
    const { notifyRequestComplete } = await import('../notification/result-notifier.js');
    const result = await notifyRequestComplete({
      id: 'r1',
      userId: 'u1',
      domain: 'hotel',
      results: [],
      targets: [],
    } as never);
    expect(result.success).toBe(false);
  });
});
