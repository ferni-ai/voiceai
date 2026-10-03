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
    // M7: dates and things that only look like dates. A bare M/D with date
    // context ("on 10/3") is now written out (see "bare dates" below).
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
  it('gives an hour a spaced, capital AM/PM', () => {
    expect(say('See you at 7pm.')).toBe('See you at 7 PM.');
    expect(say('at 7 p.m. sharp')).toBe('at 7 PM sharp');
    expect(say('wake at 6am')).toBe('wake at 6 AM');
  });

  it('reads a time range as a range, not a minus (round 2 LOW)', () => {
    expect(say('free 7-9pm tonight')).toBe('free 7 to 9 PM tonight');
    expect(say('meet 7pm-9pm')).toBe('meet 7 to 9 PM');
    expect(say('11am-2pm works')).toBe('11 AM to 2 PM works');
    expect(say('from 7:30 - 9 p.m. Then home.')).toBe('from 7:30 to 9 PM. Then home.');
    expect(say('I said 5 - 3')).toBe('I said 5 - 3');
  });

  it('never inserts a sentence break after "p.m." mid-sentence (round 2 LOW)', () => {
    expect(say('call me after 7 p.m. I should be free')).toBe(
      'call me after 7 PM I should be free'
    );
    expect(say('after 7 p.m. and before 9')).toBe('after 7 PM and before 9');
    // A real sentence end keeps its period.
    expect(say('Meet at 7 p.m. Bring water.')).toBe('Meet at 7 PM. Bring water.');
    expect(say('Meet at 7 p.m.')).toBe('Meet at 7 PM.');
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

  it('never speaks a stage direction (round 2 MED)', () => {
    expect(say('*smiles* That is great. *laughs* Okay. *takes a breath* Now.')).toBe(
      'That is great. Okay. Now.'
    );
    // Review H1: "chuckles" is the sentence's own verb here, not a
    // stand-alone aside, so it keeps the word (asterisks still unwrapped,
    // same as any other action word on the Director's path).
    expect(say("that's funny *chuckles* anyway")).toBe("that's funny chuckles anyway");
    expect(say('*a long pause* So.')).toBe('So.');
    // Emphasis keeps its words, wherever it sits.
    expect(say('That was *great*.')).toBe('That was great.');
    expect(say('*Really* good')).toBe('Really good');
  });

  it('leaves arithmetic, censored words and a lone bullet star in the middle alone', () => {
    expect(say('5*3 is 15, and 2 * 4 is 8.')).toBe('5*3 is 15, and 2 * 4 is 8.');
    expect(say('f*** that')).toBe('f*** that');
  });

  it('leaves a spaced number sign alone; strips only a leading heading', () => {
    expect(say('We are # 2 and #1')).toBe('We are # 2 and #1');
    expect(say('# 2 is next')).toBe('# 2 is next');
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
});

describe('normalizeForSpeech: <spell> content is markup, never rewritten', () => {
  it('leaves a spelled code alone even when it looks like a time or emphasis', () => {
    expect(say('Your code is <spell>7PM AM</spell>, okay?')).toBe(
      'Your code is <spell>7PM AM</spell>, okay?'
    );
    expect(say('Use <spell>NOW 😊</spell> at 7pm')).toBe('Use <spell>NOW 😊</spell> at 7 PM');
  });
});

/**
 * Cartesia reads a bare "10/3" as "10 thirds" (live run with Lester,
 * 2026-10-03); its guide wants MM/DD/YYYY. A bare M/D in date context is
 * written as the month name; anything else that looks like a fraction stays.
 */
describe('normalizeForSpeech: bare dates in date context', () => {
  it.each([
    ['due on 10/3, so soon', 'due on October 3, so soon'],
    ['the bill was $4,200 on 10/3, and', 'the bill was $4,200 on October 3, and'],
    ['by 12/31 at the latest', 'by December 31 at the latest'],
    ['Until 1/15 we wait', 'Until January 15 we wait'],
    ['since 2/29', 'since February 29'],
    ['due 4/1', 'due April 1'],
    ['see you Friday 10/3', 'see you Friday October 3'],
    ['see you Fri, 10/3', 'see you Fri, October 3'],
    ['from 9/5 to 9/9', 'from September 5 to September 9'],
    ['before 3/4 or after 3/8', 'before March 4 or after March 8'],
  ])('%s', (input, expected) => {
    expect(say(input)).toBe(expected);
  });

  it.each([
    'open 24/7',
    'a 50/50 chance',
    'add 1/2 cup',
    'add 3/4 cup of flour',
    'about 3/4 of them',
    'born 7/4/1999',
    'on 10/3/2026',
    'on 10/3/26',
    'on 13/3',
    'on 2/30',
    'on 0/5',
    '10/3 works',
    'score was 2/3 on Friday',
  ])('leaves %s alone', (text) => {
    expect(say(text)).toBe(text);
  });
});

/** The normalize lever stripped ** but sent list dashes ("Idea: - one - two") to Cartesia. */
describe('normalizeForSpeech: markdown list dashes', () => {
  it.each([
    ['Idea: - one - two', 'Idea: one, two'],
    ['Try these: - stretch - walk - breathe.', 'Try these: stretch, walk, breathe.'],
    ['- buy milk - call mom', 'buy milk, call mom'],
    ['- just one item', 'just one item'],
  ])('%s', (input, expected) => {
    expect(say(input)).toBe(expected);
  });

  it.each(['It was -5 degrees.', 'I went - well, sort of - home.', 'call (415) 555-1212', '7-9pm'])(
    'leaves prose dashes alone: %s',
    (text) => {
      expect(say(text)).toBe(normalizeForSpeech(text).text);
      expect(say(text)).not.toMatch(/,\s*well/);
    }
  );

  it('leaves a mid-sentence dash in prose alone', () => {
    expect(say('I went - well, sort of - home.')).toBe('I went - well, sort of - home.');
  });
});
