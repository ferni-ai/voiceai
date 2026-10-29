import { describe, expect, it } from 'vitest';
import type { WellbeingSnapshot } from '../index.js';
import { estimateWellbeing } from '../state-model.js';

const NOW = new Date('2026-10-18T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
let n = 0;

/** A snapshot `daysAgo` days before NOW. */
function snap(
  daysAgo: number,
  dimensions: WellbeingSnapshot['dimensions'],
  confidence: WellbeingSnapshot['confidence'] = {}
): WellbeingSnapshot {
  return {
    id: `wb_${n++}`,
    userId: 'u1',
    timestamp: new Date(NOW.getTime() - daysAgo * DAY),
    source: 'inferred',
    dimensions,
    confidence,
  };
}

describe('estimateWellbeing: recency decay (7-day half-life)', () => {
  it.each([
    // [label, older obs, newer obs, expected value]
    ['same day: plain average', [0, 0.2], [0, 0.8], 0.5],
    ['a week apart: the older counts half', [7, 0.2], [0, 0.8], (0.2 * 0.5 + 0.8) / 1.5],
    ['two weeks apart: the older counts a quarter', [14, 0.2], [0, 0.8], (0.2 * 0.25 + 0.8) / 1.25],
  ] as const)('%s', (_label, [oldAgo, oldV], [newAgo, newV], expected) => {
    const e = estimateWellbeing([snap(oldAgo, { mood: oldV }), snap(newAgo, { mood: newV })], NOW);
    expect(e.mood?.value).toBeCloseTo(expected, 6);
    expect(e.mood?.observations).toBe(2);
  });
});

describe('estimateWellbeing: confidence weighting', () => {
  it.each([
    ['equal confidence', 0.6, 0.6, 0.5],
    ['a sure reading outweighs a guess', 0.9, 0.3, (0.9 * 0.2 + 0.3 * 0.8) / 1.2],
    ['a zero-confidence reading counts for nothing', 0.6, 0, 0.2],
  ] as const)('%s', (_label, cA, cB, expected) => {
    const e = estimateWellbeing(
      [snap(0, { energy: 0.2 }, { energy: cA }), snap(0, { energy: 0.8 }, { energy: cB })],
      NOW
    );
    expect(e.energy?.value).toBeCloseTo(expected, 6);
  });

  it('only zero-confidence readings: no estimate rather than a made-up one', () => {
    expect(estimateWellbeing([snap(0, { worry: 0.9 }, { worry: 0 })], NOW).worry).toBeUndefined();
  });
});

describe('estimateWellbeing: fields nobody talked about', () => {
  it('leaves them out: no neutral 0.5, no 0', () => {
    const e = estimateWellbeing([snap(1, { mood: 0.7 }), snap(3, { energy: 0.4 })], NOW);
    expect(Object.keys(e).sort()).toEqual(['energy', 'mood']);
    expect(e.sleepQuality).toBeUndefined();
  });

  it('nothing at all: an empty estimate', () => {
    expect(estimateWellbeing([], NOW)).toEqual({});
  });

  it('dates each field by when it last came up, not by the newest snapshot', () => {
    const e = estimateWellbeing([snap(0, { mood: 0.7 }), snap(4, { sleepQuality: 0.3 })], NOW);
    expect(e.mood?.asOf).toBe(new Date(NOW.getTime()).toISOString());
    expect(e.sleepQuality?.asOf).toBe(new Date(NOW.getTime() - 4 * DAY).toISOString());
  });
});

describe('estimateWellbeing: direction only with enough history', () => {
  it.each([
    [
      '2 readings over 10 days: too few',
      [
        [10, 0.2],
        [0, 0.9],
      ],
      null,
    ],
    [
      '3 readings over 4 days: too short',
      [
        [4, 0.2],
        [2, 0.5],
        [0, 0.9],
      ],
      null,
    ],
    [
      '3 readings over 5 days, climbing',
      [
        [5, 0.2],
        [3, 0.5],
        [0, 0.9],
      ],
      'rising',
    ],
    [
      '3 readings over 6 days, dropping',
      [
        [6, 0.8],
        [3, 0.5],
        [0, 0.3],
      ],
      'falling',
    ],
    [
      '3 readings over 8 days, wobbling',
      [
        [8, 0.5],
        [4, 0.55],
        [0, 0.52],
      ],
      'steady',
    ],
  ] as const)('%s', (_label, readings, expected) => {
    const e = estimateWellbeing(
      readings.map(([ago, v]) => snap(ago, { mood: v })),
      NOW
    );
    expect(e.mood?.direction).toBe(expected);
  });
});

describe('estimateWellbeing: a stale saved profile', () => {
  it('does not win over newer snapshots', () => {
    // The old detector's profile.current: 60 days old, mood 0.2. Two calls this week: 0.8.
    const stale = snap(60, { mood: 0.2, sleepQuality: 0.3 }, { mood: 0.9, sleepQuality: 0.9 });
    const e = estimateWellbeing([snap(1, { mood: 0.8 }), snap(2, { mood: 0.8 }), stale], NOW);
    expect(e.mood?.value).toBeGreaterThan(0.79);
    expect(e.mood?.asOf).toBe(new Date(NOW.getTime() - DAY).toISOString());
    // Sleep came up only then: still shown, dated 60 days ago, never upgraded to "now".
    expect(e.sleepQuality?.value).toBeCloseTo(0.3, 6);
    expect(e.sleepQuality?.asOf).toBe(new Date(NOW.getTime() - 60 * DAY).toISOString());
  });

  it('counts a snapshot once even when it is also the profile.current', () => {
    const s = snap(1, { mood: 0.6 });
    expect(estimateWellbeing([s, s], NOW).mood?.observations).toBe(1);
  });
});
