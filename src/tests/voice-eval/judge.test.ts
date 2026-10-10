import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import { combine, DIMENSIONS, meanCi, pool, promptFor } from '../../../scripts/voice-eval/judge.mjs';

const run = (events: Array<[string, string]>) => ({
  userSpeech: [[1000, 2000]],
  events: [
    { t: 50, who: 'agent', text: 'Hey Sam.' },
    ...events.map(([who, text], i) => ({ t: 1000 + i * 100, who, text })),
  ],
});

describe('voice-eval judge', () => {
  it('gives a mean with a 95% interval, and none for a single value', () => {
    expect(meanCi([3, 4, 5])).toEqual({ mean: 4, lo: 2.87, hi: 5.13, n: 3 });
    expect(meanCi([4])).toEqual({ mean: 4, lo: null, hi: null, n: 1 });
    expect(meanCi([])).toEqual({ mean: null, lo: null, hi: null, n: 0 });
  });

  it('averages judge samples and skips null (not applicable) scores', () => {
    const v = combine([
      { scores: { recall: null, empathy: 4 }, humanLikelihood: 0.8, inventedHistory: ['a'] },
      { scores: { recall: null, empathy: 3 }, humanLikelihood: 0.6, inventedHistory: ['a', 'b'] },
    ]);
    expect(v.scores.recall).toBeNull();
    expect(v.scores.empathy).toBe(3.5);
    expect(v.humanLikelihood).toBe(0.7);
    expect(v.inventedHistory).toEqual(['a', 'b']);
  });

  it('pools calls per dimension', () => {
    const p = pool([
      { scores: { empathy: 3 }, humanLikelihood: 0.5 },
      { scores: { empathy: 5 }, humanLikelihood: 0.9 },
    ]);
    expect(p.empathy.mean).toBe(4);
    expect(p.recall.n).toBe(0);
    expect(p.humanLikelihood.mean).toBe(0.7);
  });

  it('shows every dimension, the transcript, and the earlier call when there is one', () => {
    const call = run([
      ['user', 'Guess how Monday went?'],
      ['agent', 'The Stripe interview?'],
    ]);
    const seed = run([
      ['user', 'I have an interview at Stripe on Monday.'],
      ['agent', 'Oh, nice.'],
    ]);
    const withSeed = promptFor(call, seed);
    for (const k of Object.keys(DIMENSIONS)) expect(withSeed).toContain(`- ${k}:`);
    expect(withSeed).toContain('2. FERNI: The Stripe interview?');
    expect(withSeed).toContain('CALLER: I have an interview at Stripe on Monday.');
    expect(promptFor(call, null)).toContain('There was no earlier call');
  });
});
