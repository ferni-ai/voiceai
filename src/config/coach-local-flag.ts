/**
 * Local coaching on/off switch: one fitted pick for where to eat (and, later,
 * what to buy), with a link the caller taps. Ferni never orders or buys.
 *
 * Off by default; COACH_LOCAL=on turns it on. Read on every call, so a test
 * (or a restart with new env) sees the current value.
 *
 * @module config/coach-local-flag
 */

/** Env var that turns local coaching on (must be exactly 'on'). */
export const COACH_LOCAL_ENV = 'COACH_LOCAL';

/** The tools that exist only while local coaching is on. */
export const COACH_LOCAL_TOOLS: readonly string[] = ['pickRestaurant'];

/** True only when COACH_LOCAL=on. */
export function isCoachLocalEnabled(): boolean {
  return process.env[COACH_LOCAL_ENV] === 'on';
}
