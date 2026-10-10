import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const handleCallStatusUpdate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../services/outreach/conversational-calls.js', () => ({ handleCallStatusUpdate }));

import { handleOutreachWebhookRoutes } from '../outreach-webhook-routes.js';

const AUTH_TOKEN = 'test-twilio-auth-token';
const HOST = 'app.ferni.example';
const PATH = '/api/outreach/webhooks/twilio/conversational-call-status';

/** Twilio's signature: HMAC-SHA1 over the URL plus the sorted POST fields. */
function sign(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', AUTH_TOKEN).update(data).digest('base64');
}

function post(params: Record<string, string>, signature?: string) {
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: {
      host: HOST,
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature ? { 'x-twilio-signature': signature } : {}),
    },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
});

describe('POST /api/outreach/webhooks/twilio/conversational-call-status', () => {
  const params = { CallSid: 'CA123', CallStatus: 'no-answer' };

  it('applies a status update Twilio signed', async () => {
    const { req, res } = post(params, sign(`https://${HOST}${PATH}`, params));
    await expect(handleOutreachWebhookRoutes(req, res, PATH)).resolves.toBe(true);
    expect(handleCallStatusUpdate).toHaveBeenCalledWith(params);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });

  it('refuses an unsigned or tampered update without touching the call', async () => {
    handleCallStatusUpdate.mockClear();
    const unsigned = post(params);
    await handleOutreachWebhookRoutes(unsigned.req, unsigned.res, PATH);
    expect(unsigned.res.writeHead).toHaveBeenCalledWith(403, expect.anything());

    const signature = sign(`https://${HOST}${PATH}`, params);
    const tampered = post({ ...params, CallStatus: 'completed' }, signature);
    await handleOutreachWebhookRoutes(tampered.req, tampered.res, PATH);
    expect(tampered.res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });
});
