/**
 * A proactive call's message goes inside a TwiML <Say>. Text that closes the
 * <Say> and opens a <Dial> must stay text, or Twilio dials a number nobody
 * chose. And a call asked for during quiet hours is stored for later in one
 * step: the quiet-hours check reads the clock, so re-checking a later
 * scheduledFor used to recurse forever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs: Record<string, Record<string, unknown>> = {};
const reads: Record<string, number> = {};
const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
const fakeDoc = (path: string) => ({
  get: async () => {
    await tick(); // yield to timers so a runaway loop still lets the test time out
    reads[path] = (reads[path] ?? 0) + 1;
    return { exists: !!docs[path], data: () => docs[path] };
  },
  set: async () => undefined,
  collection: (name: string) => ({ doc: (id: string) => fakeDoc(`${path}/${name}/${id}`) }),
});
const db = {
  collection: (name: string) => ({ doc: (id: string) => fakeDoc(`${name}/${id}`) }),
  collectionGroup: () => ({
    where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) }),
  }),
};
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

const create = vi.fn(async (_opts: { twiml: string }) => ({ sid: 'CA_1' }));
vi.mock('twilio', () => ({ default: () => ({ calls: { create } }) }));

import { escapeXml, toTwilioSsml } from '../twilio-ssml.js';
import { scheduleProactiveCall } from '../conversational-calls.js';

const INJECTED = 'hi</Say><Dial>+19005550100</Dial><Redirect>https://x.example</Redirect><Say>';
const request = (userId: string, ssml: string) => ({
  userId,
  phoneNumber: '+15551230000',
  message: 'x',
  ssml,
  personaId: 'ferni',
  reason: 'test',
});
const count = (s: string, tag: string) => s.split(`<${tag}`).length - 1;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(docs)) delete docs[k];
  for (const k of Object.keys(reads)) delete reads[k];
  delete process.env.CALL_HOURS_GUARD;
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 't';
  process.env.TWILIO_PHONE_NUMBER = '+15550000000';
});
afterEach(() => vi.useRealTimers());

describe('toTwilioSsml', () => {
  it('turns a TwiML injection into spoken text', () => {
    const out = toTwilioSsml(`<speak>${INJECTED}</speak>`);
    expect(out).not.toMatch(/<\/?(Say|Dial|Redirect|speak)\b/i);
    expect(out).toBe(escapeXml('hi+19005550100https://x.example'));
  });

  it('keeps allowed speech tags with checked attributes, balanced', () => {
    const out = toTwilioSsml(
      '<prosody rate="0.9" onload="x">slow</prosody><break time="300ms"/><emphasis level="huge">a</emphasis><p>b'
    );
    expect(out).toBe(
      '<prosody rate="0.9">slow</prosody><break time="300ms"/><emphasis>a</emphasis><p>b</p>'
    );
  });

  it('escapes stray markup characters', () => {
    expect(toTwilioSsml('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;');
  });
});

describe('the TwiML a proactive call sends', () => {
  it('an injected </Say><Dial> stays inside the one message <Say>', async () => {
    const result = await scheduleProactiveCall(request('u1', `<speak>${INJECTED}</speak>`));
    expect(result.status).toBe('initiated');
    const { twiml } = create.mock.calls[0][0];
    // The template has two: the message and "Take care. Talk soon."
    expect(count(twiml, 'Say')).toBe(2);
    for (const verb of ['Dial', 'Redirect', 'Play', 'Gather']) expect(count(twiml, verb)).toBe(0);
    const firstSay = twiml.slice(twiml.indexOf('<Say'), twiml.indexOf('</Say>'));
    expect(firstSay).toContain('hi+19005550100https://x.example'); // spoken, not dialed
  });

  it('allowed prosody and break still reach Twilio', async () => {
    await scheduleProactiveCall(
      request('u1', '<speak><prosody rate="0.9">slow</prosody><break time="300ms"/>ok</speak>')
    );
    const { twiml } = create.mock.calls[0][0];
    expect(twiml).toContain('<prosody rate="0.9">slow</prosody><break time="300ms"/>ok');
  });
});

describe('a call asked for during quiet hours', () => {
  it('is stored for later in one step and not placed', { timeout: 3000 }, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 12, 0));
    docs['bogle_users/u2'] = {
      outreachPreferences: { quietHours: { enabled: true, start: '00:00', end: '23:59' } },
    };
    const result = await scheduleProactiveCall(request('u2', '<speak>hi</speak>'));
    expect(result).toMatchObject({ success: true, status: 'scheduled' });
    expect(create).not.toHaveBeenCalled();
    // One quiet-hours read and one next-window read.
    expect(reads['bogle_users/u2']).toBe(2);
  });
});
