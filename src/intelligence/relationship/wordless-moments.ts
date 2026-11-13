/**
 * Moments that never keep or bring back a caller's words (CRISIS_WORDS_NEVER_RESURFACE).
 *
 * A crisis_support or vulnerability moment is what someone said on their hardest turn. With the
 * flag on, those moments keep only their type, date and score: no summary, no quoted phrase, no
 * topic. They are never offered as a callback ("Remember when you told me ..."), whatever the
 * relationship stage or callback probability, including moments saved before the flag. The
 * personality service's vulnerability deposit from the same moment keeps no words either
 * (record-emotional-moment.ts), and the personality prompt never quotes one
 * (build-personality-context.ts). Off: as on main.
 *
 * @module intelligence/relationship/wordless-moments
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { clampMomentWords } from '../../utils/shared-moment-retention.js';
import type { MomentDetails, SharedMoment, SharedMomentType } from './types.js';

const WORDLESS_TYPES: ReadonlySet<SharedMomentType> = new Set<SharedMomentType>([
  'crisis_support',
  'vulnerability',
  'first_vulnerability',
]);

/** True when the flag is on, so crisis and vulnerability moments keep and surface no words. */
function crisisWordsNeverResurface(env: Env = process.env): boolean {
  return flagOn('CRISIS_WORDS_NEVER_RESURFACE', env);
}

/** A moment of this type keeps no words and is never a callback (flag on). */
export function isWordlessMoment(type: SharedMomentType, env: Env = process.env): boolean {
  return crisisWordsNeverResurface(env) && WORDLESS_TYPES.has(type);
}

/** The words a moment keeps: 80 characters of summary and phrase, or none for a wordless one. */
export function momentWords(
  type: SharedMomentType,
  summary: string,
  details?: MomentDetails
): Pick<SharedMoment, 'summary' | 'userPhrase' | 'topic'> {
  if (isWordlessMoment(type)) return { summary: '' };
  return {
    summary: clampMomentWords(summary),
    userPhrase: details?.userPhrase && clampMomentWords(details.userPhrase),
    topic: details?.topic,
  };
}

/** The moments a callback may offer: never a crisis or vulnerability one, even saved before. */
export function callbackCandidates(moments: SharedMoment[]): SharedMoment[] {
  return crisisWordsNeverResurface() ? moments.filter((m) => !isWordlessMoment(m.type)) : moments;
}
