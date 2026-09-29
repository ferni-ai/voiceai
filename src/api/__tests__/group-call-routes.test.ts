/**
 * Group call flows:
 * - POST /api/group/call/add is honest (501) instead of a fake "dialing".
 * - Twilio answer/status webhooks are served before auth, signature-checked.
 * - Answer TwiML escapes query values.
 */

import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeRequest, fakeResponse, twilioSignature } from './http-test-utils.js';
import { handleGroupCallWebhooks } from '../group-call-webhooks.js';
import { groupConversationRoutes } from '../group-conversation-routes.js';

const TOKEN = 'group-test-token';

describe('POST /api/group/call/add', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/group', groupConversationRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => {
      server.once('listening', () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('returns 501 rather than pretending to dial', async () => {
    const res = await fetch(`${base}/api/group/call/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-firebase-uid': 'alice' },
      body: JSON.stringify({ phoneNumber: '+15551234567', name: 'Sarah' }),
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { success: boolean; status?: string };
    expect(body.success).toBe(false);
    expect(body.status).toBeUndefined();
  });

  it('still requires a user', async () => {
    const res = await fetch(`${base}/api/group/call/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+15551234567', name: 'Sarah' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('group call Twilio webhooks', () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it('ignores unrelated paths', async () => {
    const out = fakeResponse();
    const handled = await handleGroupCallWebhooks(
      fakeRequest({ url: '/api/group/sessions', method: 'GET' }),
      out.res,
      '/api/group/sessions'
    );
    expect(handled).toBe(false);
  });

  it('rejects an unsigned status callback', async () => {
    const out = fakeResponse();
    const path = '/api/group/call/status';
    await handleGroupCallWebhooks(
      fakeRequest({ url: path, body: 'CallSid=CA1&CallStatus=ringing' }),
      out.res,
      path
    );
    expect(out.status()).toBe(403);
  });

  it('acknowledges a signed status callback without user auth', async () => {
    const path = '/api/group/call/status';
    const params = { CallSid: 'CA1', CallStatus: 'ringing' };
    const out = fakeResponse();
    await handleGroupCallWebhooks(
      fakeRequest({
        url: path,
        headers: {
          'x-twilio-signature': twilioSignature(TOKEN, `https://api.test${path}`, params),
        },
        body: new URLSearchParams(params).toString(),
      }),
      out.res,
      path
    );
    expect(out.status()).toBe(204);
  });

  it('serves escaped answer TwiML for a signed POST', async () => {
    const url =
      '/api/group/call/answer?roomName=room1&name=Sam&intro=' +
      encodeURIComponent('Hi</Say><Dial>+19995550000</Dial><Say>');
    const params = { CallSid: 'CA2' };
    const out = fakeResponse();
    await handleGroupCallWebhooks(
      fakeRequest({
        url,
        headers: { 'x-twilio-signature': twilioSignature(TOKEN, `https://api.test${url}`, params) },
        body: new URLSearchParams(params).toString(),
      }),
      out.res,
      '/api/group/call/answer'
    );
    expect(out.status()).toBe(200);
    expect(out.body()).toContain('<Sip>sip:room1@');
    expect(out.body()).not.toContain('+19995550000</Dial>');
    expect(out.body().match(/<Dial>/g)).toHaveLength(1);
  });
});
