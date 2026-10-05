/**
 * validateTwilioSignature must work in the processes that are actually
 * deployed. Its token used to come only from initializeTwilioWebhooks, whose
 * one caller (initializeOutreachSystem) is commented out in
 * services/global-services.ts, so every signature was refused even with
 * TWILIO_AUTH_TOKEN set. Signatures here come from the real Twilio SDK.
 */
import twilio from 'twilio';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTwilioSignature } from '../twilio-webhooks.js';

const TOKEN = 'env-only-twilio-token';
const URL_WITH_QUERY = 'https://api.ferni.ai/api/group/call/answer?roomName=r1&name=Sam';
const FORM = { CallSid: 'CA1', CallStatus: 'ringing', From: '+15550000000' };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateTwilioSignature without initializeTwilioWebhooks', () => {
  it('accepts a signature made with TWILIO_AUTH_TOKEN (GET: URL and query only)', () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN);
    const signature = twilio.getExpectedTwilioSignature(TOKEN, URL_WITH_QUERY, {});

    expect(validateTwilioSignature(signature, URL_WITH_QUERY, {})).toBe(true);
  });

  it('accepts a POST signature over the URL plus sorted form fields', () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN);
    const signature = twilio.getExpectedTwilioSignature(TOKEN, URL_WITH_QUERY, FORM);

    expect(validateTwilioSignature(signature, URL_WITH_QUERY, FORM)).toBe(true);
    expect(validateTwilioSignature(signature, URL_WITH_QUERY, { ...FORM, CallStatus: 'x' })).toBe(
      false
    );
  });

  it('refuses a signature made with another token', () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN);
    const forged = twilio.getExpectedTwilioSignature('other-token', URL_WITH_QUERY, {});

    expect(validateTwilioSignature(forged, URL_WITH_QUERY, {})).toBe(false);
  });

  it('refuses everything when no token is configured', () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    const signature = twilio.getExpectedTwilioSignature('', URL_WITH_QUERY, {});

    expect(validateTwilioSignature(signature, URL_WITH_QUERY, {})).toBe(false);
  });
});
