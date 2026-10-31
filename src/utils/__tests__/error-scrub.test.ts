/**
 * The privacy scrubber must remove callers' words, phone numbers, emails and
 * credentials from every part of an error event, while keeping the error type,
 * the stack and plain code errors readable.
 */

import type { Event } from '@sentry/node';
import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, scrubString } from '../error-scrub.js';

const TRANSCRIPT = 'I keep thinking about the divorce and I cannot sleep';
const SHORT_TRANSCRIPT = 'my mom passed last week';
const PHONE = '+1 (415) 555-0134';
const PHONE_E164 = '+14155550134';
const EMAIL = 'dana.k@example.com';
const BEARER = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXZhbHVl';
const API_KEY = 'fake9f8e7d6c5b4a3210fedcba9876key';
const FIREBASE_UID = 'Xy7Qp2Lm9Rt4Vb8Nc1Kd5Fg3Hj6';

/** Every sensitive string the fixtures plant. */
const SECRETS = [
  'divorce',
  'cannot sleep',
  'mom passed',
  '415',
  '0134',
  EMAIL,
  'dana.k',
  BEARER,
  'eyJhbGci',
  API_KEY,
  FIREBASE_UID,
  'hunter2',
  'Session=abc',
];

function leaked(value: unknown): string[] {
  const text = JSON.stringify(value);
  return SECRETS.filter((s) => text.includes(s));
}

function realisticEvent(): Event {
  return {
    message: `Turn failed for caller ${PHONE}`,
    logentry: { message: `transcript: ${TRANSCRIPT}`, params: [PHONE] },
    transaction: `POST /api/calls/${PHONE_E164}?token=${API_KEY}`,
    user: { id: FIREBASE_UID, email: EMAIL, ip_address: '10.1.2.3' },
    extra: { callerPhone: PHONE, transcript: TRANSCRIPT, userMessage: SHORT_TRANSCRIPT },
    tags: { source: 'log', phone: PHONE_E164, userId: FIREBASE_UID },
    request: {
      method: 'POST',
      url: `https://api.ferni.ai/api/sms/inbound?From=${encodeURIComponent(PHONE_E164)}&Body=${encodeURIComponent(TRANSCRIPT)}`,
      headers: { Authorization: `Bearer ${BEARER}`, Cookie: 'Session=abc' },
      data: { Body: TRANSCRIPT, From: PHONE_E164 },
      query_string: `From=${PHONE_E164}`,
      cookies: { Session: 'abc' },
    },
    contexts: {
      runtime: { name: 'node', version: 'v22.12.0' },
      log: { message: `Failed handling "${SHORT_TRANSCRIPT}" for ${EMAIL}` },
      session: { callerNumber: PHONE, lastUtterance: TRANSCRIPT },
    },
    exception: {
      values: [
        {
          type: 'Error',
          value: `Failed to process utterance: ${TRANSCRIPT}`,
          mechanism: { type: 'generic', handled: true, data: { input: TRANSCRIPT } },
          stacktrace: {
            frames: [
              {
                filename: '/app/dist/agents/turn-handler.js',
                function: 'handleTurn',
                lineno: 42,
                vars: { text: TRANSCRIPT, phone: PHONE },
              },
            ],
          },
        },
        { type: 'TypeError', value: `Cannot use password=hunter2 with key ${API_KEY}` },
      ],
    },
    breadcrumbs: [
      { category: 'console', message: `user said ${TRANSCRIPT}` },
      {
        category: 'http',
        type: 'http',
        data: {
          method: 'POST',
          status_code: 200,
          url: `https://api.cartesia.ai/tts?api_key=${API_KEY}`,
          body: TRANSCRIPT,
        },
      },
      { category: 'session', message: `caller ${EMAIL}`, data: { phone: PHONE } },
    ],
    spans: [
      {
        span_id: '1',
        trace_id: '2',
        status: 'ok',
        start_timestamp: 0,
        description: `GET https://x.example/u?phone=${PHONE_E164}`,
        data: { 'http.request.body': TRANSCRIPT },
      },
    ],
  };
}

describe('scrubEvent', () => {
  it('fixture plants every secret before scrubbing (the check below is not vacuous)', () => {
    expect(leaked(realisticEvent())).toEqual(SECRETS);
  });

  it('removes transcripts, phone numbers, emails, tokens and bodies from every field', () => {
    expect(leaked(scrubEvent(realisticEvent()))).toEqual([]);
  });

  it('scrubs custom fingerprints and drops thread names', () => {
    const out = scrubEvent({
      fingerprint: [`caller ${PHONE}`],
      threads: { values: [{ id: 1, name: SHORT_TRANSCRIPT }] },
    });
    expect(leaked(out)).toEqual([]);
  });

  it('drops user, extras, request body/headers/cookies/query and unknown contexts and tags', () => {
    const out = scrubEvent(realisticEvent());
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.request).toEqual({ method: 'POST', url: 'https://api.ferni.ai/api/sms/inbound' });
    expect(Object.keys(out.contexts ?? {}).sort()).toEqual(['log', 'runtime']);
    expect(out.tags).toEqual({ source: 'log' });
    expect(out.exception?.values?.[0]?.mechanism?.data).toBeUndefined();
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
  });

  it('keeps what debugging needs: error types, stack frames, runtime, http breadcrumbs', () => {
    const out = scrubEvent(realisticEvent());
    expect(out.exception?.values?.map((v) => v.type)).toEqual(['Error', 'TypeError']);
    expect(out.exception?.values?.[0]?.value).toBe('Failed to process utterance: [redacted]');
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]?.function).toBe('handleTurn');
    expect(out.contexts?.['runtime']).toEqual({ name: 'node', version: 'v22.12.0' });
    expect(out.breadcrumbs).toHaveLength(1);
    expect(out.breadcrumbs?.[0]?.data).toEqual({
      method: 'POST',
      status_code: 200,
      url: 'https://api.cartesia.ai/tts',
    });
  });
});

describe('scrubString', () => {
  it.each([
    [`Error from caller ${PHONE}`, '415'],
    [`no route for ${PHONE_E164}`, '4155550134'],
    [`sip:${PHONE_E164}@pstn.twilio.com hung up`, '4155550134'],
    [`invite failed for ${EMAIL}`, EMAIL],
    [`401 with Authorization: Bearer ${BEARER}`, 'eyJhbGci'],
    [`bad api_key=${API_KEY}`, API_KEY],
    [`user ${FIREBASE_UID} not found`, FIREBASE_UID],
    [`cannot parse "${SHORT_TRANSCRIPT}"`, SHORT_TRANSCRIPT],
    [`cannot parse ‘${SHORT_TRANSCRIPT}’`, SHORT_TRANSCRIPT],
    [`LLM rejected prompt: ${SHORT_TRANSCRIPT}`, SHORT_TRANSCRIPT],
    [`the user said ${SHORT_TRANSCRIPT}`, SHORT_TRANSCRIPT],
    [TRANSCRIPT, 'divorce'],
    [`{"role":"user","text":"${SHORT_TRANSCRIPT}"}`, SHORT_TRANSCRIPT],
    [`transcript was: ${SHORT_TRANSCRIPT}`, SHORT_TRANSCRIPT],
    ['card 4111 1111 1111 1111 declined', '4111'],
    ['dial 415–555–0132 failed', '0132'],
    ['dial 415/555/0132 failed', '0132'],
    ['dial 415_555_0132 failed', '0132'],
    ['dial ٤١٥٥٥٥٠١٣٢ failed', '٠١٣٢'],
    // Two numbers joined into one long run still go.
    ['dial 415-555-0132/415-555-0199 failed', '0199'],
  ])('removes the sensitive part of %j', (input, secret) => {
    expect(scrubString(input)).not.toContain(secret);
  });

  it.each([
    "Cannot read properties of undefined (reading 'turnId')",
    'socket hang up',
    'Request failed with status code 503',
    'ECONNRESET',
    'Unexpected end of JSON input',
  ])('leaves the code error %j readable', (message) => {
    expect(scrubString(message)).toBe(message);
  });

  it('caps very long strings', () => {
    expect(scrubString('x'.repeat(5000)).length).toBeLessThanOrEqual(501);
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console and custom breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: TRANSCRIPT })).toBeNull();
    expect(scrubBreadcrumb({ category: 'session', data: { phone: PHONE } })).toBeNull();
  });
});
