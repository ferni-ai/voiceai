/**
 * Outreach wiring that broke silently in production:
 * - Twilio webhooks failed every signature check (auth token never set, and
 *   the signed URL is the public host, not the Cloud Run Host header)
 * - sendSMS() said "not initialized" (bootstrap disabled on the voice agent)
 * - family check-in dispatches were ignored by the agent
 */
import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const twilioCreate = vi.hoisted(() => vi.fn());
vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: twilioCreate } })),
}));

const { validateTwilioSignature, twilioSignedUrls } = await import('../webhooks/twilio-webhooks.js');
const { normalizeOutboundCallMetadata } = await import('../../../agents/outbound-call-metadata.js');

function sign(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(data).digest('base64');
}

describe('Twilio webhook signatures', () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'secret-token';
  });
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.PUBLIC_URL;
  });

  const params = { From: '+15551234567', Body: 'hi Ferni' };
  const path = '/api/outreach/webhooks/twilio/sms-inbound';

  it('validates with TWILIO_AUTH_TOKEN from the environment', () => {
    const url = `https://app.ferni.ai${path}`;
    expect(validateTwilioSignature(sign('secret-token', url, params), url, params)).toBe(true);
    expect(validateTwilioSignature(sign('wrong', url, params), url, params)).toBe(false);
  });

  it('accepts the public URL Twilio signed when behind the Firebase rewrite', () => {
    const headers = {
      host: 'john-bogle-ui-bmopaivmsq-uc.a.run.app',
      'x-forwarded-host': 'app.ferni.ai',
      'x-forwarded-proto': 'https',
    };
    const urls = twilioSignedUrls(headers, path);
    expect(urls[0]).toBe(`https://app.ferni.ai${path}`);
    const signature = sign('secret-token', `https://app.ferni.ai${path}`, params);
    expect(validateTwilioSignature(signature, urls, params)).toBe(true);
  });

  it('also tries PUBLIC_URL', () => {
    process.env.PUBLIC_URL = 'https://app.ferni.ai';
    const urls = twilioSignedUrls({ host: 'internal:8080' }, path);
    expect(urls).toContain(`https://app.ferni.ai${path}`);
  });

  it('refuses when no token is configured', () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const url = `https://app.ferni.ai${path}`;
    expect(validateTwilioSignature(sign('secret-token', url, params), url, params)).toBe(false);
  });
});

describe('SMS delivery self-initialises from env', () => {
  it('sends through Twilio without a bootstrap call', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_PHONE_NUMBER = '+15550000000';
    twilioCreate.mockResolvedValue({ sid: 'SM123', status: 'queued', numSegments: '1' });
    const { isSMSDeliveryAvailable, sendSMS } = await import('../delivery/sms-delivery.js');

    expect(isSMSDeliveryAvailable()).toBe(true);
    const result = await sendSMS({ to: '+15551234567', body: 'Thinking of you today.', personaId: 'ferni' } as never);
    expect(result.success).toBe(true);
    expect(twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15551234567', from: '+15550000000' })
    );
  });
});

describe('family check-in calls reach the agent as outbound calls', () => {
  it('maps family_checkin onto on_behalf_call with the sponsor and script', () => {
    const out = normalizeOutboundCallMetadata({
      type: 'family_checkin',
      callId: 'fc_1',
      sponsorUserId: 'alice',
      persona_id: 'ferni',
      familyMemberName: 'Mom',
      relationship: 'mother',
      systemPrompt: 'Be warm; ask about her garden.',
      openingLine: 'Hi Linda, it is Ferni, Alice asked me to check in!',
    });
    expect(out).toMatchObject({
      type: 'on_behalf_call',
      originalType: 'family_checkin',
      userId: 'alice',
      persona_id: 'ferni',
      contact: { name: 'Mom', relationship: 'mother' },
      objective: 'check_in',
      callType: 'personal',
    });
    expect(out.script).toContain('Hi Linda');
    expect(out.script).toContain('ask about her garden');
  });

  it('leaves other call types alone', () => {
    const meta = { type: 'on_behalf_call', callId: 'x' };
    expect(normalizeOutboundCallMetadata(meta)).toBe(meta);
  });
});
