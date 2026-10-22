/**
 * The action-claim guard's emergency half (#1553, action-claim-guard.ts).
 *
 * Ferni saying he called emergency services or help is always false: he can't
 * reach them, whatever the tools did. "Help is on the way" is false too when
 * the caller's words are about an emergency, unless they said help was already
 * called (emergency-claim.ts). The line says he hasn't called them and to call
 * 911 or 988 now, once per reply; the rest of that sentence follows.
 *
 * @module agents/personas/emergency-correction
 */
import { claimedAction, emergencyClaim, emergencyRemainder } from './action-claims.js';
import { crisisInPlay, EMERGENCY_LINE, helpAlreadyCalled } from './emergency-claim.js';

/** For one reply: whether a sentence makes a false emergency claim. */
export function emergencyCheck(chatCtx: { items: readonly unknown[] }): (text: string) => boolean {
  // "Help is on the way" is false only in an emergency nobody has called about yet.
  const crisis = crisisInPlay(chatCtx) && !helpAlreadyCalled(chatCtx);
  return (text) => {
    const claim = emergencyClaim(text);
    return claim === 'called' || (claim === 'coming' && crisis);
  };
}

/**
 * For one reply: what replaces a false emergency claim. `line` is the way to
 * real help, given once even after another honest line ('' after that).
 * `rest` is a held sentence's other words ("start chest compressions"), never
 * judged again (re-reading it as an emergency would recurse); any action claim
 * left in it is dropped. Streamed words are already out, so `rest` is ''.
 */
export function emergencyCorrection(): (
  text: string,
  hold: boolean
) => { line: string; rest: string } {
  let told = false;
  return (text, hold) => {
    const line = told ? '' : hold ? EMERGENCY_LINE : `Scratch that, ${EMERGENCY_LINE}`;
    told = true;
    const rest = hold ? emergencyRemainder(text) : '';
    return { line, rest: rest && rest !== text && claimedAction(rest) === null ? rest : '' };
  };
}
