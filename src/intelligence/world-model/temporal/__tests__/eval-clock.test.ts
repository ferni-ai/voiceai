/**
 * The eval clock moves only for a synthetic eval caller on an eval worker.
 */

import { describe, expect, it } from 'vitest';
import { callNow, evalDaysLater } from '../eval-clock.js';

const EVAL = { VOICE_EVAL_CLOCK: 'on' };

describe('evalDaysLater', () => {
  it('prod-shaped calls never shift: flag unset, or a real user', () => {
    // The worker flag is unset in dev and prod; metadata alone does nothing.
    expect(evalDaysLater('voice-eval-x', { eval_days_later: 4 }, {})).toBeUndefined();
    expect(
      evalDaysLater('voice-eval-x', { eval_days_later: 4 }, { VOICE_EVAL_CLOCK: 'true' })
    ).toBeUndefined();
    // Even on an eval worker, a real caller's metadata cannot move the clock.
    expect(evalDaysLater('Hk2r9xUser', { eval_days_later: 4 }, EVAL)).toBeUndefined();
    expect(evalDaysLater(null, { eval_days_later: 4 }, EVAL)).toBeUndefined();
  });

  it('an eval caller on an eval worker gets 1..60 whole days, else nothing', () => {
    expect(evalDaysLater('voice-eval-x', { eval_days_later: 4 }, EVAL)).toBe(4);
    expect(evalDaysLater('voice-eval-x', { eval_days_later: '4' }, EVAL)).toBe(4);
    for (const bad of [0, -2, 61, 1.5, 'soon', null, undefined]) {
      expect(evalDaysLater('voice-eval-x', { eval_days_later: bad }, EVAL)).toBeUndefined();
    }
  });
});

describe('callNow', () => {
  it('is the real time unless shifted', () => {
    const real = new Date('2026-10-10T18:00:00.000Z');
    expect(callNow(undefined, real)).toBe(real);
    expect(callNow(4, real).toISOString()).toBe('2026-10-14T18:00:00.000Z');
  });
});
