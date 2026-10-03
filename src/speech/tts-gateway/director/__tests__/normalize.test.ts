import { describe, expect, it } from 'vitest';

import { normalizeForSpeech } from '../normalize.js';

const say = (text: string): string => normalizeForSpeech(text).text;

/**
 * Cartesia normalizes conventional written forms itself (prompting guide:
 * "Write in conventional forms and let the system normalize them"), so these
 * pass through exactly as written. Each was spelled out (wrongly, for some)
 * before the normalize lever was narrowed: review findings H2, M1, M7, L4.
 */
describe('normalizeForSpeech leaves conventional forms to Cartesia', () => {
  it.each([
    // H2: decades.
    'The 1990s were loud.',
    "the '80s",
    'the 2000s',
    // M1: years and counts, alone and in lists.
    'In 1905 and 2005 and 2010 we moved.',
    'I have 2024 reasons.',
    '1500 people came.',
    // M7: dates and things that only look like dates.
    'due on 10/3, so soon',
    '10/3 works',
    'open 24/7',
    'a 50/50 chance',
    'add 1/2 cup',
    'born 7/4/1999',
    'Oct. 3 works',
    // L4: negatives.
    'It was -5 degrees.',
    // Money, times, percentages, phone numbers, grouped numbers.
    'It costs $19.99 or $4,200.',
    'See you at 7:00 PM.',
    'up 12% this year',
    'call (415) 555-1212',
    'about 12,500 steps',
  ])('%s', (text) => {
    expect(normalizeForSpeech(text)).toEqual({ text, count: 0 });
  });

  it('keeps abbreviations as written', () => {
    expect(say('Mrs. Johnson vs. Dr. Patel, e.g. today')).toBe(
      'Mrs. Johnson vs. Dr. Patel, e.g. today'
    );
  });
});

describe('normalizeForSpeech: clock times in the documented form', () => {
  it('gives an hour its minutes and a spaced, capital AM/PM', () => {
    expect(say('See you at 7pm.')).toBe('See you at 7:00 PM.');
    expect(say('at 7 p.m. sharp')).toBe('at 7:00 PM sharp');
    expect(say('wake at 6am')).toBe('wake at 6:00 AM');
  });

  it('fixes the AM/PM on a time with minutes', () => {
    expect(say('Call at 3:30 p.m. if you can.')).toBe('Call at 3:30 PM if you can.');
    expect(say('Meet at 9:05am. Bring water.')).toBe('Meet at 9:05 AM. Bring water.');
    expect(say('Lunch is 12:15pm')).toBe('Lunch is 12:15 PM');
  });

  it('leaves times without AM/PM and impossible hours alone', () => {
    expect(say('at 10:00')).toBe('at 10:00');
    expect(say('a 13pm typo')).toBe('a 13pm typo');
  });
});

describe('normalizeForSpeech: markdown and emoji never reach the voice', () => {
  it('strips emphasis, code, headings and links', () => {
    expect(say('That is **so** good')).toBe('That is so good');
    expect(say('a *really* big deal')).toBe('a really big deal');
    expect(say('try __this__ first')).toBe('try this first');
    expect(say('run `npm test` now')).toBe('run npm test now');
    expect(say('# Plan for today')).toBe('Plan for today');
    expect(say('read [the guide](https://example.com/guide) first')).toBe('read the guide first');
  });

  it('drops a written-out sigh (Stage 2 renders it) and emoji', () => {
    expect(say('*sighs* Okay, here we go.')).toBe('Okay, here we go.');
    expect(say('That is great 😊.')).toBe('That is great.');
    expect(say('Nice 👍🏽 work 👨‍👩‍👧')).toBe('Nice work');
  });

  it('keeps snake_case, hashtags-with-numbers and Cartesia markup', () => {
    expect(say('set my_var to 3')).toBe('set my_var to 3');
    expect(say("We're #1")).toBe("We're #1");
    expect(say('[laughter] ok <break time="300ms"/> go')).toBe(
      '[laughter] ok <break time="300ms"/> go'
    );
  });
});

describe('normalizeForSpeech: shouted emphasis', () => {
  it('lowercases an all-caps word used for emphasis', () => {
    expect(say('That is REALLY good')).toBe('That is really good');
    expect(say("I DON'T know")).toBe("I don't know");
    expect(say('THIS IS HUGE. Okay.')).toBe('This is huge. Okay.');
  });

  it('lowercases emphasis words of any length: a LOT, No WAY, I DID it', () => {
    expect(say('That is a LOT of money.')).toBe('That is a lot of money.');
    expect(say('No WAY.')).toBe('No way.');
    expect(say('I DID it. You HAD to.')).toBe('I did it. You had to.');
  });

  it('keeps acronyms and consonant clusters', () => {
    expect(say('NASA and the FBI said OK')).toBe('NASA and the FBI said OK');
    expect(say('BTW the NYC trip is ASAP')).toBe('BTW the NYC trip is ASAP');
    expect(say('an MP3 file')).toBe('an MP3 file');
  });
});

describe('normalizeForSpeech: accounting', () => {
  it('counts what it changed and leaves plain text alone', () => {
    expect(normalizeForSpeech('Nothing to change here.')).toEqual({
      text: 'Nothing to change here.',
      count: 0,
    });
    expect(normalizeForSpeech('**WOW** at 3pm').count).toBe(3);
  });

  it('never rewrites inside bracket or angle markup', () => {
    expect(say('<emotion value="REALLY"/>REALLY')).toBe('<emotion value="REALLY"/>Really');
  });

  it.each([
    'The FDIC insures it. SIPC covers brokerages. Check your FICO score.',
    'Buy AAPL or TSLA or NVDA or GOOG, or VTSAX, or SCHD.',
    'Try HIIT for ADHD. HELOC vs EBITDA. AARP and FAFSA.',
    'In World War II and Henry VIII and Super Bowl LVIII.',
    'Max out your IRA and your 401K. My CPA said ROTH. The DOW and NASDAQ.',
  ])('fails safe: leaves every caps token not on the emphasis list (%s)', (text) => {
    expect(normalizeForSpeech(text)).toEqual({ text, count: 0 });
  });

  it('keeps ambiguous words that are also acronyms in caps', () => {
    expect(say('WHO said IT is in the US, and AM radio too')).toBe(
      'WHO said IT is in the US, and AM radio too'
    );
  });
});
