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
 * @module agents/personas/director-stt-slips
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { Cast } from './director-cast.js';

/** DIRECTOR_STT_SLIPS=on: the director treats an odd word as a mishearing. */
export function directorSttSlipsEnabled(env: Env = process.env): boolean {
  return flagOn('DIRECTOR_STT_SLIPS', env);
}

/** The rule for the guard rule (director-guard.ts), with a leading space; '' with the flag off. */
export function sttSlipRuleFor(c: Cast, env: Env = process.env): string {
  if (!directorSttSlipsEnabled(env)) return '';
  return ` The caller's words reach you through speech-to-text, which mishears: "it's going pretty good for him" was "for me". One word that doesn't fit what they're saying (a pronoun, a name, a word that sounds like another) is a mishearing, not something they meant. Never write a note about it, and never tell ${c.p.object} to point it out, question it or repeat it: ${c.name} answers what they meant.`;
}
