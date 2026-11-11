/**
 * How much this caller wants to be asked about their things: a Beta(α, β)
 * belief that an ask lands, and the weekly ask budget it allows (plan §4: at
 * most three a week, a per-person learner adjusts from there). Prior Beta(2, 1);
 * engaged adds to α, a brush-off or no answer to β. Nothing stores an appetite
 * yet (B5 does); plan.ts uses the prior. Pure.
 *
 * @module services/follow-through/appetite
 */
export interface Appetite {
  readonly alpha: number;
  readonly beta: number;
}
export type Landing = 'engaged' | 'brushed-off' | 'ignored';

/** Before we know the caller, an ask is more likely to land than not. */
export const PRIOR_APPETITE: Appetite = { alpha: 2, beta: 1 };
/** The owner's ceiling: Ferni-started follow-ups at most three a week (2026-11-07). */
export const MAX_WEEKLY = 3;
/** However often asks miss, one a week stays possible, so the learner can hear a change. */
export const MIN_WEEKLY = 1;

const mean = (a: Appetite): number => a.alpha / (a.alpha + a.beta);
const PRIOR_MEAN = mean(PRIOR_APPETITE);
/** The belief after one more answer. */
export function updateAppetite(a: Appetite, landing: Landing): Appetite {
  return landing === 'engaged' ? { ...a, alpha: a.alpha + 1 } : { ...a, beta: a.beta + 1 };
}
/** Asks allowed in a rolling 7 days: MAX_WEEKLY scaled by mean / prior mean, kept in [MIN, MAX]. */
export function weeklyAskBudget(a: Appetite): number {
  const scaled = Math.round((MAX_WEEKLY * mean(a)) / PRIOR_MEAN);
  return Math.min(MAX_WEEKLY, Math.max(MIN_WEEKLY, scaled));
}
