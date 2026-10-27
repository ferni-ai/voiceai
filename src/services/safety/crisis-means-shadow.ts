/**
 * CRISIS_MEANS_IN_HAND (crisis-means-in-hand.ts, #2697) outside the guard itself.
 *
 * - shadow (the default): the turn's read stays exactly as on main. When the means-in-hand forms
 *   would read the turn differently, one line logs the tier live would give: the session id and
 *   the tier, never the caller's words.
 * - live: assessSafety reads the guard's imminent read as crisis and leads with 911.
 *
 * @module CrisisMeansShadow
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  CRISIS_SEVERITY,
  detectCrisis,
  type CrisisDetectionOptions,
  type CrisisDetectionResult,
  type VoiceEmotionContext,
} from './crisis-guard.js';
import { resolveMeansInHandMode } from './crisis-means-in-hand.js';

const log = createLogger({ module: 'CrisisMeansShadow' });

export type MeansTier = 'imminent' | 'block' | 'crisis' | 'none';

/** What a read gives the caller: the 911 script, the 988 script, 988 guidance, or nothing. */
export function tierOf(read: CrisisDetectionResult): MeansTier {
  if (read.isCrisis && read.indicators.includes('imminent_danger')) return 'imminent';
  if (read.isCrisis && read.severity >= CRISIS_SEVERITY.block) return 'block';
  return read.isCrisis ? 'crisis' : 'none';
}

/**
 * Shadow: log the tier the live forms would give this turn, when it differs from the read the
 * turn used. Returns that tier, or null when nothing was logged. Changes no read.
 */
export function noteMeansInHandShadow(
  sessionId: string | undefined,
  read: CrisisDetectionResult,
  args: { text: string; voice?: VoiceEmotionContext; options?: CrisisDetectionOptions },
  env: Record<string, string | undefined> = process.env
): MeansTier | null {
  if (resolveMeansInHandMode(env) !== 'shadow') return null;
  const live = detectCrisis(args.text, args.voice, { ...args.options, meansInHand: 'live' });
  const tier = tierOf(live);
  if (tier === tierOf(read)) return null;
  log.info({ sessionId, reader: 'means_in_hand', tier }, 'CRISIS_MEANS_IN_HAND_SHADOW');
  return tier;
}

/** live only: the guard reads these words as imminent (assessSafety leads with 911). */
export function readsImminentLive(
  text: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (resolveMeansInHandMode(env) !== 'live') return false;
  return detectCrisis(text, undefined, { meansInHand: 'live' }).indicators.includes(
    'imminent_danger'
  );
}
