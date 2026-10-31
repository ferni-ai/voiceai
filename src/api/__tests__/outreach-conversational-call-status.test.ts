/**
 * Twilio status callbacks for conversational calls (#2679).
 *
 * conversational-calls.ts gives Twilio a status callback on the public origin
 * (APP_URL), and Twilio signs that URL. Behind Firebase Hosting the request
 * reaches Cloud Run with the run.app Host, so a check that rebuilt the URL from
 * the Host header refused every real callback (12 of 12 in prod). Signatures
 * here come from the real Twilio SDK over a fictional token.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import twilio from 'twilio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleCallStatusUpdate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../services/outreach/conversational-calls.js', () => ({ handleCallStatusUpdate }));

import { twilioCallbackUrl } from '../../services/outreach/webhooks/twilio-callback-url.js';
import { handleOutreachWebhookRoutes } from '../outreach-webhook-routes.js';

const AUTH_TOKEN = 'fictional-twilio-auth-token';
const PUBLIC_ORIGIN = 'https://app.ferni.example';
const RUN_APP_HOST = 'john-bogle-ui-abc123-uc.a.run.app';
const PATH = '/api/outreach/webhooks/twilio/conversational-call-status';
const PARAMS = { CallSid: 'CA123', CallStatus: 'no-answer', AccountSid: 'AC123' };

const sign = (url: string, params: Record<string, string>, token = AUTH_TOKEN) =>
  twilio.getExpectedTwilioSignature(token, url, params);

/** A request as Cloud Run sees it behind Firebase Hosting: run.app Host, original path. */
function post(params: Record<string, string>, signature?: string, url = PATH) {
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url,
    headers: {
      host: RUN_APP_HOST,
      'x-forwarded-proto': 'https',
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature ? { 'x-twilio-signature': signature } : {}),
    },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

async function deliver(params: Record<string, string>, signature?: string, url = PATH) {
  const { req, res } = post(params, signature, url);
  await expect(handleOutreachWebhookRoutes(req, res, url.split('?')[0])).resolves.toBe(true);
  return res.writeHead.mock.calls[0]?.[0] as number;
}

beforeEach(() => {
  vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
  vi.stubEnv('APP_URL', PUBLIC_ORIGIN);
  handleCallStatusUpdate.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/outreach/webhooks/twilio/conversational-call-status', () => {
  it('accepts the update Twilio signed over the public URL it was given, via the run.app host', async () => {
    const statusCallback = twilioCallbackUrl(PATH); // what calls.create hands Twilio
    expect(statusCallback).toBe(`${PUBLIC_ORIGIN}${PATH}`);

    expect(await deliver(PARAMS, sign(statusCallback, PARAMS))).toBe(200);
    expect(handleCallStatusUpdate).toHaveBeenCalledWith(PARAMS);
  });

  it('keeps the query string Twilio signed', async () => {
    const url = `${PATH}?attempt=2`;
    expect(await deliver(PARAMS, sign(`${PUBLIC_ORIGIN}${url}`, PARAMS), url)).toBe(200);
  });

  it('refuses an unsigned update', async () => {
    expect(await deliver(PARAMS)).toBe(403);
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });

  it('refuses a signature made with another token', async () => {
    const forged = sign(`${PUBLIC_ORIGIN}${PATH}`, PARAMS, 'not-the-token');
    expect(await deliver(PARAMS, forged)).toBe(403);
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });

  it('refuses a tampered field', async () => {
    const signature = sign(`${PUBLIC_ORIGIN}${PATH}`, PARAMS);
    expect(await deliver({ ...PARAMS, CallStatus: 'completed' }, signature)).toBe(403);
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });

  it('refuses a signature made for a different path', async () => {
    const other = sign(`${PUBLIC_ORIGIN}/api/outreach/webhooks/twilio/call-status`, PARAMS);
    expect(await deliver(PARAMS, other)).toBe(403);
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });

  it('does not let the Host header choose the URL that is checked', async () => {
    // Valid for the run.app URL the request arrived on, but Twilio was never given it.
    const viaHost = sign(`https://${RUN_APP_HOST}${PATH}`, PARAMS);
    expect(await deliver(PARAMS, viaHost)).toBe(403);
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });

  it('refuses everything when no auth token is configured', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    expect(await deliver(PARAMS, sign(`${PUBLIC_ORIGIN}${PATH}`, PARAMS, ''))).toBe(403);
    expect(handleCallStatusUpdate).not.toHaveBeenCalled();
  });
});
