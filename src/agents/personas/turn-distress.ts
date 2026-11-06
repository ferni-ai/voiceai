/**
 * Distress in the caller's own turn: the director's mood reading
 * (callerHeavyLately: hard news, hard words, heavy moments) and the cues it
 * misses ("I'm completely alone", "falling apart", "not okay"). A turn note
 * that steers a light or brief reply stays off a turn like this: the
 * caller-sets-depth note ("I'm fine, I just can't stop crying" is not fine)
 * and the unearned-correction note (correction-repair.ts).
 *
 * Not a crisis reader: crisis guidance comes from services/safety alone.
 *
 * @module agents/personas/turn-distress
 */

import { callerHeavyLately } from '../../speech/tts-gateway/director/emotion-lift.js';

/** What callerHeavyLately misses. Whole words. */
const DISTRESS =
  /\b(?:alone|lonely|scared|afraid|terrified|crying|cried|tears|can'?t (?:sleep|cope|breathe|stop)|falling apart|overwhelm\w*|numb|empty|panic\w*|hurting|broken|not okay|not fine|struggling)\b/i;

/** Whether the caller's words carry distress, read the way caller-sets-depth always has. */
export function carriesDistress(said: string): boolean {
  return callerHeavyLately([said]) || DISTRESS.test(said);
}
