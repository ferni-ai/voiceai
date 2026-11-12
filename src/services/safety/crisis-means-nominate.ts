/**
 * The nominate tier of the means forms (Seth 11-11: regex nominates, never sends 911 alone).
 * CRISIS_MEANS_NOMINATE: off (default) | live. With it live (and CRISIS_MEANS_IN_HAND live), a
 * nominating form (NOMINATE_FORMS in crisis-means-in-hand.ts) reads a crisis that is never
 * imminent: the guidance with 988 and "are you safe right now?". 911 comes from the classifier's
 * imminent read, or from the caller saying they are not safe on the next turn (notSafeAfterMeans).
 *
 * @module CrisisMeansNominate
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisMeansNominate' });

/** CRISIS_MEANS_NOMINATE: whether the nominating forms act. */
export type MeansNominateMode = 'off' | 'live';

/** The indicator a nominating form adds: a crisis at passive severity, never 911 alone. */
export const MEANS_NOMINATED = 'means_nominated';

const warned = new Set<string>();
/**
 * CRISIS_MEANS_NOMINATE: live, or off. Any other value ('on', 'shadow', a typo) is off, and warned
 * once per value, never quietly read as something else (the 'on' footgun, #3702).
 */
export function resolveMeansNominateMode(
  env: Record<string, string | undefined> = process.env,
  warn: (value: string) => void = (value) =>
    log.warn({ value, flag: 'CRISIS_MEANS_NOMINATE' }, 'unknown flag value, read as off')
): MeansNominateMode {
  const raw = env.CRISIS_MEANS_NOMINATE?.trim().toLowerCase();
  if (raw === 'live') return 'live';
  if (raw && raw !== 'off' && !warned.has(raw)) {
    warned.add(raw);
    warn(raw);
  }
  return 'off';
}

/** "no, i'm not safe": the caller's own answer, said as the whole turn ("not safe at home" is not). */
const NOT_SAFE_ANSWER =
  /^(?:(?:no|nope|nah|honestly|not really)[,.!]* *)?(?:(?:i'?m|i am|im) )?not (?:really |very )?safe(?: (?:right now|at all|tonight))?[ .!]*$/;

/** The tags a confirmed "not safe" adds: the context read that sends 911, as imminent does. */
export const NOT_SAFE_TAGS = ['not_safe_confirmed', 'explicit_crisis_language', 'imminent_danger'];

/**
 * The turn is the caller's own "no, i'm not safe", just after a turn a means form read: a
 * nominating form, or a live one (imminent). Only the last two earlier messages count, since a
 * list may carry Ferni's question between. indicatorsOf reads one earlier message.
 */
export function notSafeAfterMeans(
  text: string,
  earlier: readonly string[],
  indicatorsOf: (message: string) => readonly string[]
): boolean {
  if (!NOT_SAFE_ANSWER.test(text.trim())) return false;
  const before = earlier.slice(-2).flatMap(indicatorsOf);
  return before.includes(MEANS_NOMINATED) || before.includes('imminent_danger');
}
