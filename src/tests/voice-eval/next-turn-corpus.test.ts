import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import * as corpus from '../../../scripts/voice-eval/next-turn/corpus.mjs';

// A made-up CHAT file (no corpus text): two friends, CHAT markup included.
const B = '\x15';
const CHA = [
  '@Participants:\tANNA ANNA Speaker, BOB BOB Speaker, ENV ENV Environment',
  `*ANNA:\t(..) So I finally ⌈ called ⌉ the landlord about the heat ${B}0_10${B}`,
  `\tand he said it's fi:xed &=laugh . ${B}10_20${B}`,
  `*BOB:\t⌊ mhm ⌋ . ${B}20_30${B}`,
  `*ANNA:\tbut it's still freezing in the bedroom every single night Bob . ${B}30_40${B}`,
  `*BOB:\t&=in Really ? ${B}40_50${B}`,
  `*ENV:\t&=door . ${B}50_60${B}`,
  `*ANNA:\tYeah and he won't come out until next week at the earliest he said . ${B}60_70${B}`,
  `*BOB:\tUgh Anna you should just bu:y a space heat⌈er ⌉ and send him the bill +... ${B}70_80${B}`,
].join('\n');

describe('next-turn-vs-human corpus handling', () => {
  it('strips CHAT markup but keeps the words, joining a word split by an overlap mark', () => {
    expect(corpus.cleanLine(`(..) So ⌈ called ⌉ it's fi:xed &=laugh . ${B}0_10${B}`)).toBe(
      "So called it's fixed."
    );
    expect(corpus.cleanLine('a space heat⌈er ⌉ +...')).toBe('a space heater');
    // Pitch marks inside words gave the human arm away to a judge.
    expect(corpus.cleanLine('it was not cle3ar in3teresting')).toBe('it was not clear interesting');
    expect(corpus.unclear('I said X X .')).toBe(true);
    expect(corpus.unclear('Xavier said')).toBe(false);
  });

  it('turns a CHAT file into merged speaker turns, without the environment tier or wordless lines', () => {
    const { people, turns } = corpus.turnsOf(CHA);
    expect(people).toEqual({ ANNA: 'Anna', BOB: 'Bob' });
    expect(turns.map((t: { who: string }) => t.who)).toEqual([
      'ANNA',
      'BOB',
      'ANNA',
      'BOB',
      'ANNA',
      'BOB',
    ]);
    expect(turns[0].text).toBe(
      "So I finally called the landlord about the heat and he said it's fixed."
    );
  });

  it('takes the reply after a substantive turn as a moment, with the friend and caller named', () => {
    const [m] = corpus.momentsOf('T', CHA, { minContext: 4, gap: 1 });
    expect(m.human).toBe('Ugh Anna you should just buy a space heater and send him the bill');
    expect(m.names).toEqual({ friend: 'Bob', caller: 'Anna' });
    expect(m.context.at(-1)).toEqual({ who: 'caller', text: expect.stringContaining('next week') });
  });

  it('normalises any line the same way and swaps in neutral names', () => {
    const line = '<emotion value="sad"/> Ugh, Anna! Get a heater [laughs]. Bob’s *sighs* right.';
    expect(corpus.normalise(corpus.neutralise(line, { friend: 'Bob', caller: 'Anna' }))).toBe(
      "ugh sam get a heater ferni's right"
    );
  });

  it('stratified sampling spreads over types and caps any one conversation', () => {
    const ms = Array.from({ length: 60 }, (_, i) => ({
      id: `${i}`,
      file: `f${i % 3}`,
      type: i < 50 ? 'casual' : 'venting',
    }));
    const got = corpus.stratified(ms, 12, { perFile: 4 });
    expect(got.filter((m: { type: string }) => m.type === 'venting').length).toBe(6);
    const perFile = ['f0', 'f1', 'f2'].map((f) =>
      got.filter((m: { file: string }) => m.file === f)
    );
    expect(Math.max(...perFile.map((g) => g.length))).toBe(4);
  });
});
