import { describe, expect, it } from 'vitest';
import {
  MAX_WEEKLY,
  MIN_WEEKLY,
  PRIOR_APPETITE,
  updateAppetite,
  weeklyAskBudget,
  type Appetite,
  type Landing,
} from '../appetite.js';

const after = (landings: Landing[], from: Appetite = PRIOR_APPETITE): Appetite =>
  landings.reduce(updateAppetite, from);
const times = (n: number, landing: Landing): Landing[] => Array(n).fill(landing);

describe('appetite: a Beta(2, 1) learner and the weekly ask budget it allows', () => {
  it('starts at the prior and the owner ceiling of three a week', () => {
    expect(PRIOR_APPETITE).toEqual({ alpha: 2, beta: 1 });
    expect(weeklyAskBudget(PRIOR_APPETITE)).toBe(3);
    expect([MIN_WEEKLY, MAX_WEEKLY]).toEqual([1, 3]);
  });

  it('engaged adds to alpha; brushed-off and ignored add to beta', () => {
    expect(updateAppetite(PRIOR_APPETITE, 'engaged')).toEqual({ alpha: 3, beta: 1 });
    expect(updateAppetite(PRIOR_APPETITE, 'brushed-off')).toEqual({ alpha: 2, beta: 2 });
    expect(updateAppetite(PRIOR_APPETITE, 'ignored')).toEqual({ alpha: 2, beta: 2 });
  });

  it('moves the budget down with brush-offs, step by step, to the floor of one', () => {
    const budgets = [0, 1, 4, 10].map((n) => weeklyAskBudget(after(times(n, 'brushed-off'))));
    expect(budgets).toEqual([3, 2, 1, 1]);
  });

  it('moves it back up with engagement, never above three', () => {
    const low = after(times(4, 'brushed-off'));
    expect(weeklyAskBudget(low)).toBe(1);
    expect(weeklyAskBudget(after(times(2, 'engaged'), low))).toBe(2);
    expect(weeklyAskBudget(after(times(6, 'engaged'), low))).toBe(3);
    expect(weeklyAskBudget(after(times(50, 'engaged')))).toBe(MAX_WEEKLY);
  });

  it('ignored counts like a brush-off', () => {
    expect(weeklyAskBudget(after(times(4, 'ignored')))).toBe(1);
  });
});
