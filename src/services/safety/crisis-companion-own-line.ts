/**
 * CRISIS_COMPANION_EXCLUDES_OWN_LINE (off, #4208): the read after a crisis turn is not given
 * Ferni's own crisis line as its context.
 *
 * After one alarm, COMPANION (Ferni's line just before the caller's words) is Ferni's referral
 * to 988 or 911, and the prompt says context never lowers that risk: the caller's pushback read
 * imminent on every turn after, until hang-up. With the flag on, on a call with crisis risk
 * noted, the read leaves out each sentence of Ferni's line that gives a crisis line and asks
 * nothing. Ferni's questions stay ("Are you safe right now?"): a caller's "no" is read with
 * them. The caller's own words (LATEST, EARLIER) are never touched, and the turn's reads keep
 * their keys: only what the model is shown changes.
 *
 * Logs a count of sentences left out, never the words.
 *
 * @module CrisisCompanionOwnLine
 */

import { crisisRiskNoted } from './crisis-call-risk.js';
import { names911, offersCrisisLine } from './crisis-line-speech.js';
import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';

const log = createLogger({ module: 'CrisisCompanionOwnLine' });

type Env = Record<string, string | undefined>;

export function resolveCompanionExcludesOwnLine(env: Env = process.env): boolean {
  return env.CRISIS_COMPANION_EXCLUDES_OWN_LINE?.trim().toLowerCase() === 'on';
}

/** As much of Ferni's line as the classifier reads (normalizeInput keeps its last 400). */
const MAX_LINE_CHARS = 400;

/** A sentence that hands the caller a line to call or text, and asks them nothing. */
const givesCrisisLine = (sentence: string): boolean =>
  !sentence.includes('?') && (offersCrisisLine(sentence) || names911(sentence));

/**
 * Ferni's line as this read should see it. Unchanged unless the flag is on, the call has crisis
 * risk noted and the line gives a crisis line; then without those sentences, or none at all
 * when the line was only that.
 */
export function companionForRead(
  companion: string | undefined,
  call: string | undefined,
  env: Env = process.env
): string | undefined {
  if (!companion || !call || !resolveCompanionExcludesOwnLine(env)) return companion;
  if (!crisisRiskNoted(call)) return companion;
  const sentences = stripSSML(companion)
    .trim()
    .slice(-MAX_LINE_CHARS)
    .split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !givesCrisisLine(sentence));
  if (kept.length === sentences.length) return companion;
  log.info({ dropped: sentences.length - kept.length }, 'CRISIS_COMPANION_OWN_LINE');
  return kept.join(' ') || undefined;
}
