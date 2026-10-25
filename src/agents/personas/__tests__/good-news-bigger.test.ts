/**
 * GOOD_NEWS_BIGGER's detector (callerGoodNews, emotion-lift.ts) and note.
 * Conservative by design: a missed win costs a flat reply, a false one
 * celebrates over something hard.
 */
import { describe, expect, it } from 'vitest';

import { callerGoodNews } from '../../../speech/tts-gateway/director/emotion-lift.js';
import { GOOD_NEWS_NOTE, goodNewsNote } from '../good-news-bigger.js';

const ON = { GOOD_NEWS_BIGGER: 'on' };

describe('callerGoodNews', () => {
  it.each([
    'I got the job!',
    'Guess what, I passed the bar!',
    'We got engaged last night.',
    'I landed the client I was chasing.',
    'I finally finished my thesis.',
    'We bought a house!',
    'My daughter graduated today.',
    'My friend got the job!',
    'My son made the team.',
    'Good news, I got a raise.',
    'We won the tournament!',
  ])('%s is good news', (said) => expect(callerGoodNews(said)).toBe(true));

  it.each([
    // mixed or heavy
    'I got promoted but my mom is sick.',
    'I got the job, though honestly I am dreading it.',
    'I passed my exam and then my dad went to the hospital.',
    'Good news is the surgery is over, I guess.',
    // sarcasm and irony
    'Oh great, I got the job, yeah right.',
    'lol great, I got promoted.',
    'As if I got the job.',
    // not news yet
    'I hope I got the job.',
    'If I pass the exam I will celebrate.',
    'Not sure whether I got in.',
    // not a win
    'I got in the car and drove home.',
    'I got in trouble at work.',
    'Just made some tea.',
    '',
  ])('%s is not good news', (said) => expect(callerGoodNews(said)).toBe(false));

  it('good news after a hard turn earlier in the call is not lifted', () => {
    expect(callerGoodNews('I got the job!', ['My grandma passed away last week.'])).toBe(false);
  });

  it('a hard turn more than two turns back no longer blocks it', () => {
    const earlier = ['My week was awful.', 'Anyway.', 'Work was fine.'];
    expect(callerGoodNews('I got the job!', earlier)).toBe(true);
  });
});

describe('goodNewsNote', () => {
  it('on: the note for good news, with the current turn last', () => {
    expect(goodNewsNote('I got the job!', ['Hi.', 'I got the job!'], { crisis: false }, ON)).toBe(
      GOOD_NEWS_NOTE
    );
  });

  it('off: nothing', () => {
    expect(goodNewsNote('I got the job!', ['I got the job!'], { crisis: false }, {})).toBe('');
  });

  it('crisis: nothing, even on good news', () => {
    expect(goodNewsNote('I got the job!', ['I got the job!'], { crisis: true }, ON)).toBe('');
  });

  it('the note asks for one question about the moment, no advice and no pivot', () => {
    expect(GOOD_NEWS_NOTE).toMatch(/one question about the moment/);
    expect(GOOD_NEWS_NOTE).toMatch(/No advice, nothing about you/);
    expect(GOOD_NEWS_NOTE).not.toMatch(/[—…]/); // voice text rules: no em dash, no ellipsis
  });
});
