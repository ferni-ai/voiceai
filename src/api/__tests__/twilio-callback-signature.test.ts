/**
 * The one Twilio signature check (#2679): the URL is one of our configured
 * public origins plus the path and query as received, never a request header.
 * Signatures come from the real Twilio SDK over a fictional token.
 */
import type { IncomingMessage } from 'node:http';
import twilio from 'twilio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isSignedByTwilio, twilioSignedUrl } from '../twilio-callback-signature.js';
import { twilioCallbackOrigins } from '../../services/outreach/webhooks/twilio-callback-url.js';

const TOKEN = 'fictional-twilio-auth-token';
const FORM = { CallSid: 'CA1', CallStatus: 'completed' };
const PATH = '/api/group/call/status';

const sign = (url: string) => twilio.getExpectedTwilioSignature(TOKEN, url, FORM);
const request = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;

beforeEach(() => {
  vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN);
  vi.stubEnv('APP_URL', 'https://app.ferni.example');
  vi.stubEnv('WEBHOOK_BASE_URL', 'https://hooks.ferni.example/');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('twilioCallbackOrigins', () => {
  it('is APP_URL then WEBHOOK_BASE_URL, as origins', () => {
    expect(twilioCallbackOrigins()).toEqual([
      'https://app.ferni.example',
      'https://hooks.ferni.example',
    ]);
  });

  it('falls back to the production origins and drops what does not parse', () => {
    vi.stubEnv('APP_URL', 'not a url');
    vi.stubEnv('WEBHOOK_BASE_URL', '');
    expect(twilioCallbackOrigins()).toEqual(['https://api.ferni.ai']);
  });
});

describe('twilioSignedUrl', () => {
  it('returns the configured URL the signature is valid for', () => {
    const url = `https://hooks.ferni.example${PATH}`;
    const req = request({ host: 'run.app.example', 'x-twilio-signature': sign(url) });
    expect(twilioSignedUrl(req, PATH, FORM)).toBe(url);
    expect(isSignedByTwilio(req, PATH, FORM)).toBe(true);
  });

  it('ignores Host and X-Forwarded-Host, whatever they claim', () => {
    const attacker = 'evil.example';
    const req = request({
      host: attacker,
      'x-forwarded-host': attacker,
      'x-twilio-signature': sign(`https://${attacker}${PATH}`),
    });
    expect(twilioSignedUrl(req, PATH, FORM)).toBeNull();
  });

  it('refuses a path that is not absolute instead of gluing it onto an origin', () => {
    const req = request({ 'x-twilio-signature': sign(`https://app.ferni.example@evil.example/x`) });
    expect(twilioSignedUrl(req, '@evil.example/x', FORM)).toBeNull();
  });

  it('refuses a missing signature', () => {
    expect(twilioSignedUrl(request({}), PATH, FORM)).toBeNull();
  });
});
