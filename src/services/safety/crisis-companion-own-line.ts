/**
 * CRISIS_COMPANION_EXCLUDES_OWN_LINE (off, #4208): the read after a crisis turn is not given
 * Ferni's own crisis line as its context.
 *
 * After one alarm, COMPANION (Ferni's line just before the caller's words) is Ferni's referral
 * to 988 or 911, and the prompt says context never lowers that risk: the caller's pushback read
 * imminent on every turn after, until hang-up. With the flag on, on a call with crisis risk
 * noted, the read leaves out each sentence of Ferni's line that gives a crisis line and asks
 * nothing. Ferni's questions stay ("Are you safe right now?", "Is anyone nearby who can be
 * with you?"): a caller's "no", or a name, is read with them (#3465). Only while nothing besides
 * one classifier read has confirmed the risk: once a pattern, two reads agreeing or an
 * after-check confirms it (noteCrisisConfirmed), every read sees Ferni's line whole. The caller's own words (LATEST, EARLIER) are never touched, and the turn's reads keep
 * their keys: only what the model is shown changes.
 *
 * Logs a count of sentences left out, never the words.
 *
 * @module CrisisCompanionOwnLine
 */

import { crisisConfirmedThisCall, crisisRiskNoted } from './crisis-call-risk.js';
import type { CrisisClassifierInput } from './crisis-classifier.js';
import { names911, offersCrisisLine } from './crisis-line-speech.js';
import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';

const log = createLogger({ module: 'CrisisCompanionOwnLine' });

type Env = Record<string, string | undefined>;

function resolveCompanionExcludesOwnLine(env: Env = process.env): boolean {
  return env.CRISIS_COMPANION_EXCLUDES_OWN_LINE?.trim().toLowerCase() === 'on';
}

/**
 * As much of Ferni's line as a crisis read is shown: its end, which LATEST answers. The
 * classifier keeps this much (normalizeInput), and the strip here counts the same sentences.
 */
export const COMPANION_READ_CHARS = 400;
/**
 * The raw tail read before SSML is stripped: room for markup around the last 400 characters,
 * and a bound on the work whatever the line's length.
 */
const MAX_RAW_CHARS = COMPANION_READ_CHARS * 5;

/** A sentence that hands the caller a line to call or text, and asks them nothing. */
const givesCrisisLine = (sentence: string): boolean =>
  !sentence.includes('?') && (offersCrisisLine(sentence) || names911(sentence));

/**
 * Ferni's line as this read should see it. Unchanged unless the flag is on, the call has crisis
 * risk noted but not confirmed, and the line gives a crisis line; then without those sentences, or none at all
 * when the line was only that.
 */
function companionForRead(
  companion: string | undefined,
  call: string | undefined,
  env: Env = process.env
): string | undefined {
  if (!companion || !call || !resolveCompanionExcludesOwnLine(env)) return companion;
  // Only an unconfirmed alarm: once a crisis is confirmed, crisis turns go on for the call.
  if (!crisisRiskNoted(call) || crisisConfirmedThisCall(call)) return companion;
  const sentences = stripSSML(companion.slice(-MAX_RAW_CHARS))
    .trim()
    .slice(-COMPANION_READ_CHARS)
    .split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !givesCrisisLine(sentence));
  if (kept.length === sentences.length) return companion;
  log.info({ dropped: sentences.length - kept.length }, 'CRISIS_COMPANION_OWN_LINE');
  return kept.join(' ') || undefined;
}

/**
 * The input a read of this call is shown: the same input, or a copy with Ferni's line as
 * companionForRead leaves it. The turn's reads and the confirmed-risk after-check both read
 * through it, so neither sees Ferni's own crisis line on an unconfirmed call.
 */
export function inputForRead(
  input: CrisisClassifierInput,
  call: string | undefined,
  env: Env = process.env
): CrisisClassifierInput {
  const companion = companionForRead(input.companion, call, env);
  return companion === input.companion ? input : { ...input, companion };
}
