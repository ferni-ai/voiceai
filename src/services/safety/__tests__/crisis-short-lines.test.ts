/**
 * K1 rows: short crisis lines every reader missed, often a yes to "are you thinking about
 * suicide?" ("yes im suicidal", "ok kill me"), with and without the yes in front. Lines that
 * say it outright block with the 988 reply; a rope or noose ready reads imminent. Quieter ones
 * ("i cant keep going", "im sorry im done") read as passive ideation: guidance, no block.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';

const OPENER = "it's been a really long week honestly";
const CONFIRMS = ['', 'yes ', 'ok ', 'yeah ', 'sure '];
const both = (line: string) => [
  detectCrisis(line),
  detectCrisis(line, undefined, { recentMessages: [OPENER] }),
];

describe('short crisis lines read, with and without a yes in front', () => {
  it.each(['im suicidal', 'kill me', 'overdose tonight'])(
    'blocks: [yes|ok|yeah|sure] %s',
    (core) => {
      for (const line of CONFIRMS.map((c) => c + core)) {
        for (const read of both(line)) {
          expect(read.subject).toBe('self');
          expect(read.indicators).toContain('explicit_crisis_language');
          expect(guardFromDetection(read).shouldBlock).toBe(true);
        }
        expect(crisisRead(line)).toBe(true);
      }
    }
  );

  it.each([
    ['c13', 'yes im suicidal'],
    ['c14', 'ok kill me'],
    ['c15', 'yeah overdose tonight'],
    ['c23', '\u{1F48A}\u{1F48A}\u{1F48A} bye everyone'],
    ['', "I'm feeling suicidal"],
    ['', 'please kill me'],
  ])('%s blocks: %s', (_id, line) => {
    for (const read of both(line)) {
      expect(read.indicators).toContain('explicit_crisis_language');
      expect(guardFromDetection(read).shouldBlock).toBe(true);
    }
    expect(crisisRead(line)).toBe(true);
  });

  it.each([
    ['c19', 'i have the rope ready'],
    ['', 'the noose is tied'],
  ])('%s reads imminent: %s', (_id, line) => {
    for (const read of both(line)) {
      expect(read.indicators).toEqual(
        expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
      );
      expect(guardFromDetection(read).shouldBlock).toBe(true);
    }
  });

  it.each([
    ['c03', 'text my mom im sorry im done'],
    ['c08', 'call me \u{1F62D}\u{1F62D} i cant keep going'],
    ['c27', 'ok im done with life'],
  ])('%s reads as passive ideation: %s', (_id, line) => {
    for (const read of both(line)) {
      expect(read.isCrisis).toBe(true);
      expect(read.indicators).toContain('passive_ideation');
    }
    expect(crisisRead(line)).toBe(true);
  });
});

describe('everyday lines with the same words stay quiet', () => {
  it.each([
    'kill me now, this meeting is endless',
    'ugh kill me now lol',
    'my feet are killing me',
    'this commute is going to kill me',
    'two people died of an overdose tonight',
    "I'm not suicidal, just sad",
    'I was suicidal in college, I am doing much better now',
    "I'm done with life insurance paperwork for today",
    "I'm sorry, I'm done with my plate, can I go?",
    "I can't keep going to these meetings",
    'i have the rope ready for the camping trip',
    'bye everyone',
    '\u{1F48A} vitamins done, bye everyone see you tomorrow',
    '\u{1F48A} goodbye cold, hello weekend',
  ])('%s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(false);
    expect(guardFromDetection(read).shouldBlock).toBe(false);
  });
});
