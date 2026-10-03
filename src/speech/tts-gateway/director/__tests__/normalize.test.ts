import { describe, expect, it } from 'vitest';

import { normalizeForSpeech } from '../normalize.js';
import { decimalToWords, integerToWords, ordinalToWords, yearToWords } from '../spoken-numbers.js';

const say = (text: string): string => normalizeForSpeech(text).text;

describe('spoken numbers', () => {
  it('reads integers', () => {
    expect(integerToWords(0)).toBe('zero');
    expect(integerToWords(13)).toBe('thirteen');
    expect(integerToWords(42)).toBe('forty-two');
    expect(integerToWords(105)).toBe('one hundred five');
    expect(integerToWords(4200)).toBe('four thousand two hundred');
    expect(integerToWords(1_000_001)).toBe('one million one');
    expect(integerToWords(2_500_000_000)).toBe('two billion five hundred million');
  });

  it('reads decimals digit by digit after the point', () => {
    expect(decimalToWords('3.5')).toBe('three point five');
    expect(decimalToWords('0.05')).toBe('zero point zero five');
  });

  it('reads ordinals', () => {
    expect(ordinalToWords(1)).toBe('first');
    expect(ordinalToWords(3)).toBe('third');
    expect(ordinalToWords(12)).toBe('twelfth');
    expect(ordinalToWords(22)).toBe('twenty-second');
    expect(ordinalToWords(30)).toBe('thirtieth');
    expect(ordinalToWords(101)).toBe('one hundred first');
  });

  it('reads years the way people say them', () => {
    expect(yearToWords(2026)).toBe('twenty twenty-six');
    expect(yearToWords(1999)).toBe('nineteen ninety-nine');
    expect(yearToWords(2005)).toBe('two thousand five');
    expect(yearToWords(2000)).toBe('two thousand');
    expect(yearToWords(1900)).toBe('nineteen hundred');
  });
});

describe('normalizeForSpeech', () => {
  it('speaks currency, including cents and scale words', () => {
    expect(say('The bill was $4,200.')).toBe('The bill was four thousand two hundred dollars.');
    expect(say('It costs $4.50 now')).toBe('It costs four dollars and fifty cents now');
    expect(say('just $1 today')).toBe('just one dollar today');
    expect(say('only $0.99')).toBe('only ninety-nine cents');
    expect(say('raised $1.5M')).toBe('raised one point five million dollars');
    expect(say('a $20k raise')).toBe('a twenty thousand dollars raise');
    expect(say('about $3 billion')).toBe('about three billion dollars');
  });

  it('speaks percentages', () => {
    expect(say('up 15% this year')).toBe('up fifteen percent this year');
    expect(say('a 2.5 % fee')).toBe('a two point five percent fee');
  });

  it('speaks clock times and keeps a sentence-final period', () => {
    expect(say('Call at 3:30 p.m. if you can.')).toBe('Call at three thirty PM if you can.');
    expect(say('See you at 7pm.')).toBe('See you at seven PM.');
    expect(say('Meet at 9:05 am. Bring water.')).toBe('Meet at nine oh five AM. Bring water.');
    expect(say('at 10:00')).toBe("at ten o'clock");
    expect(say('Lunch is at 12:15')).toBe('Lunch is at twelve fifteen');
  });

  it('speaks dates', () => {
    expect(say('due on 10/3, so soon')).toBe('due on October third, so soon');
    expect(say('born 7/4/1999')).toBe('born July fourth, nineteen ninety-nine');
    expect(say('Oct. 3 works')).toBe('October third works');
    expect(say('October 3rd, 2026 it is')).toBe('October third, twenty twenty-six it is');
    expect(say('since March 2020')).toBe('since March twenty twenty');
  });

  it('leaves a bare fraction alone when nothing says it is a date', () => {
    expect(say('add 3/4 cup of flour')).toBe('add 3/4 cup of flour');
  });

  it('speaks ordinals, years and grouped or long numbers', () => {
    expect(say('your 22nd birthday')).toBe('your twenty-second birthday');
    expect(say('back in 1998 we met')).toBe('back in nineteen ninety-eight we met');
    expect(say('about 12,500 steps')).toBe('about twelve thousand five hundred steps');
    expect(say('a 3.5 rating')).toBe('a three point five rating');
    expect(say('1500 people')).toBe('one thousand five hundred people');
  });

  it('leaves small whole numbers for the voice to read', () => {
    expect(say('I have 3 ideas and 12 minutes')).toBe('I have 3 ideas and 12 minutes');
  });

  it('reads phone numbers digit by digit in groups', () => {
    expect(say('call 555-123-4567 now')).toBe(
      'call five five five, one two three, four five six seven now'
    );
  });

  it('expands abbreviations without leaving a stray period', () => {
    expect(say('Mrs. Johnson and Dr. Patel')).toBe('Missus Johnson and Doctor Patel');
    expect(say('apples vs. oranges')).toBe('apples versus oranges');
    expect(say('fruit, e.g. apples')).toBe('fruit, for example apples');
    expect(say('the goal, i.e. sleep')).toBe('the goal, that is sleep');
    expect(say('approx. ten')).toBe('approximately ten');
    expect(say('bread, milk, etc. Then home.')).toBe('bread, milk, et cetera. Then home.');
    expect(say('bread, milk, etc.')).toBe('bread, milk, et cetera.');
    expect(say('FYI it moved')).toBe('F Y I it moved');
  });

  it('never rewrites inside bracket or angle markup', () => {
    expect(say('[laughter] that was 2000 years ago')).toBe(
      '[laughter] that was two thousand years ago'
    );
    expect(say('<speed ratio="0.95"/>hi')).toBe('<speed ratio="0.95"/>hi');
  });

  it('counts what it changed and leaves plain text alone', () => {
    expect(normalizeForSpeech('Nothing to change here.')).toEqual({
      text: 'Nothing to change here.',
      count: 0,
    });
    expect(normalizeForSpeech('$5 at 3pm').count).toBe(2);
  });
});
