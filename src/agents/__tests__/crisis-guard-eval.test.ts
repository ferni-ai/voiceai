/**
 * Crisis Guard — measured floors on two labelled sets
 *
 * CRISIS_HELDOUT (120 cases) is the development set: the patterns were tuned
 * against it, so its floors are strict and a drop means a regression.
 *
 * CRISIS_TEST_BLIND (150 cases) was written blind and is never tuned against.
 * Its floors record what the pattern guard honestly reaches on unseen
 * phrasing (about a quarter of risk messages), which is why the semantic
 * classifier stage exists. Raise these floors only from changes made without
 * looking at the failing blind cases.
 */

import { describe, expect, it } from 'vitest';
import { detectCrisis, guardPreResponse } from '../safety/crisis-guard.js';
import { CRISIS_HELDOUT } from './fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from './fixtures/crisis-test-blind.js';

interface LabelledCase {
  text: string;
  label: 'block' | 'crisis' | 'none';
}

function measure(cases: readonly LabelledCase[]) {
  let caught = 0;
  let risk = 0;
  let falsePositives = 0;
  let blocked = 0;
  let blockLabels = 0;
  let overBlocked = 0;
  for (const c of cases) {
    const flagged = detectCrisis(c.text).isCrisis;
    const block = guardPreResponse(c.text).shouldBlock;
    if (c.label === 'none') {
      if (flagged || block) falsePositives++;
      continue;
    }
    risk++;
    if (flagged || block) caught++;
    if (c.label === 'block') {
      blockLabels++;
      if (block) blocked++;
    } else if (block) {
      overBlocked++;
    }
  }
  return { recall: caught / risk, falsePositives, blockRecall: blocked / blockLabels, overBlocked };
}

describe('crisis guard on the development set', () => {
  const m = measure(CRISIS_HELDOUT);

  it('catches at least 95% of risk messages', () => {
    expect(m.recall).toBeGreaterThanOrEqual(0.95);
  });

  it('flags none of the benign messages', () => {
    expect(m.falsePositives).toBe(0);
  });

  it('replaces the reply for at least 90% of imminent-risk messages', () => {
    expect(m.blockRecall).toBeGreaterThanOrEqual(0.9);
  });

  it('never replaces the reply for a non-imminent crisis', () => {
    expect(m.overBlocked).toBe(0);
  });
});

describe('crisis guard on the blind set (never tuned against)', () => {
  const m = measure(CRISIS_TEST_BLIND);

  it('keeps its measured recall floor', () => {
    expect(m.recall).toBeGreaterThanOrEqual(0.25);
  });

  it('flags none of the benign messages', () => {
    expect(m.falsePositives).toBe(0);
  });

  it('keeps its measured imminent-risk floor', () => {
    expect(m.blockRecall).toBeGreaterThanOrEqual(0.2);
  });

  it('replaces the reply for at most one non-imminent crisis', () => {
    expect(m.overBlocked).toBeLessThanOrEqual(1);
  });
});
