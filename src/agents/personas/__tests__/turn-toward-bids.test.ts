import { describe, expect, it } from 'vitest';
import { GOOD_NEWS_NOTE } from '../good-news-bigger.js';
import { newsNote } from '../turn-toward-bids.js';

const ON = { BIDS_TURN_TOWARD: 'on' };
const note = (said: string, env: Record<string, string> = ON, crisis = false) =>
  newsNote(said, ['Hi.', said], { crisis }, env);
const TEASER = /^They're building up to something\. Bite first/;
const SIDE_ROAD = /^They just took a side road/;

describe('newsNote: bids (BIDS_TURN_TOWARD)', () => {
  it.each([
    'Guess what.',
    "You won't believe who I ran into.",
    'Okay, funny story.',
    'So, wait till you hear this.',
    'Guess what happened at the bakery today.',
  ])('asks him to bite on a teaser not yet told: %j', (said) => {
    expect(note(said)).toMatch(TEASER);
  });

  it.each([
    'Guess what, the car broke down again on the highway.',
    'Guess what, I bought a table for the kitchen.',
  ])('gives no teaser note once they have told it: %j', (said) => {
    expect(note(said)).toBe('');
  });

  it.each([
    'Oh, and my cousin Priya is visiting.',
    'Yeah. That reminds me, I never fixed the gate.',
    'Random, but have you ever had quince?',
  ])('asks him to follow a side road: %j', (said) => {
    expect(note(said)).toMatch(SIDE_ROAD);
  });

  it.each([
    'Anyway, it was fine.',
    'Never mind, it is nothing.',
    'I went to the store and bought bread.',
    'He said and, um, then left.',
    "Let's guess the answer together.",
    'The band was called Funny Story.',
  ])('is no bid in %j', (said) => {
    expect(note(said)).toBe('');
  });

  it('adds nothing with the flag off or with crisis guidance', () => {
    expect(note('Guess what.', {})).toBe('');
    expect(note('Guess what.', ON, true)).toBe('');
  });
});

describe('newsNote: good news first', () => {
  it('gives good news its own note, never both', () => {
    expect(note('Guess what, I got the job!', { ...ON, GOOD_NEWS_BIGGER: 'on' })).toBe(
      GOOD_NEWS_NOTE
    );
  });

  it('is empty with both flags off', () => {
    expect(note('Guess what, I got the job!', {})).toBe('');
  });
});
