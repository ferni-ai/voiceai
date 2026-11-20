/**
 * CRISIS_988_STRICT_PRESENCE (#4026): old vs new over every written form of 988, at every reader.
 * Only names988 and says988 (where a miss adds the line) may change, and only on the forms that
 * are not the crisis line. offersCrisisLine, reachesHelp and the speech rewrite never change, so
 * no real mention of the line can go unread there. All forms are invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { smsReplyText } from '../../outreach/sms-reply/sms-reply-text.js';
import { names988, offersCrisisLine, says988, speakCrisisLine } from '../crisis-line-speech.js';
import { reachesHelp } from '../safety-talk.js';

const NBSP = String.fromCharCode(0xa0);
const EN_DASH = String.fromCharCode(0x2013);

/** Forms of the crisis line: every reader reads each the same with the flag on as off. */
const LINE_FORMS = [
  'Call or text 988.',
  'call or text 988 24/7',
  'You can reach 988, 24/7.',
  'Text 988 any time.',
  'Dial 9-8-8 now.',
  'call 9 8 8',
  'call 9 8 8 24/7',
  'text 9 8 8 7 days a week',
  'the 988-lifeline site',
  'the 988 line',
  '(988)',
  'Call 988!',
  'Is 988 open?',
  'Number: 988',
  'call "988"',
  '988lifeline.org',
  'nine eight eight',
  'nine-eight-eight',
  'ninety-eight-eight',
  'nine, eight, eight',
  'nueve ocho ocho',
  `9${EN_DASH}8${EN_DASH}8`,
  `9${NBSP}8${NBSP}8`,
  "988, it's free",
  '988 or 911',
  'call 911 or 988',
  'call 988 and stay with me',
  '988 is open right now',
  'Call 988 in 10 minutes if it still feels this heavy.',
  'call 988 miles away or not',
];

/** Not the crisis line: only names988 and says988 change, from true to false. */
const NOT_THE_LINE = [
  'That was 988 dollars.',
  'it cost 988 bucks',
  '988 Dollars',
  '988 USD',
  'about 988 euros',
  '988 cents',
  'call 1-988-555-0100',
  '1-988-555',
  'press 1-988 for billing',
  '988-555-0100',
  '9-8-8-0',
  '9 8 8 0',
  'the code is 9 8 8 0.',
];

/** Neither, with the flag off or on. */
const NEVER = ['$988', '9880', '19880', '988.5', 'room 9885', 'nine hundred', 'a crisis'];

const readers = {
  names988,
  says988,
  offersCrisisLine,
  reachesHelp,
  speakCrisisLine: (text: string) => speakCrisisLine(text),
} as const;

function readAll(text: string, strict: boolean): Record<string, unknown> {
  vi.stubEnv('CRISIS_988_STRICT_PRESENCE', strict ? 'on' : 'off');
  return Object.fromEntries(Object.entries(readers).map(([name, read]) => [name, read(text)]));
}

/** Each reader whose answer the flag changes for this form, as `reader: off → on`. */
function changes(text: string): string[] {
  const off = readAll(text, false);
  const on = readAll(text, true);
  return Object.keys(readers)
    .filter((name) => off[name] !== on[name])
    .map((name) => `${name}: ${String(off[name])} → ${String(on[name])}`);
}

afterEach(() => vi.unstubAllEnvs());

describe('CRISIS_988_STRICT_PRESENCE equivalence table', () => {
  it('every form of the line reads the same at every reader with the flag on', () => {
    for (const text of LINE_FORMS) {
      expect(changes(text), text).toEqual([]);
      expect(readAll(text, true).offersCrisisLine, text).toBe(true);
      expect(readAll(text, true).names988, text).toBe(true);
    }
  });

  it('a form that is not the line: only names988 and says988 change, toward adding it', () => {
    for (const text of NOT_THE_LINE) {
      const off = readAll(text, false);
      expect(off.names988, text).toBe(true); // main's reader takes it for the line (#4026)
      const expected = ['names988: true → false'];
      if (off.says988) expected.push('says988: true → false');
      expect(changes(text), text).toEqual(expected);
      expect(readAll(text, true).offersCrisisLine, text).toBe(off.offersCrisisLine); // wide
    }
  });

  it('a form neither reader reads, flag off or on, stays unread', () => {
    for (const text of NEVER) {
      expect(changes(text), text).toEqual([]);
      expect(readAll(text, true).names988, text).toBe(false);
    }
  });

  it('flag off: names988 and says988 are main’s on every form', () => {
    vi.stubEnv('CRISIS_988_STRICT_PRESENCE', 'off');
    for (const text of NOT_THE_LINE) expect(names988(text)).toBe(true);
    expect(says988('9 8 8 0')).toBe(true);
    expect(says988('988 dollars')).toBe(true);
  });

  it('the SMS lifeline tail is added after "988 dollars" only with the flag on', () => {
    const model = 'That bike was 988 dollars, wild.';
    vi.stubEnv('CRISIS_988_STRICT_PRESENCE', 'off');
    const off = smsReplyText(model, { lifeline: true });
    vi.stubEnv('CRISIS_988_STRICT_PRESENCE', 'on');
    const on = smsReplyText(model, { lifeline: true });
    expect(off).toBe(model);
    expect(on).not.toBe(off);
    expect(on?.startsWith(model)).toBe(true);
    expect(on?.length).toBeGreaterThan(model.length);
    expect(says988((on ?? '').slice(model.length))).toBe(true); // the tail carries 988 itself
  });

  it('a 20k-char reply reads in under 50 ms with the flag on', () => {
    vi.stubEnv('CRISIS_988_STRICT_PRESENCE', 'on');
    for (const unit of ['9 8 8 ', '1-988-', '988 dollars ', '9-8-8-']) {
      const text = unit.repeat(Math.ceil(20_000 / unit.length)).slice(0, 20_000);
      const started = performance.now();
      names988(text);
      says988(text);
      expect(performance.now() - started).toBeLessThan(50);
    }
  });
});
