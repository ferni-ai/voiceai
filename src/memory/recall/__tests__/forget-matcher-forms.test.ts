/**
 * FORGET_EVERY_READER and the forms a forgotten topic takes in text (#2662):
 * a hyphenated compound ("divorce-papers", "a Biscuit-shaped cake") hides on
 * either part, the Turkish dotless and dotted i fold alike, and nothing else
 * starts matching ("unknown" is not "known", "marked" is not Mark). Flag
 * off: the matcher recall has always used, unchanged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aboutForgotten } from '../forget-every-reader.js';
import { isForgotten, storedTopic } from '../session-recall.js';

const topic = (t: string) => [storedTopic(t)];
const NAMES = new Set(['biscuit', 'mark']);

afterEach(() => vi.unstubAllEnvs());

describe('a forgotten topic in its other forms (FORGET_EVERY_READER)', () => {
  it('on: "divorce-papers" is the topic "divorce papers"', () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(isForgotten('She filed the divorce-papers today', topic('divorce papers'))).toBe(true);
  });

  it('on: "a Biscuit-shaped cake" is about Biscuit, a known name', () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(aboutForgotten('a Biscuit-shaped cake', topic('Biscuit'), NAMES)).toBe(true);
  });

  it('on: a known name still matches its plural', () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(aboutForgotten('we fed the Biscuits', topic('Biscuit'), NAMES)).toBe(true);
  });

  it('on: a hyphenated compound hides on either part (an accepted over-hide)', () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(isForgotten('a well-known story', topic('known'))).toBe(true);
  });

  it.each([
    ['an unknown caller', 'known', new Set<string>()],
    ['he marked the date', 'Mark', NAMES],
    ['a biscuitshaped cake', 'Biscuit', NAMES],
  ])('on: "%s" is not about "%s"', (text, t, names) => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(aboutForgotten(text, topic(t), names)).toBe(false);
  });

  it.each([
    ['IŞIK geldi', 'ışık'],
    ['ışık geldi', 'IŞIK'],
    ['Irmak aradı', 'ırmak'],
  ])('on: Turkish i folds alike: "%s" is about "%s"', (text, t) => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(isForgotten(text, topic(t))).toBe(true);
  });

  it('off: the matcher recall has always used', () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    expect(isForgotten('She filed the divorce-papers today', topic('divorce papers'))).toBe(false);
    expect(isForgotten('IŞIK geldi', topic('ışık'))).toBe(false);
  });
});
