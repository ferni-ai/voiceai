/**
 * A word the speech-to-text got wrong is not something the caller meant (#2438).
 *
 * Prod AJ_9BQYeZ6PvesX, 2026-10-22: asked how the morning was going, the caller's
 * answer came through as "it's going pretty good for him", most likely a
 * mishearing of "for me". The director wrote "He referred to himself as 'him' in
 * the third person. Don't let it slide." Ferni said things sounded good "for him",
 * the caller asked "For who?", and Ferni had to apologise. A later note in the
 * same call still read the word as meaningful ("He might be talking about a pet").
 *
 * A filter on the director's notes was tried first (#4276) and failed two rounds of
 * independent verification: every word list that caught the rewordings of "don't
 * let it slide" also dropped notes that matter ("She said she wrote goodbye
 * letters. Don't let that slide."). So, as with earlier-call-honest.ts, the rule
 * goes in at the source: guardRuleFor (director-guard.ts) carries it, so every
 * director and deliberator prompt does. It names the mishearing with the prod
 * example, because an example steers the model where a description doesn't.
 *
 * Offline A/B, 2026-11-26 (the live director model, temperature 0.7): a first
 * wording ("one word that doesn't fit ... is a mishearing") also taught the
 * director to wave off "I won't be around for it anyway" (flagged in 9 of 10 runs
 * without the rule, 3 of 10 with it). So the rule is narrowed to one swapped
 * pronoun or name. A second wording ("never write a note about that word") still
 * made the director go quiet: review found a goodbye line ("closing the book on it
 * all") flagged in 60/60 runs off and 42/60 on, every miss a bare NONE. So the rule
 * says to leave only the word out of notes, and that everything else gets notes
 * as usual. With this wording, four risk lines at 30 runs each got no note in 26
 * runs off and 13 on, and "he was flying" (for "I") got a note to ask about the
 * slip in 9/10 runs off and 0/10 on.
 *
 * @module agents/personas/director-stt-slips
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { Cast } from './director-cast.js';

/** DIRECTOR_STT_SLIPS=on: the director reads past a swapped pronoun or name. */
function directorSttSlipsEnabled(env: Env = process.env): boolean {
  return flagOn('DIRECTOR_STT_SLIPS', env);
}

/** The rule for the guard rule (director-guard.ts), with a leading space; '' with the flag off. */
export function sttSlipRuleFor(c: Cast, env: Env = process.env): string {
  if (!directorSttSlipsEnabled(env)) return '';
  return ` The caller's words reach you through speech-to-text, which sometimes swaps one pronoun or name: "it's going pretty good for him" was "for me". Read past a swapped word to what they meant and leave it out of your notes: never tell ${c.p.object} to point it out, question it or repeat it. Everything else they say means what it says and gets your notes as usual, above all a hint that they won't be around or might come to harm.`;
}
