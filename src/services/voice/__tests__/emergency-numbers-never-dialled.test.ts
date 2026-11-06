/**
 * Ferni never dials an emergency or N11 service number, in any spelling, on any
 * call path: a contact saved as "+1911" or "1-988" is refused before anything
 * rings, with words that say Ferni can't place emergency calls and the caller
 * should dial it themselves (utils/dialable-number.ts).
 *
 * Before: persona-voice calls and voicemail (callWithPersonaVoice) had no
 * number check, so a saved "+1911" contact was dialled as +1911. The
 * conversation path (scheduleProactiveCall) refused it only because "+1911" is
 * too short to be a phone number.
 *
 * The real call code runs over an in-memory Firestore. Mocked: the Twilio REST
 * call (fetch), the owner's verified-phone lookup and the calling-hours hold.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConsentDb } from '../../messaging/__tests__/memory-consent.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    TWILIO_STREAM_WEBHOOK_URL: 'wss://stream.example.test',
  });
});
const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof fakeConsentDb> }));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fake.db.db,
}));
vi.mock('../../superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => null,
}));
vi.mock('../../outreach/guarded-text.js', async (orig) => ({
  ...(await orig<typeof import('../../outreach/guarded-text.js')>()),
  isOwnVerifiedPhone: async () => false,
}));
const hours = vi.hoisted(() => vi.fn(async () => ({ id: 'held' })));
vi.mock('../../outreach/deferred-calls.js', () => ({ holdForCallHours: hours }));
const fetchSpy = vi.fn(
  async (_url: string | URL, _init?: unknown) =>
    new Response(JSON.stringify({ sid: 'CA1' }), { status: 201 })
);
vi.stubGlobal('fetch', fetchSpy);

import { callWithPersonaVoice } from '../voice-call.js';
import { scheduleProactiveCall } from '../../outreach/conversational-calls.js';
import { checkDialableNumber, emergencyDialRefusal } from '../../../utils/dialable-number.js';
import { registerMessagingConsent } from '../../messaging/consent.js';

registerMessagingConsent(); // as each process entry does (utils/consent-port.ts)

/** Each emergency or N11 number, in the spellings a saved contact or the model might use. */
const SPELLINGS: ReadonlyArray<[string, string]> = [
  ['911', '911'],
  ['9-1-1', '911'],
  ['+1911', '911'],
  ['+1 (911)', '911'],
  ['988', '988'],
  ['1-988', '988'],
  ['+1 988', '988'],
  ['112', '112'],
  ['+44 999', '999'],
  ['000', '000'],
  ['+61 000', '000'],
  ['933', '933'],
  ['411', '411'],
  ['+1 211', '211'],
];
const PAT = '+12025550177'; // the non-emergency control: an ordinary saved contact
const twilioCalls = () =>
  fetchSpy.mock.calls.filter(([u]) => String(u).includes('/Calls.json')).length;

/** The words every path gives the model: it can't place the call; dial it; crisis help stays. */
function saysDialItYourself(text: string | undefined, number: string): void {
  expect(text).toContain(`${number} is an emergency or service number`);
  expect(text).toContain("Ferni can't place emergency calls");
  expect(text).toContain(`dial ${number} themselves`);
  expect(text).toContain('still give them the crisis line and the emergency number');
}

beforeEach(() => {
  fake.db = fakeConsentDb();
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  fetchSpy.mockClear();
  hours.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => vi.unstubAllGlobals());

describe('the rule (checkDialableNumber, emergencyDialRefusal)', () => {
  it.each(SPELLINGS)('%s is refused as %s, not as a malformed number', (spelled, number) => {
    const check = checkDialableNumber(spelled);
    expect(check.ok).toBe(false);
    saysDialItYourself(check.ok ? undefined : check.reason, number);
    saysDialItYourself(emergencyDialRefusal(spelled) ?? undefined, number);
  });

  it('ordinary numbers, at home and abroad, are not emergency numbers', () => {
    expect(checkDialableNumber('(202) 555-0177')).toMatchObject({ ok: true, e164: PAT });
    expect(checkDialableNumber('1-202-555-0177')).toMatchObject({ ok: true, e164: PAT });
    for (const n of [PAT, '+44 20 7946 0911', '+61 2 5550 1988', '12345'])
      expect(emergencyDialRefusal(n)).toBeNull();
  });
});

describe('persona-voice call and voicemail (callWithPersonaVoice)', () => {
  it.each(SPELLINGS)('a contact saved as %s is never dialled', async (spelled, number) => {
    for (const askedFor of [true, false]) {
      const out = await callWithPersonaVoice(spelled, 'hi', 'ferni', {
        ownerUid: 'u1',
        userId: 'u1',
        askedFor,
        fallbackToTwilioVoice: true,
      });
      expect(out.success).toBe(false);
      expect(out.message).toMatch(/^Not calling: /);
      saysDialItYourself(out.message, number);
    }
    expect(twilioCalls()).toBe(0);
  });

  it('the non-emergency control still dials', async () => {
    const out = await callWithPersonaVoice(PAT, 'hi', 'ferni', {
      askedFor: true,
      fallbackToTwilioVoice: true,
    });
    expect(out).toMatchObject({ success: true, callSid: 'CA1' });
    expect(twilioCalls()).toBe(1);
  });
});

describe('conversation call (scheduleProactiveCall)', () => {
  const call = (phoneNumber: string) =>
    scheduleProactiveCall({
      userId: 'u1',
      phoneNumber,
      message: 'hi',
      ssml: '<speak>hi</speak>',
      personaId: 'ferni',
      reason: 'test',
    });

  it.each(SPELLINGS)('%s is refused by the emergency rule itself', async (spelled, number) => {
    const out = await call(spelled);
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/^Not calling: /);
    saysDialItYourself(out.error, number);
    expect(out.error).not.toContain('Invalid phone number format');
    expect(hours).not.toHaveBeenCalled();
    expect(twilioCalls()).toBe(0);
  });

  it('the non-emergency control gets past the number check to the call it would place', async () => {
    const out = await call(PAT);
    expect(out.error ?? '').not.toMatch(/emergency|Invalid phone number/);
    expect(hours).toHaveBeenCalledOnce(); // reached the calling-hours step, after every refusal
  });
});
