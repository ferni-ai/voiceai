import { describe, expect, it } from 'vitest';
import { countOrder, countSet } from '../tool-count-set.mjs';
import { discordant, mcnemar, rates } from '../tool-count-sweep.mjs';

const names = Array.from({ length: 300 }, (_, i) => `tool${String(i).padStart(3, '0')}`);
const head = ['tool250', 'tool007', 'notRegistered'];
const SIZES = [20, 40, 64, 96, 130];

describe('countOrder / countSet', () => {
  it('nests every size inside the next, for any label, with the same seed', () => {
    const order = countOrder(names, head, 7);
    for (const label of [null, 'tool250', 'tool123', 'tool299']) {
      const sets = SIZES.map((k) => new Set(countSet(order, k, label)));
      sets.forEach((set, i) => {
        expect(set.size).toBe(SIZES[i]);
        if (label) expect(set.has(label)).toBe(true);
        for (const h of ['tool250', 'tool007']) expect(set.has(h)).toBe(true);
        if (i) for (const n of sets[i - 1]) expect(set.has(n)).toBe(true);
      });
    }
  });

  it('draws the same order for a seed regardless of registration order, another for a new seed', () => {
    const a = countOrder(names, head, 7);
    expect(countOrder([...names].reverse(), head, 7)).toEqual(a);
    expect(a.slice(0, 2)).toEqual(['tool250', 'tool007']);
    expect(countOrder(names, head, 8).slice(2, 40)).not.toEqual(a.slice(2, 40));
    expect(() => countSet(a, 301, null)).toThrow();
  });
});

describe('scoring', () => {
  it('computes an exact two-sided McNemar p', () => {
    expect(mcnemar(0, 0)).toBe(1);
    expect(mcnemar(10, 0)).toBeCloseTo(2 / 1024, 6);
    expect(mcnemar(3, 5)).toBeCloseTo(mcnemar(5, 3), 12);
    expect(mcnemar(3, 5)).toBeCloseTo((2 * (1 + 8 + 28 + 56)) / 256, 6);
  });

  it('separates missed, lookalike and negative false calls; pairs by run, seed and request', () => {
    const row = (query, label, final, extra = {}) => ({
      query,
      label,
      final,
      labelSent: label !== null,
      run: 1,
      seed: 1,
      ...extra,
    });
    const a = [
      row('q1', 'setTimer', 'setTimer'),
      row('q2', 'setTimer', null),
      row('q3', 'setTimer', 'quickTimer', { sufficient: true }),
      row('q4', 'setTimer', 'playMusic', { sufficient: false }),
      row('n1', null, null),
      row('n2', null, 'tellJoke'),
      row('q5', 'gitDiff', null, { labelSent: false }),
    ];
    const r = rates(a);
    expect([r.n, r.right, r.missed, r.lookalike, r.falseCall]).toEqual([4, 0.5, 0.25, 0.25, 0.5]);
    const b = [
      row('q1', 'setTimer', null),
      row('q2', 'setTimer', 'setTimer'),
      row('q4', 'setTimer', 'playMusic'),
    ];
    expect(discordant(a, b)).toMatchObject({ n: 3, b: 1, c: 1 });
    expect(
      discordant(
        a,
        b.map((x) => ({ ...x, seed: 2 }))
      ).n
    ).toBe(0);
  });
});
