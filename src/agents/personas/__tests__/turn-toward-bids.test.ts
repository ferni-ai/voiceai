import { describe, expect, it } from 'vitest';
import { GOOD_NEWS_NOTE } from '../good-news-bigger.js';
import { SIDE_ROAD_NOTE, TEASER_NOTE, bidIn, bidNote, newsNote } from '../turn-toward-bids.js';

const ON = { BIDS_TURN_TOWARD: 'on' };

describe('bidIn', () => {
  it.each([
    ['Guess what happened at the bakery.', 'teaser'],
    ["You won't believe who I ran into.", 'teaser'],
    ['Okay, funny story.', 'teaser'],
    ['Oh, and my cousin Priya is visiting.', 'side_road'],
    ['Yeah. That reminds me, I never fixed the gate.', 'side_road'],
    ['Random, but have you ever had quince?', 'side_road'],
  ])('reads %j as a %s', (said, bid) => {
    expect(bidIn(said)).toBe(bid);
  });

  it.each([
    'Anyway, it was fine.',
    'Never mind, it is nothing.',
    'I went to the store and bought bread.',
    'He said and, um, then left.',
    "Let's guess the answer together.",
    'The band was called Funny Story.',
  ])('is no bid in %j', (said) => {
    expect(bidIn(said)).toBeUndefined();
  });
});

describe('bidNote', () => {
  it('asks him to bite on a teaser and to follow a side road', () => {
    expect(bidNote('Guess what.', { crisis: false }, ON)).toBe(TEASER_NOTE);
    expect(bidNote('Oh, and the dog learned a trick.', { crisis: false }, ON)).toBe(SIDE_ROAD_NOTE);
  });

  it('adds nothing with the flag off, in a crisis, or on an ordinary turn', () => {
    expect(bidNote('Guess what.', { crisis: false }, {})).toBe('');
    expect(bidNote('Guess what.', { crisis: true }, ON)).toBe('');
    expect(bidNote('I went for a walk.', { crisis: false }, ON)).toBe('');
  });
});

describe('newsNote', () => {
  it('gives good news its own note, never both', () => {
    const env = { ...ON, GOOD_NEWS_BIGGER: 'on' };
    const said = 'Guess what, I got the job!';
    expect(newsNote(said, ['Hi.', said], { crisis: false }, env)).toBe(GOOD_NEWS_NOTE);
  });

  it('falls back to the bid note when there is no good news', () => {
    const said = 'Guess what.';
    expect(newsNote(said, ['Hi.', said], { crisis: false }, ON)).toBe(TEASER_NOTE);
  });

  it('is empty with both flags off', () => {
    const said = 'Guess what, I got the job!';
    expect(newsNote(said, [said], { crisis: false }, {})).toBe('');
  });
});
