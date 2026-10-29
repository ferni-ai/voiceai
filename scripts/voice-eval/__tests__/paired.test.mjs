// paired.mjs on synthetic sweeps whose true answer is known: each scenario has
// its own level (SD 0.8), each call adds noise (SD 0.3), and build B adds a
// fixed shift to one metric and nothing to the other.
import { describe, expect, it } from 'vitest';
import { rng } from '../judge-stats.mjs';
import { mde, pairedCompare, pearson } from '../paired.mjs';

function normal(r) {
  const u = 1 - r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Two builds over the same scenarios; B is A's scenario level + shift. */
function sweeps({
  scenarios = 30,
  perScenario = 2,
  shift = 0.4,
  seed = 7,
  scenSd = 0.8,
  callSd = 0.3,
} = {}) {
  const r = rng(seed);
  const A = [];
  const B = [];
  for (let s = 0; s < scenarios; s++) {
    const level = 3 + scenSd * normal(r);
    for (let k = 0; k < perScenario; k++) {
      A.push({
        scenario: `s${s}`,
        values: { shifted: level + callSd * normal(r), flat: level + callSd * normal(r) },
      });
      B.push({
        scenario: `s${s}`,
        values: { shifted: level + shift + callSd * normal(r), flat: level + callSd * normal(r) },
      });
    }
  }
  return [A, B];
}

describe('pairedCompare on synthetic sweeps', () => {
  const [A, B] = sweeps();
  const rows = Object.fromEntries(pairedCompare(A, B).map((r) => [r.metric, r]));

  it('recovers a true +0.4 shift with a CI that holds it and excludes 0', () => {
    const r = rows.shifted;
    expect(r.diff).toBeGreaterThan(0.3);
    expect(r.diff).toBeLessThan(0.5);
    expect(r.ci[0]).toBeGreaterThan(0);
    expect(r.ci[0]).toBeLessThan(0.4);
    expect(r.ci[1]).toBeGreaterThan(0.4);
  });

  it('finds no shift where there is none', () => {
    const r = rows.flat;
    expect(r.ci[0]).toBeLessThan(0);
    expect(r.ci[1]).toBeGreaterThan(0);
  });

  it('measures per-call SD and the A/B correlation the data were built with', () => {
    // per call: sqrt(0.8^2 + 0.3^2) = 0.85; r of scenario means: 0.64 / (0.64 + 0.09/2) = 0.93
    expect(rows.flat.sdPerCall).toBeGreaterThan(0.65);
    expect(rows.flat.sdPerCall).toBeLessThan(1.05);
    expect(rows.flat.r).toBeGreaterThan(0.85);
    // SD of a scenario diff: sqrt(2 * 0.09 / 2) = 0.3, so the MDE is far below sd/call
    expect(rows.flat.sdDiff).toBeGreaterThan(0.2);
    expect(rows.flat.sdDiff).toBeLessThan(0.4);
    expect(rows.flat.mde80).toBeLessThan(rows.flat.sdPerCall / 3);
  });

  it('is deterministic for a fixed seed', () => {
    expect(pairedCompare(A, B)[0].ci).toEqual(pairedCompare(A, B)[0].ci);
  });

  it('MDE80 is the effect found ~80% of the time', () => {
    // Plan from one sweep, then run 200 fresh sweeps whose true shift is that MDE.
    const target = Object.fromEntries(
      pairedCompare(...sweeps({ shift: 0, seed: 11 })).map((r) => [r.metric, r])
    ).flat.mde80;
    let found = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const [a, b] = sweeps({ shift: target, seed: 1000 + i });
      const row = pairedCompare(a, b, { B: 2000, seed: i }).find((r) => r.metric === 'shifted');
      if (row.ci[0] > 0) found++;
    }
    expect(found / trials).toBeGreaterThan(0.65);
    expect(found / trials).toBeLessThan(0.93);
  });
});

describe('helpers', () => {
  it('pearson and mde match hand values', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    // n=30: (t.975,29 + t.80,29) = 2.045 + 0.854 = 2.899
    expect(mde(1, 30)).toBeCloseTo(2.899 / Math.sqrt(30), 2);
    expect(mde(1, 1)).toBeNull();
  });
});
