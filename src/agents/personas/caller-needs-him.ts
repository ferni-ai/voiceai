/**
 * Whether the caller needs him: the one composite safety read for Ferni's own
 * state (ferni-state.ts, porch-light.ts) and for SELF_SHARE_STAY_WHEN_ASKED
 * (self-share-stay.ts). Moved here from ferni-state.ts unchanged; with
 * `everyReader` it also counts every other safety reader, for the stay only.
 *
 * @module agents/personas/caller-needs-him
 */

import { abuseDisclosure, selfHarmWords } from '../../services/safety/abuse-disclosure.js';
import { statesUnder18 } from '../../utils/minor-care-detect.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { CRISIS_TALK } from './emergency-claim.js';
import { callerVenting } from './turn-extras.js';
import { hardNews } from './turn-candor.js';

/** Tiredness alone ("ugh, long day") isn't distress. */
const TIRED = /\b(?:tired|exhausted|sleepy|long day)\b/gi;
/** An emergency in their words: chest pain, can't breathe, collapsed (emergency-claim.ts). */
const EMERGENCY = new RegExp(`\\b(?:${CRISIS_TALK})\\b`, 'i');

/**
 * The caller needs him: hard news, a crisis, or distress (venting about more
 * than being tired). With `everyReader` (SELF_SHARE_STAY_WHEN_ASKED=on: may
 * his answer about himself stop there?), any safety reader at all: a crisis
 * signal of any strength, an abuse disclosure, self-harm words, a caller who
 * says they're under 18 (whether or not MINOR_CARE is on), or an emergency.
 * Verifier 2026-11-05 (#3476 r3): one turn after "He hit me again last night."
 * or chest pain with a numb arm, a plain "How was your day?" got the stay.
 */
export function callerNeedsHim(said: string, mood?: string, everyReader = false): boolean {
  if (mood === 'bad_news') return true;
  if (hardNews(said) || callerVenting(said.replace(TIRED, ''))) return true;
  const crisis = detectCrisis(said);
  if (!everyReader) return crisis.isCrisis;
  return (
    crisis.isCrisis ||
    crisis.indicators.length > 0 ||
    abuseDisclosure(said) !== null ||
    selfHarmWords(said) ||
    statesUnder18(said) ||
    EMERGENCY.test(said)
  );
}
