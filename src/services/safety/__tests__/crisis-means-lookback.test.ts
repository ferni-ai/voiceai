/**
 * #3564 r3: the softening check reads the clause and the sentence before each means match. They
 * are now found once per turn (crisis-means-lookback.ts) instead of by slicing and splitting the
 * whole text before every match. The oracle below is the old per-match code, kept here only, and
 * the new lookup must give exactly what it gave, at every index of every generated line.
 */
import { describe, expect, it } from 'vitest';

import { meansLookback } from '../crisis-means-lookback.js';

/** The old code from meansSoftened (ebdfd69ad), test-only. */
const oracle = (text: string, start: number) => ({
  clause:
    text
      .slice(0, start)
      .split(/[.!?;,]|\bbut\b|\band\b|\bso\b/)
      .pop() ?? '',
  sentence: text.slice(0, start).split(/[.!?]/).pop() ?? '',
});

/** A small seeded generator (mulberry32), so the corpus is the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fictional fragments: ending words, means sentences, softeners, and words that hold a break word
// inside them ("butter", "sofa", "android", "abut") so the word edges are exercised.
const ENDINGS = [
  'i want to die',
  "i'm going to kill myself",
  'this is goodbye',
  "i can't handle this heat",
  'nobody would miss me',
  'i would never kill myself',
  'ugh i want to die, this exam',
];
const MEANS = [
  'i have the pills',
  'got the rope',
  "i've got the gun",
  'i have my meds',
  'the pills are in my hand',
  "i don't have the gun",
  'i have the pills for my headache',
  'i have the knife right here',
];
const SOFTENERS = [
  'he texted me "',
  'she said "',
  'in the movie ',
  'what if ',
  'i asked if ',
  'i dreamed ',
  'and ',
  'but ',
  'so ',
  'butter ',
  'sofa ',
  'android ',
  'abut ',
  '',
];
const SEPS = [
  '. ',
  '! ',
  '? ',
  ', ',
  '; ',
  ' and ',
  ' but ',
  ' so ',
  '.\t',
  '.\n',
  ' ',
  '." ',
  'but',
  'and',
  'so',
  '',
];

function corpus(size: number): string[] {
  const rnd = seeded(3564);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
  const lines = new Set<string>(['', 'but', 'so', 'and', 'butter', '.so', 'so.', 'a,b;c']);
  while (lines.size < size) {
    let line = pick(SOFTENERS);
    const parts = 1 + Math.floor(rnd() * 4);
    for (let at = 0; at < parts; at++) {
      line += rnd() < 0.5 ? pick(ENDINGS) : pick(MEANS);
      line += pick(SEPS) + (rnd() < 0.3 ? pick(SOFTENERS) : '');
    }
    lines.add(line);
  }
  return [...lines];
}

describe('the means lookback, found once per turn', () => {
  it('gives the old clause and sentence at every index of 5,000+ generated lines', () => {
    const lines = corpus(5200);
    expect(lines.length).toBeGreaterThanOrEqual(5000);
    let checked = 0;
    const differ: string[] = [];
    for (const text of lines) {
      const before = meansLookback(text);
      for (let start = 0; start <= text.length; start++) {
        checked++;
        const got = before(start);
        const want = oracle(text, start);
        if (got.clause !== want.clause || got.sentence !== want.sentence) {
          differ.push(`${JSON.stringify(text)} @${start}`);
        }
      }
    }
    expect(differ.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(200_000);
  });

  it.each([
    ['i want to die. i have the pills.', 13, 'i want to die', 'i want to die'],
    [
      'he texted me "i want to die. i have the pills."',
      27,
      'he texted me "i want to die',
      'he texted me "i want to die',
    ],
    ['butter so i have the pills', 10, ' ', 'butter so '],
    ['abut i have the gun', 5, 'abut ', 'abut '],
    ['i want it but', 13, '', 'i want it but'],
    ['butter', 3, '', 'but'],
  ])('%s @%d', (text, start, clause, sentence) => {
    expect(oracle(text, start)).toEqual({ clause, sentence });
    expect(meansLookback(text)(start)).toEqual({ clause, sentence });
  });
});
