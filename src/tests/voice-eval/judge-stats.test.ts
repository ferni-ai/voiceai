import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import * as s from '../../../scripts/voice-eval/judge-stats.mjs';

const range = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('voice-eval judge statistics', () => {
  it('matches Student t tables', () => {
    expect(s.tQuantile(0.975, 1)).toBeCloseTo(12.7062, 3);
    expect(s.tQuantile(0.975, 2)).toBeCloseTo(4.3027, 3);
    expect(s.tQuantile(0.975, 4)).toBeCloseTo(2.7764, 3);
    expect(s.tQuantile(0.975, 14)).toBeCloseTo(2.1448, 3);
    expect(s.tQuantile(0.995, 9)).toBeCloseTo(3.2498, 3);
    expect(s.tCdf(0, 7)).toBeCloseTo(0.5, 10);
    expect(s.tCdf(-2.1448, 14)).toBeCloseTo(0.025, 4);
    expect(s.tPValue(2.7764, 4)).toBeCloseTo(0.05, 4);
  });

  it('resamples whole scenarios, so one big scenario cannot fake a tight interval', () => {
    // Nine scenarios of two calls at 3, one scenario of twenty calls at 5.
    const values = [...range(18, 3), ...range(20, 5)];
    const clusters = [...Array.from({ length: 18 }, (_, i) => `s${i >> 1}`), ...range(20, 'big')];
    const est = s.estimate(values, clusters, { seed: 7 });
    expect(est.method).toBe('cluster-bootstrap');
    expect(est.G).toBe(10);
    expect(est.mean).toBeCloseTo(154 / 38, 10);
    const [lo, hi] = s.intervalAt(est, 0.05);
    // The big scenario is left out of ~35% of resamples (0.9^10), so the lower
    // bound is all-3s. Resampling calls one by one would put it near 3.7.
    expect(lo).toBe(3);
    expect(hi).toBeGreaterThan(4.3);
    expect(hi).toBeLessThanOrEqual(5);
    expect(s.pValue(est, 3)).toBeGreaterThan(0.05);
  });

  it('gives a two-sided bootstrap p-value, floored at 2/(B+1)', () => {
    const v = [3.5, 4, 4.5, 3.8, 4.2, 4.1, 3.9, 4.4, 3.6, 4];
    const est = s.estimate(
      v,
      v.map((_, i) => `s${i}`),
      { B: 999, seed: 5 }
    );
    expect(est.draws).toHaveLength(999);
    expect(s.pValue(est, 1)).toBeCloseTo(2 / 1000, 10); // baseline below every draw
    expect(s.pValue(est, 10)).toBeCloseTo(2 / 1000, 10); // and above every draw
    expect(s.pValue(est, est.mean)).toBeGreaterThan(0.5);
  });

  it('is reproducible for a seed', () => {
    const v = [1, 2, 3, 4, 5, 2, 3, 4, 5, 1, 2, 3];
    const c = v.map((_, i) => `s${i}`);
    expect(s.clusterBootstrap(v, c, { seed: 3, B: 200 })).toEqual(
      s.clusterBootstrap(v, c, { seed: 3, B: 200 })
    );
  });

  it('uses t over scenario means when there are too few scenarios to bootstrap', () => {
    // Scenario means 2, 3, 4 regardless of how many calls each has.
    const est = s.estimate([2, 2, 2, 2, 3, 4], ['a', 'a', 'a', 'a', 'b', 'c']);
    expect(est.method).toBe('cluster-t');
    expect(est.mean).toBeCloseTo(3, 10);
    expect(est.df).toBe(2);
    const [lo, hi] = s.intervalAt(est, 0.05);
    expect(lo).toBeCloseTo(3 - 4.3027 / Math.sqrt(3), 3);
    expect(hi).toBeCloseTo(3 + 4.3027 / Math.sqrt(3), 3);
    const one = s.estimate([3, 4, 5], ['a', 'a', 'a']);
    expect(one.method).toBe('t-unclustered');
    expect(one.df).toBe(2);
    expect(s.estimate([4], ['a']).method).toBe('none');
    expect(s.intervalAt(s.estimate([4], ['a']), 0.05)).toEqual([null, null]);
  });

  it('applies Holm step-down with monotone adjusted p-values', () => {
    expect(s.holm({ a: 0.01, b: 0.04, c: 0.03, d: 0.005, e: null })).toEqual({
      a: expect.closeTo(0.03, 10),
      b: expect.closeTo(0.06, 10),
      c: expect.closeTo(0.06, 10),
      d: expect.closeTo(0.02, 10),
      e: null,
    });
  });

  it('tests the pre-declared primary uncorrected and corrects everything else', () => {
    const flat = { mean: 3.1, se: 0.2, df: 14, n: 15, G: 5, method: 'cluster-t' };
    const ests: Record<string, object> = { empathy: { ...flat, mean: 3.5 } }; // t = 2.5, p ~ 0.025
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) ests[k] = flat;
    const asPrimary = s.claimsTable(ests, { primary: 'empathy' });
    const emp = asPrimary.find((r: { dim: string }) => r.dim === 'empathy');
    expect(emp.role).toBe('primary');
    expect(emp.level).toBe(0.05);
    expect(emp.pAdj).toBeCloseTo(0.0254, 3);
    expect(emp.verdict).toBe('above baseline');

    const explored = s.claimsTable(ests, {}).find((r: { dim: string }) => r.dim === 'empathy');
    expect(explored.role).toBe('exploratory');
    expect(explored.level).toBeCloseTo(0.05 / 9, 10); // smallest p takes the strictest Holm step
    expect(explored.pAdj).toBeCloseTo(9 * 0.0254, 2);
    expect(explored.verdict).toBe('');
    expect(explored.lo).toBeLessThan(3);

    // A measured per-dimension baseline replaces the anchor.
    const vsFriend = s.claimsTable(
      { empathy: ests.empathy },
      { baseline: { empathy: 3.6 }, primary: 'empathy' }
    );
    expect(vsFriend[0].verdict).toBe('');
  });

  it('ranks ties by their average and gives Spearman and agreement', () => {
    expect(s.ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
    expect(s.spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])).toBeCloseTo(8 / Math.sqrt(95), 10);
    expect(s.spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
    expect(s.spearman([1, 2], [1, 2])).toBeNull();
    expect(s.spearman([1, 2, 3], [4, 4, 4])).toBeNull();
    expect(s.agreement([3, 4, 2, 5], [3, 2, 2, 4])).toEqual({ n: 4, exact: 0.5, adjacent: 0.75 });
    expect(s.agreement([3.4], [2.6])).toEqual({ n: 1, exact: 1, adjacent: 1 });
  });

  it('recovers known regression coefficients', () => {
    const rows = [
      [0, 10],
      [0, 14],
      [0, 20],
      [1, 12],
      [1, 30],
      [1, 25],
    ];
    const y = rows.map(([arm, w]) => 1 + 0.5 * arm + 2 * Math.log(w));
    const fit = s.ols(
      y,
      rows.map(([arm, w]) => [1, arm, Math.log(w)])
    );
    expect(fit.beta[0]).toBeCloseTo(1, 8);
    expect(fit.beta[1]).toBeCloseTo(0.5, 8);
    expect(fit.beta[2]).toBeCloseTo(2, 8);
    expect(fit.df).toBe(3);
    expect(s.ols([1, 2], [[1], [1]])?.beta[0]).toBeCloseTo(1.5, 10);
    expect(
      s.ols(
        [1, 2, 3],
        [
          [1, 1],
          [1, 1],
          [1, 1],
        ]
      )
    ).toBeNull(); // collinear
  });

  it('removes an arm difference that is only reply length', () => {
    // Score depends on length alone; the second arm just talks more.
    const words = [8, 10, 12, 9, 11, 20, 26, 30, 22, 28];
    const noise = [0.1, -0.1, 0.05, -0.05, 0, 0.1, -0.1, 0.05, -0.05, 0];
    const rows = words.map((w, i) => ({
      arm: i < 5 ? 0 : 1,
      words: w,
      score: 1 + Math.log(w) + noise[i],
    }));
    const r = s.lengthAdjusted(rows);
    expect(r.n).toBe(10);
    expect(r.raw.diff).toBeGreaterThan(0.8);
    expect(r.raw.p).toBeLessThan(0.001);
    expect(Math.abs(r.adjusted.diff)).toBeLessThan(0.2);
    expect(r.adjusted.p).toBeGreaterThan(0.05);
    expect(s.lengthAdjusted([{ arm: 0, words: 0, score: 3 }]).n).toBe(0);
  });

  it('shuffles deterministically by seed', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const one = s.shuffled(xs, s.hashSeed('story-1.json#0'));
    expect(one).toEqual(s.shuffled(xs, s.hashSeed('story-1.json#0')));
    expect([...one].sort()).toEqual(xs);
    expect(one).not.toEqual(xs);
    expect(s.shuffled(xs, s.hashSeed('story-1.json#1'))).not.toEqual(one);
    expect(s.hashSeed('abc')).toBe(0x1a47e90b);
  });
});
