/**
 * Means at hand beside the caller's own unsoftened risk words (#2697): "i want to die and i have
 * the pills right here" was a 988 block, and an attempt can start now, so the reply leads with
 * 911. crisis-guard.ts adds the imminent read; severity is already explicit.
 *
 * Means inside words a tier softened ("i used to have the gun in my hand every night") keep the
 * level they had and add nothing.
 *
 * @module CrisisMeansAtHand
 */

import { MEANS_AT_HAND_PATTERN } from './crisis-patterns.js';

/** True when this message's own, unsoftened risk read sits beside means at hand. */
export function meansAtHandImminent(
  text: string,
  indicators: readonly string[],
  softened: ReadonlyArray<readonly [number, number]>
): boolean {
  if (!indicators.includes('explicit_crisis_language') && !indicators.includes('plan_or_means')) {
    return false;
  }
  const means = MEANS_AT_HAND_PATTERN.exec(text);
  if (!means) return false;
  const end = means.index + means[0].length;
  return !softened.some(([s, e]) => means.index < e && end > s);
}
