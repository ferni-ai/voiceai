import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import { momentsOf } from '../../../scripts/voice-eval/next-turn/corpus.mjs';
// @ts-expect-error -- plain .mjs script, no types
import { firstOrder, viewOf } from '../../../scripts/voice-eval/next-turn/judge.mjs';
// @ts-expect-error -- plain .mjs script, no types
import { kappa, signTest, winRate } from '../../../scripts/voice-eval/next-turn/report.mjs';

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

describe('next-turn-vs-human judging', () => {
  it('shows both arms to a judge the same way: lowercase, no punctuation or tags, names neutralised', () => {
    const [m] = momentsOf('T', CHA, { minContext: 4, gap: 1 });
    const v = viewOf(m, '<emotion value="sad"/> Ugh, Sam! Ferni here says: get a heater [laughs].');
    expect(v.ferni).toBe('ugh sam jo here says get a heater');
    expect(v.human).toBe('ugh sam you should just buy a space heater and send him the bill');
    expect(v.context).toMatch(/^sam: so i finally called the landlord/);
    expect(v.context).toContain('jo: mhm');
    expect(v.context).not.toMatch(/anna|bob|[.,?!]/);
  });

  it('shows each moment first in a fixed order, so both judges see the same presentation', () => {
    expect(firstOrder('SBC001-5')).toEqual(firstOrder('SBC001-5'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => firstOrder(id)[0])).size).toBe(2);
  });
});

describe('next-turn-vs-human statistics', () => {
  it('sign test matches the exact binomial', () => {
    expect(signTest(5, 5)).toBe(1);
    expect(signTest(9, 1)).toBeCloseTo(0.02148, 4); // 2 * 11/1024
    expect(signTest(0, 6)).toBeCloseTo(0.03125, 5);
  });

  it("Cohen's kappa: 1 for agreement, 0 for chance-level, negative for systematic disagreement", () => {
    expect(kappa(['f', 'h', 'f', 'h'], ['f', 'h', 'f', 'h'])).toBe(1);
    expect(kappa(['f', 'f', 'h', 'h'], ['f', 'h', 'f', 'h'])).toBe(0);
    expect(kappa(['f', 'h'], ['h', 'f'])).toBeLessThan(0);
  });

  it('win rate counts a split verdict as a tie and gives a CI that straddles 50% for a coin flip', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ score: i % 2, file: `c${i % 12}` }));
    rows.push({ score: 0.5, file: 'c0' });
    const r = winRate(rows);
    expect([r.wins, r.losses, r.ties]).toEqual([20, 20, 1]);
    expect(r.lo).toBeLessThan(0.5);
    expect(r.hi).toBeGreaterThan(0.5);
    expect(winRate(rows.map((x) => ({ ...x, score: 1 }))).lo).toBe(1);
  });
});
