import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizeForSpeech } from '../normalize.js';

/**
 * SPEAK_PHONE_DIGITS (spoken-phone-numbers.ts). Measured 2026-10-29: a
 * comma-grouped 3-3-4 number was read as three amounts in 3 of 3 takes, and
 * digit by digit once written (NNN) NNN-NNNN. Fixture numbers are fictional (555-01xx).
 */
describe('normalizeForSpeech: phone numbers (SPEAK_PHONE_DIGITS=on)', () => {
  beforeEach(() => {
    process.env.SPEAK_PHONE_DIGITS = 'on';
  });
  afterEach(() => {
    delete process.env.SPEAK_PHONE_DIGITS;
  });

  it.each([
    // The measured failure: comma-separated groups.
    ["It's 415, 555, 0147.", "It's (415) 555-0147."],
    ['Call 415,555,0123 tonight', 'Call (415) 555-0123 tonight'],
    // Space-separated groups.
    ['her cell is 415 555 0123', 'her cell is (415) 555-0123'],
    // +1 E.164, plain and punctuated.
    ['dial +14155550123 now', 'dial (415) 555-0123 now'],
    ['dial +1 415 555 0123 now', 'dial (415) 555-0123 now'],
    ['dial +1 (415) 555-0123 now', 'dial (415) 555-0123 now'],
    ['dial +1-415-555-0123.', 'dial (415) 555-0123.'],
    ['dial +1 415, 555, 0123', 'dial (415) 555-0123'],
    // Two numbers in one push, and at the start and end of the text.
    ['415, 555, 0123 or 212, 555, 0147', '(415) 555-0123 or (212) 555-0147'],
    // Toll-free still reads as a phone number.
    ['try 800, 555, 0199', 'try (800) 555-0199'],
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
    // Lists and look-alikes that are not phone numbers.
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
      "It's 415, 555, 0147.",
      'her cell is 415 555 0123',
      'dial +14155550123 now',
    ]) {
      expect(normalizeForSpeech(text)).toEqual({ text, count: 0 });
    }
    delete process.env.SPEAK_PHONE_DIGITS;
  });
});
