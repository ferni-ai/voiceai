/**
 * skipsRecall (CRISIS_NO_MEMORY_RECALL): the memory search is skipped on a crisis line or a call
 * with crisis risk, and a check that throws skips it too (fail closed). Riley Test's lines here
 * are invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const safety = vi.hoisted(() => ({ throws: false }));

vi.mock('../../../../services/safety/index.js', async (orig) => {
  const real = await orig<typeof import('../../../../services/safety/index.js')>();
  return {
    ...real,
    scoreCrisisLanguage: (said: string) => {
      if (safety.throws) throw new Error('pattern scorer down');
      return real.scoreCrisisLanguage(said);
    },
  };
});

const { skipsRecall } = await import('../crisis-memory-recall.js');
const { noteCrisisRisk, resetCrisisCallRisk } =
  await import('../../../../services/safety/crisis-call-risk.js');

const ON = { CRISIS_NO_MEMORY_RECALL: 'on' };
const ORDINARY = 'Riley Test made pasta tonight.';
const CRISIS = "I hope I don't wake up tomorrow";

beforeEach(() => {
  safety.throws = false;
  resetCrisisCallRisk();
});

describe('skipsRecall', () => {
  it('flag on: a crisis line or a call with risk skips the search; an ordinary line does not', () => {
    expect(skipsRecall('s-skip-1', ORDINARY, ON)).toBe(false);
    expect(skipsRecall('s-skip-1', CRISIS, ON)).toBe(true);
    noteCrisisRisk('s-skip-2');
    expect(skipsRecall('s-skip-2', ORDINARY, ON)).toBe(true);
  });

  it('flag off: never skips, a crisis line included', () => {
    expect(skipsRecall('s-skip-3', CRISIS, {})).toBe(false);
  });

  it('a check that throws skips the search (fail closed)', () => {
    expect(skipsRecall('s-skip-4', ORDINARY, ON)).toBe(false); // precondition: it would search
    safety.throws = true;
    expect(skipsRecall('s-skip-4', ORDINARY, ON)).toBe(true);
    expect(skipsRecall('s-skip-4', ORDINARY, {})).toBe(false); // flag off: main, no check run
  });
});
