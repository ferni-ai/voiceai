/**
 * Concierge webhook signature enforcement.
 *
 * Twilio callbacks must carry a valid X-Twilio-Signature (missing header is
 * rejected). The SendGrid email-reply hook is verified with ECDSA when
 * SENDGRID_WEBHOOK_KEY is set, and refused in production when it isn't.
 */

import { generateKeyPairSync, sign } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRequest, fakeResponse, twilioSignature } from './http-test-utils.js';

const mockUpdateTargetStatus = vi.fn();
const mockFindByPhone = vi.fn();
const mockFindByEmail = vi.fn();
const mockAddResult = vi.fn();

vi.mock('../../services/concierge/index.js', () => ({
  getTaskTracker: () => ({
    updateTargetStatus: mockUpdateTargetStatus,
    findRequestByTargetPhone: mockFindByPhone,
    findRequestByTargetEmail: mockFindByEmail,
    addResult: mockAddResult,
  }),
}));

import { handleConciergeRoutes } from '../concierge-routes.js';
import { verifySendGridSignature } from '../webhook-signatures.js';

const TOKEN = 'test-twilio-token';

async function postTwilio(
  path: string,
  params: Record<string, string>,
  signature?: string
): Promise<ReturnType<typeof fakeResponse>> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (signature !== undefined) headers['x-twilio-signature'] = signature;
  const req = fakeRequest({ url: path, headers, body: new URLSearchParams(params).toString() });
  const out = fakeResponse();
  await handleConciergeRoutes(req, out.res, path.split('?')[0]);
  return out;
}

describe('concierge Twilio webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it('rejects call-status without a signature header', async () => {
    const out = await postTwilio('/api/concierge/webhooks/call-status?requestId=r1&targetId=t1', {
      CallStatus: 'completed',
    });
    expect(out.status()).toBe(403);
    expect(mockUpdateTargetStatus).not.toHaveBeenCalled();
  });

  it('rejects call-status with a forged signature', async () => {
    const out = await postTwilio(
      '/api/concierge/webhooks/call-status?requestId=r1&targetId=t1',
      { CallStatus: 'completed' },
      'bm90LWEtcmVhbC1zaWduYXR1cmU='
    );
    expect(out.status()).toBe(403);
    expect(mockUpdateTargetStatus).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed call-status and reads ids from the query', async () => {
    const path = '/api/concierge/webhooks/call-status?requestId=r1&targetId=t1';
    const params = { CallStatus: 'no-answer', CallSid: 'CA123' };
    const sig = twilioSignature(TOKEN, `https://api.test${path}`, params);
    const out = await postTwilio(path, params, sig);
    expect(out.status()).toBe(200);
    expect(mockUpdateTargetStatus).toHaveBeenCalledWith('r1', 't1', 'no_answer');
  });

  it('maps Twilio From/Body on a signed sms-reply', async () => {
    mockFindByPhone.mockResolvedValue(null);
    const path = '/api/concierge/webhooks/sms-reply';
    const params = { From: '+15551234567', Body: 'We have a room', MessageSid: 'SM1' };
    const sig = twilioSignature(TOKEN, `https://api.test${path}`, params);
    const out = await postTwilio(path, params, sig);
    expect(out.status()).toBe(200);
    expect(mockFindByPhone).toHaveBeenCalledWith('+15551234567');
  });
});

describe('concierge SendGrid email-reply webhook', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const originalEnv = process.env.NODE_ENV;

  function signed(body: string, ts = String(Math.floor(Date.now() / 1000))) {
    const signature = sign('sha256', Buffer.from(ts + body), privateKey).toString('base64');
    return {
      'x-twilio-email-event-webhook-signature': signature,
      'x-twilio-email-event-webhook-timestamp': ts,
    };
  }

  async function postEmail(body: string, headers: Record<string, string> = {}) {
    const path = '/api/concierge/webhooks/email-reply';
    const req = fakeRequest({
      url: path,
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
    const out = fakeResponse();
    await handleConciergeRoutes(req, out.res, path);
    return out;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByEmail.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.SENDGRID_WEBHOOK_KEY;
    process.env.NODE_ENV = originalEnv;
  });

  it('rejects an unsigned request when the key is configured', async () => {
    process.env.SENDGRID_WEBHOOK_KEY = publicKeyB64;
    const out = await postEmail(JSON.stringify({ from: 'hotel@example.com', body: 'hi' }));
    expect(out.status()).toBe(403);
    expect(mockFindByEmail).not.toHaveBeenCalled();
  });

  it('rejects a tampered body when the key is configured', async () => {
    process.env.SENDGRID_WEBHOOK_KEY = publicKeyB64;
    const original = JSON.stringify({ from: 'hotel@example.com', body: 'hi' });
    const tampered = JSON.stringify({ from: 'attacker@example.com', body: 'hi' });
    const out = await postEmail(tampered, signed(original));
    expect(out.status()).toBe(403);
  });

  it('accepts a validly signed request', async () => {
    process.env.SENDGRID_WEBHOOK_KEY = publicKeyB64;
    const body = JSON.stringify({ from: 'hotel@example.com', body: 'We can do $120' });
    const out = await postEmail(body, signed(body));
    expect(out.status()).toBe(200);
    expect(mockFindByEmail).toHaveBeenCalledWith('hotel@example.com');
  });

  it('refuses unsigned webhooks in production when no key is configured', async () => {
    process.env.NODE_ENV = 'production';
    const out = await postEmail(JSON.stringify({ from: 'hotel@example.com' }));
    expect(out.status()).toBe(503);
    expect(mockFindByEmail).not.toHaveBeenCalled();
  });

  it('rejects stale timestamps', () => {
    const body = '{}';
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const headers = signed(body, old);
    expect(
      verifySendGridSignature(
        publicKeyB64,
        body,
        headers['x-twilio-email-event-webhook-signature'],
        old
      )
    ).toBe(false);
  });
});
