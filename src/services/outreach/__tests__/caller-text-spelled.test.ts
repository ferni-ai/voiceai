/**
 * SCREEN_SPELLED_PII (#3346): the caller-text screen also reads a match-only fold of the text,
 * so a number, link or credential word spelled to slip past it is withheld like the written
 * form. The quoted words, the crisis read and crisisCallerLine are never changed by it.
 * All lines are invented; "Casey" is the fictional contact.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  crisisCallerLine,
  crisisRead,
  isRiskyCallerText,
  riskyCallerLine,
  screenCallerParts,
  screenedCallerText,
} from '../caller-text.js';

const NAME = 'Casey';
const CYRILLIC_A = String.fromCharCode(0x430);
const GREEK_O = String.fromCharCode(0x3bf);

/** Shapes the written-text screen misses today, by what slips past it. */
const SPELLED: Array<[string, string]> = [
  ['spelled digits with a comma', 'she said call five five five, zero one four two after six'],
  ['spelled digits in one run', 'her number is five five five zero one four two three'],
  ['digits joined by the word dash', 'reach her at 555 dash 0142 tonight'],
  ['a capital O for zero', 'the line is 555-O142 if you need it'],
  ['a small L for one', 'call 555-0l42 about it'],
  ['oh for zero among spelled digits', 'it is five five five oh one four two'],
  ['a code to pass on', 'send me the code she gets on her phone'],
  ['a link said aloud', 'go to example dot com for the form'],
  ['a link with a path said aloud', 'it is at example dot com slash help'],
  ['a Cyrillic letter in a credential word', `her p${CYRILLIC_A}ssword is the dog's name`],
  ['a Greek letter in a credential word', `the l${GREEK_O}gin is on the fridge`],
];

/** Ordinary lines that pass today and must keep passing with the fold on. */
const ORDINARY = [
  'I have two kids and a dog',
  'call me at five',
  'we met at seven thirty, then again at nine',
  'she is ninety one this year',
  'tell her the dress code is casual',
  'what is the zip code there',
  'oh one more thing, she turns 45 on Friday',
  'room 2O1 is on the left',
  'it cost five dollars at the fair', // a sum in words, as the written screen reads it today
  'Ivan said Москва was cold', // a whole Cyrillic word stays as is
  'one two three, she counted the steps',
];

/** Digits of other scripts were already caught (NFKC, \p{Nd}): pinned, not changed. */
const ALREADY_CAUGHT = [
  'call ٥٥٥٠١٤٢', // Arabic-Indic
  'call ５５５０１４２', // full-width
];

const setFlag = (value: 'on' | 'off'): void => {
  process.env.SCREEN_SPELLED_PII = value;
};

afterEach(() => {
  delete process.env.SCREEN_SPELLED_PII;
});

describe('SCREEN_SPELLED_PII off', () => {
  it.each(SPELLED)('%s: passes the screen exactly as today', (_shape, line) => {
    setFlag('off');
    expect(isRiskyCallerText(line, NAME)).toBe(false);
    expect(screenedCallerText(line, NAME)).toBe(line);
  });

  it('is the default', () => {
    for (const [, line] of SPELLED) expect(isRiskyCallerText(line, NAME)).toBe(false);
  });
});

describe('SCREEN_SPELLED_PII on', () => {
  it.each(SPELLED)('%s: withheld behind the fixed line', (_shape, line) => {
    setFlag('on');
    expect(isRiskyCallerText(line, NAME)).toBe(true);
    expect(screenedCallerText(line, NAME)).toBe(riskyCallerLine(NAME));
  });

  it.each(ORDINARY)('an ordinary line stays quoted word for word: %s', (line) => {
    setFlag('off');
    const off = screenCallerParts(line, NAME);
    setFlag('on');
    expect(isRiskyCallerText(line, NAME)).toBe(false);
    expect(screenCallerParts(line, NAME)).toEqual(off);
    expect(off).toEqual({ said: line, risky: false, safety: false });
  });

  it.each(ALREADY_CAUGHT)('a digit run in another script is still caught: %s', (line) => {
    for (const value of ['off', 'on'] as const) {
      setFlag(value);
      expect(isRiskyCallerText(line, NAME)).toBe(true);
    }
  });

  it('still spares the known name, and reads around it', () => {
    setFlag('on');
    expect(isRiskyCallerText('Casey says hi', NAME)).toBe(false);
    expect(isRiskyCallerText('Casey said five five five zero one four two', NAME)).toBe(true);
  });

  it('withholds a run that a joined field forms, as the written screen does', () => {
    setFlag('on');
    const parts = screenCallerParts('her number is five five five zero one four two', NAME);
    expect(parts).toEqual({ said: '', risky: true, safety: false });
  });

  it('reads 20k characters of unpunctuated text in under 50 ms, whatever its shape', () => {
    setFlag('on');
    const shapes = [
      'five '.repeat(4_000),
      '5'.repeat(20_000),
      'a'.repeat(20_000),
      'word dot '.repeat(2_223),
      'send me the '.repeat(1_667),
      'O1'.repeat(10_000),
      `p${CYRILLIC_A}ss `.repeat(4_000),
      'five dash '.repeat(2_000),
    ];
    for (const text of shapes) {
      expect(text.length).toBeGreaterThanOrEqual(20_000);
      const start = performance.now();
      isRiskyCallerText(text, NAME);
      expect(performance.now() - start, text.slice(0, 12)).toBeLessThan(50);
    }
  });
});

describe('SCREEN_SPELLED_PII never lowers a crisis line', () => {
  const CRISIS = 'I want to kill myself, call me at five five five zero one four two';

  it('SCREEN_SPELLED_PII off then on: a crisis line with a spelled number keeps crisisCallerLine', () => {
    setFlag('off');
    const off = screenedCallerText(CRISIS, NAME);
    setFlag('on');
    const on = screenedCallerText(CRISIS, NAME);
    expect(crisisRead(CRISIS)).toBe(true);
    // Off: their words carry the crisis. On: the number withholds the words, and Ferni's
    // crisis line carries it instead, ahead of the risky line.
    expect(off).toBe(CRISIS);
    expect(on).toBe(`${crisisCallerLine(NAME)} ${riskyCallerLine(NAME)}`);
    expect(screenCallerParts(CRISIS, NAME).safety).toBe(true);
  });
});
