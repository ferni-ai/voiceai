/**
 * FERNI_PLAYFUL on the opener gate: a bright turn may keep its reaction word
 * ("Oh", "Ha", "Wow"), but never on more than 1 reply in 3 and never the same
 * word twice running. Off, the gate is exactly as before.
 */
import { describe, expect, it } from 'vitest';

import { OPENER_EVERY, OpenerGate, openerWord, PLAYFUL_GAP } from '../opener-gate.js';

const WORDS = ['Oh', 'Ha', 'Wow', 'Ha', 'Oh', 'Wow', 'Oh', 'Wow', 'Ha', 'Wow'];
const reply = (word: string): string => `${word}, that is a great story.`;
const keptTurns = (gate: OpenerGate, words: string[], bright: boolean[]): number[] =>
  words.flatMap((w, i) =>
    gate.decide(reply(w), false, undefined, bright[i]) === reply(w) ? [i + 1] : []
  );

describe('openerWord', () => {
  it('normalises the leading reaction word', () => {
    expect(openerWord('Hahaha! no way')).toBe('ha');
    expect(openerWord('Ohh, really')).toBe('oh');
    expect(openerWord('<emotion value="happy"/>Wow, okay')).toBe('wow');
    expect(openerWord('Well done.')).toBeNull();
  });
});

describe('OpenerGate with FERNI_PLAYFUL', () => {
  const allBright = WORDS.map(() => true);

  it('off: a bright turn changes nothing (one kept every OPENER_EVERY stripped replies)', () => {
    const off = keptTurns(new OpenerGate(OPENER_EVERY, false, false), WORDS, allBright);
    const plain = keptTurns(
      new OpenerGate(OPENER_EVERY, false, false),
      WORDS,
      WORDS.map(() => false)
    );
    expect(off).toEqual(plain);
    expect(off).toEqual([1, 5, 9]);
  });

  it('on: bright turns keep a reaction word on every third reply, the most it allows', () => {
    expect(keptTurns(new OpenerGate(OPENER_EVERY, false, true), WORDS, allBright)).toEqual([
      1, 4, 7, 10,
    ]);
  });

  it('on: over 10 turns, at most 1 in any 3 and never the same word twice running', () => {
    const patterns = [
      allBright,
      WORDS.map((_, i) => i % 2 === 0),
      WORDS.map((_, i) => i % 3 !== 1),
    ];
    for (const words of [
      WORDS,
      WORDS.map(() => 'Oh'),
      ['Oh', 'Oh', 'Ha', 'Ha', 'Oh', 'Wow', 'Wow', 'Ha', 'Oh', 'Oh'],
    ])
      for (const bright of patterns) {
        const gate = new OpenerGate(OPENER_EVERY, false, true);
        const kept = keptTurns(gate, words, bright);
        for (let i = 1; i < kept.length; i++) {
          expect(kept[i] - kept[i - 1]).toBeGreaterThanOrEqual(PLAYFUL_GAP);
          expect(openerWord(words[kept[i] - 1])).not.toBe(openerWord(words[kept[i - 1] - 1]));
        }
        expect(kept.length).toBeLessThanOrEqual(Math.ceil(words.length / PLAYFUL_GAP));
      }
  });

  it('on: the same word is never kept twice running, even when due', () => {
    expect(
      keptTurns(
        new OpenerGate(OPENER_EVERY, false, true),
        WORDS.map(() => 'Oh'),
        allBright
      )
    ).toEqual([1]);
  });

  it('on: a non-bright turn keeps the old spacing, and still the guards', () => {
    const notBright = WORDS.map(() => false);
    // Due at 5 and 10, but each repeats the word kept last ("Oh", "Wow"): held to the next turn or dropped.
    expect(keptTurns(new OpenerGate(OPENER_EVERY, false, true), WORDS, notBright)).toEqual([1, 6]);
  });

  it('on: a stripped word reads as before', () => {
    const gate = new OpenerGate(OPENER_EVERY, false, true);
    expect(gate.decide('Oh, that is a great story.', false, undefined, true)).toBe(
      'Oh, that is a great story.'
    );
    expect(gate.decide('Ha, that is a great story.', false, undefined, true)).toBe(
      'That is a great story.'
    );
  });
});
