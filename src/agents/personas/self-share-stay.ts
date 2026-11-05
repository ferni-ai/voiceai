/**
 * When an answer about himself may stop there (SELF_SHARE_STAY_WHEN_ASKED=on, #3475).
 *
 * "Leave it there, no question back" and "answer about yourself before
 * anything else" fit a turn that only asks about him. Verifier 2026-11-05
 * (#3476 r2): turns that asked about him and then told something of the
 * caller's own got both lines: "What'd you get up to today? He hit me again
 * last night.", "How are you? My chest really hurts and my left arm is numb.",
 * "What'd you get up to today? I'm 14 and my stepdad said not to tell anyone
 * what he does." Main asks those callers something back. So the stay needs:
 *
 * - nothing before the ask but lead-in words ("Okay, so", "Enough about
 *   me."), so no news of theirs and no question they report ("my sister asked
 *   me how was your day", "my boss goes, what did you do to the printer?");
 * - nothing of their own after it (their own words or their people's);
 * - no risk read on the turn (the safety readers below, unchanged) and none
 *   noted earlier on the call (crisis risk, a likely minor).
 *
 * Off, nothing here is read.
 *
 * @module agents/personas/self-share-stay
 */

import { abuseDisclosure, selfHarmWords } from '../../services/safety/abuse-disclosure.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { likelyMinor } from '../../utils/minor-care.js';
import { statesUnder18 } from '../../utils/minor-care-detect.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { CRISIS_TALK } from './emergency-claim.js';
import { hardNews } from './turn-candor.js';

const EMERGENCY = new RegExp(`\\b(?:${CRISIS_TALK})\\b`, 'i');

/**
 * Any safety reader marks this turn: a crisis signal of any strength, an
 * abuse disclosure, self-harm words, a caller under 18, an emergency in their
 * words (chest, can't breathe, collapsed...), or hard news.
 */
export function riskRead(said: string): boolean {
  return (
    EMERGENCY.test(said) ||
    abuseDisclosure(said) !== null ||
    selfHarmWords(said) ||
    statesUnder18(said) ||
    hardNews(said) ||
    detectCrisis(said).indicators.length > 0
  );
}

/** Risk noted earlier on this call: a crisis read (crisis-call-risk.ts) or a likely minor (minor-care.ts). */
export function riskOnCall(sessionId: string | undefined, said?: string): boolean {
  return !!sessionId && (crisisRiskThisCall(sessionId, said) || likelyMinor(sessionId));
}

/** "Enough about me": turning it round to him is no news of theirs. */
const ENOUGH_ABOUT_ME = /\b(?:that's |ok(?:ay)? )?enough about me\b/gi;
/** The words a turn that only asks may open with: "Okay, so", "No, actually, like,", "Huh. Okay. And". */
const LEAD_IN =
  /^(?:\W*\b(?:ok(?:ay)?|alright|all right|so|well|huh|hm+|oh|ah|no|nah|yeah|yes|yep|actually|like|anyway|anyways|right|hey|hi|hello|wait|um+|uh+|and|but|or|really|seriously|honestly|fine|cool|haha+|lol|sure|then|now|ferni)\b)*\W*$/i;

/**
 * Nothing before the ask but lead-in words: no news of theirs ("Stepdad hit me
 * again. Anyway, what'd you do today?") and no one else's question they report
 * ("my sister asked me how was your day", "my coworker goes, what'd you...").
 */
export function onlyLeadIn(before: string): boolean {
  const t = before.replace(/[‘’]/g, "'").replace(ENOUGH_ABOUT_ME, '');
  return t.length <= 80 && LEAD_IN.test(t);
}

/** Words that make what follows the ask the caller's own: about them, or someone in their life. */
const THEIR_OWN =
  /\b(?:i|i'm|im|i've|i'd|i'll|me|my|mine|myself|we|we're|us|our|ours|he|he's|him|his|she|she's|her|hers|they|they're|them|their)\b/i;
/** Past this many words, what follows the ask is a share of their own, whatever it says. */
const TAIL_WORDS = 8;

/** Nothing of theirs after the ask: ", or kind of a weird one?" is still the ask; "My chest hurts." is not. */
export function nothingOfTheirs(tail: string): boolean {
  const t = tail.replace(/[‘’]/g, "'");
  return !THEIR_OWN.test(t) && (t.match(/[\w']+/g)?.length ?? 0) <= TAIL_WORDS;
}
