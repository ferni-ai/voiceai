import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizeForSpeech, replyNormalizer } from '../normalize.js';

/**
 * SPEAK_PHONE_DIGITS (spoken-phone-numbers.ts). Measured 2026-10-29: a
 * comma-grouped 3-3-4 number was read as three amounts in 3 of 3 takes, and
 * digit by digit once written (NNN) NNN-NNNN. A bare 3-3-4 group is a phone
 * number only after a phone cue or a leading 1 (round 1 review: lists of counts
 * such as "250, 375, 1200 calories" were rewritten). Fixture numbers are
 * fictional (555-01xx).
 */
describe('normalizeForSpeech: phone numbers (SPEAK_PHONE_DIGITS=on)', () => {
  beforeEach(() => {
    process.env.SPEAK_PHONE_DIGITS = 'on';
  });
  afterEach(() => {
    delete process.env.SPEAK_PHONE_DIGITS;
  });

  it.each([
    // Comma- and space-separated groups after a phone cue.
    ['my number is 415, 555, 0123', 'my number is (415) 555-0123'],
    ['call me at 415 555 0123', 'call me at (415) 555-0123'],
    ['Call 415,555,0123 tonight', 'Call (415) 555-0123 tonight'],
    ['her cell is 415 555 0123', 'her cell is (415) 555-0123'],
    ["Her number's 415, 555, 0147.", "Her number's (415) 555-0147."],
    // +1 E.164, plain and punctuated, and a leading 1: no cue needed.
    ['+1 415 555 0123', '(415) 555-0123'],
    ['+14155550123', '(415) 555-0123'],
    ['dial +14155550123 now', 'dial (415) 555-0123 now'],
    ['dial +1 415 555 0123 now', 'dial (415) 555-0123 now'],
    ['dial +1 (415) 555-0123 now', 'dial (415) 555-0123 now'],
    ['dial +1-415-555-0123.', 'dial (415) 555-0123.'],
    ['dial +1 415, 555, 0123', 'dial (415) 555-0123'],
    ['it is 1 415 555 0123', 'it is (415) 555-0123'],
    // Two numbers after one cue (numbers between them don't use up the window).
    ['call 415, 555, 0123 or 212, 555, 0147', 'call (415) 555-0123 or (212) 555-0147'],
    // Toll-free still reads as a phone number.
    ['dial 800, 555, 0199', 'dial (800) 555-0199'],
  ])('%s', (input, spoken) => {
    expect(normalizeForSpeech(input)).toEqual({
      text: spoken,
      count: spoken.split('(').length - 1,
    });
  });

  it.each([
    // Money, counts and grouped thousands.
    'It costs $1,200.',
    'It costs $1,200, $3,400 or $5,600.',
    '1,500 people came.',
    'about 12,500 steps',
    '1,234,567 views',
    // Years, times, accounts, percentages.
    'in 2026',
    'See you at 7:30.',
    'Max out the 401k first.',
    'up 12% this year',
    // Forms Sonic already reads digit by digit.
    'call (415) 555-0123',
    'call 415-555-0123',
    'call 415.555.0123',
    'call 4155550123',
    // Lists of amounts with no phone cue (round 1 review).
    '250, 375, 1200 calories',
    '225, 450, 1125 steps',
    'reps of 315, 405, 1225',
    '512, 768, 1024 MB',
    'spent 450, 625, 1250 dollars',
    'the scores were 215, 348, 1990',
    '512 768 1024',
    // With no cue, a bare group is left as written, phone or not.
    "It's 415, 555, 0147.",
    // Other countries' numbers, with or without a cue.
    '+44 207 946 0958',
    '+49 301 234 5678',
    'call +44 207 946 0958',
    'call +49 301 234 5678',
    // Lists and look-alikes that are not phone numbers.
    'call at 250, 500, 1000',
    '250, 500, 1000 calories',
    'between 200, 300, and 1000 people',
    '100, 150, 2000',
    'room 415 555 0123x',
    'a 415, 555 0123 mix',
    'numbers like 415, 555, 01234',
    '+44 20 7946 0958',
    '988',
    '1-800-555-0199',
    // Grouped digits inside a bigger number or after a decimal point.
    '9415 555 0123',
    '3.415 555 0123',
  ])('leaves %s', (text) => {
    expect(normalizeForSpeech(text)).toEqual({ text, count: 0 });
  });

  it('counts a cue from an earlier push of the same reply', () => {
    const push = replyNormalizer();
    expect(push('Sure, her number? ').text).toBe('Sure, her number? ');
    expect(push("It's 415, 555, 0147.").text).toBe("It's (415) 555-0147.");
  });

  it('does not count a cue more than four words back', () => {
    expect(normalizeForSpeech('call the gym and ask them about 415, 555, 0147').count).toBe(0);
  });

  it('leaves markup alone and rewrites the words around it', () => {
    expect(normalizeForSpeech('<break time="80ms"/>Call 415, 555, 0123.').text).toBe(
      '<break time="80ms"/>Call (415) 555-0123.'
    );
  });
});

describe('normalizeForSpeech: phone numbers with SPEAK_PHONE_DIGITS off', () => {
  it.each([undefined, 'off'])('SPEAK_PHONE_DIGITS=%s leaves every shape as written', (value) => {
    if (value === undefined) delete process.env.SPEAK_PHONE_DIGITS;
    else process.env.SPEAK_PHONE_DIGITS = value;
    for (const text of [
      'my number is 415, 555, 0123',
      'her cell is 415 555 0123',
      'dial +14155550123 now',
    ]) {
      expect(normalizeForSpeech(text)).toEqual({ text, count: 0 });
    }
    delete process.env.SPEAK_PHONE_DIGITS;
  });
});
