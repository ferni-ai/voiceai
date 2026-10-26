/**
 * Whether a classifier-only crisis read is eased to the soft check, decided
 * from verified facts only (crisis-easing-extract.ts): no caller words, no
 * model decision, no risk field. Pure.
 *
 * Eases only when all hold: the read was clean (no anomaly); the caller's
 * last line is about themselves; no preparation, method or time-ending
 * feature from the model or the code; at least one everyday context with a
 * verified quote; the quotes cover at least MIN_BENIGN_SHARE of the last line;
 * and every flagged span lies inside an everyday quote.
 *
 * @module CrisisEasingDecision
 */

import { MIN_BENIGN_SHARE, type EasingRead } from './crisis-easing-extract.js';

export type EasingWhy =
  | 'eased'
  | 'anomaly'
  | 'about'
  | 'features'
  | 'no_benign'
  | 'benign_share'
  | 'flagged_unexplained'
  | 'error';

/** The first reason the read keeps the guidance, or 'eased'. Fails closed. */
export function easingWhy(read: EasingRead): EasingWhy {
  try {
    if (read?.ok !== true) return 'anomaly';
    const f = read.facts;
    if (f.about !== 'self') return 'about';
    if (!Array.isArray(f.features) || f.features.length !== 0) return 'features';
    if (!Array.isArray(f.benign) || f.benign.length === 0) return 'no_benign';
    if (!(f.benignShare >= MIN_BENIGN_SHARE)) return 'benign_share';
    if (f.flaggedExplained !== true) return 'flagged_unexplained';
    return 'eased';
  } catch {
    return 'error';
  }
}
