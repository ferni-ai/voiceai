/**
 * CRISIS_MEANS_IN_HAND (crisis-means-in-hand.ts, #2697) outside the guard itself.
 *
 * - shadow (the default) and live: when any form, live or shadow-only, would read the turn
 *   differently from the read the turn used, one line logs the tier it would give and the form: the
 *   session id, the tier and the form name, never the caller's words. That is the data a shadow
 *   form is promoted from.
 * - live: assessSafety reads the guard's imminent read (the live forms) as crisis and leads with 911.
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
 * Shadow and live: log the tier and the form every form would give this turn, when that tier
 * differs from the read the turn used. Returns what was logged, or null. Changes no read.
 */
export function noteMeansInHandShadow(
  sessionId: string | undefined,
  read: CrisisDetectionResult,
  args: { text: string; voice?: VoiceEmotionContext; options?: CrisisDetectionOptions },
  env: Record<string, string | undefined> = process.env
): { tier: MeansTier; form: string } | null {
  if (resolveMeansInHandMode(env) === 'off') return null;
  const all = detectCrisis(args.text, args.voice, { ...args.options, meansInHand: 'all' });
  const tier = tierOf(all);
  const form = all.indicators.find((i) => i.startsWith('means_form:'))?.slice('means_form:'.length);
  if (!form || tier === tierOf(read)) return null;
  log.info({ sessionId, reader: 'means_in_hand', tier, form }, 'CRISIS_MEANS_IN_HAND_SHADOW');
  return { tier, form };
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
