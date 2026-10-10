/**
 * Eval-only clock offset, so a scripted recall call can be "dated after" its
 * seed call ("Mindy's surgery is Tuesday" → call 2 four days later) without
 * waiting days.
 *
 * Production can never move the clock: the offset is read only when the
 * worker itself runs with VOICE_EVAL_CLOCK=on (set on a local eval worker,
 * never in dev or prod secrets) AND the user is a synthetic eval caller
 * (id starts with "voice-eval-"). Anything else in the dispatch metadata is
 * ignored.
 *
 * @module intelligence/world-model/temporal/eval-clock
 */

const MAX_DAYS = 60;
const DAY_MS = 86_400_000;

/** Days to shift "now" for this call, or undefined (always, outside evals). */
export function evalDaysLater(
  userId: string | null | undefined,
  metadata: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env
): number | undefined {
  if (env.VOICE_EVAL_CLOCK !== 'on') return undefined;
  if (typeof userId !== 'string' || !userId.startsWith('voice-eval-')) return undefined;
  const raw = metadata.eval_days_later;
  const days = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return undefined;
  }
  return days;
}

/** The time a call should reason about: now, or now + the eval offset. */
export function callNow(daysLater: number | undefined, real: Date = new Date()): Date {
  return daysLater ? new Date(real.getTime() + daysLater * DAY_MS) : real;
}
