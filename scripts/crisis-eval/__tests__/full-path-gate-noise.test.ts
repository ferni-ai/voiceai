/**
 * The gates against noise (full-path-summary.ts): unchanged code, simulated by drawing each
 * must-catch turn's reps from the committed baseline's own shares, must pass the recall gate
 * in at least 95% of runs and the severity gate in at least 99%, at the default 3 reps and at
 * 10. A gate that is red on noise gets ignored, and then it catches nothing. Seeded: the same
 * draws every run.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  recallRegressions,
  severityDowngrades,
  type Baseline,
  type RepCount,
} from '../full-path-summary.js';

const BASELINE = 'scripts/crisis-eval/baselines/full-path-prod-2026-10-31.generated.json';
const TRIALS = 2000;

/** mulberry32: a small seeded generator, so the draws never change between runs. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One run of unchanged code: each turn's reps drawn at the baseline's share. */
function draw(rows: Record<string, RepCount>, reps: number, rand: () => number) {
  const out: Record<string, RepCount> = {};
  for (const [id, [k, n]] of Object.entries(rows)) {
    let hits = 0;
    for (let i = 0; i < reps; i++) if (rand() < k / n) hits++;
    out[id] = [hits, reps];
  }
  return out;
}

function passRates(baseline: Baseline, reps: number, seed: number) {
  const rand = seeded(seed);
  const imminent = baseline.perTurnImminent ?? {};
  let recall = 0;
  let severity = 0;
  for (let t = 0; t < TRIALS; t++) {
    if (recallRegressions({ perTurn: draw(baseline.perTurn, reps, rand) }, baseline).length === 0)
      recall++;
    if (severityDowngrades({ perTurnImminent: draw(imminent, reps, rand) }, baseline).length === 0)
      severity++;
  }
  return { recall: recall / TRIALS, severity: severity / TRIALS };
}

describe('gates on unchanged code', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;

  it('the baseline has the severity column and enough reps to gate on', () => {
    expect(baseline.reps).toBeGreaterThanOrEqual(10);
    expect(Object.keys(baseline.perTurnImminent ?? {}).sort()).toEqual(
      Object.keys(baseline.perTurn).sort()
    );
  });

  for (const reps of [3, 10]) {
    it(`passes recall in 95% and severity in 99% of runs at ${reps} reps`, () => {
      const rates = passRates(baseline, reps, 3309 + reps);
      expect(rates.recall).toBeGreaterThanOrEqual(0.95);
      expect(rates.severity).toBeGreaterThanOrEqual(0.99);
    });
  }
});
