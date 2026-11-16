/**
 * Whether the caller's whole turn is a yes and nothing else (HANDOFF_HELD_TRUTHFUL, #3755).
 *
 * Only picks the wording of a held handoff: after a bare yes to an offer that didn't say
 * the teammate's name, Ferni confirms by name ("Alex, yeah?") instead of guessing. It
 * never counts as consent; that stays with handoffConsent (handoff-consent.ts).
 *
 * @module tools/handoff/bare-yes
 */

/** Sounds that carry nothing: "um, sure", "oh, okay", "well, yeah". */
const FILLER = 'um|umm|uh|oh|well|hmm|ah';

/** Words that agree, apostrophes dropped ("let's" is "lets"). */
const AGREES =
  'yes|yeah|yep|yup|sure|ok|okay|alright|all right|absolutely|definitely|totally|of course|for sure|' +
  'go ahead|go for it|do it|lets do it|lets do that|do that|why not|sounds good|sounds great|' +
  'thatd be great|that would be great|please|please do|sure thing|mm hmm|mhm|mm hm|uh huh|' +
  'i would|id love that|i would love that|id like that|i would like that|then';
/** Politeness: fine beside a yes, not a yes on its own ("Thanks." may only be polite). */
const POLITE = 'thanks|thank you';

const ONLY = (alternatives: string): RegExp => new RegExp(`^(?:(?:${alternatives})(?: |$))+$`);
const ALL_AGREEING = ONLY(`${AGREES}|${POLITE}|${FILLER}`);
const ONLY_POLITE = ONLY(`${POLITE}|${FILLER}|then`);

/** The words of a reply, lowercased, apostrophes dropped, punctuation gone. */
const wordsOf = (said: string): string =>
  said
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w !== '')
    .join(' ');

/**
 * "Sure.", "Yeah, go ahead.", "Mm-hmm.", "Okay, let's do that." Any other word means they
 * said something besides yes ("Yes, read the list", "Yeah, but not now", "Yes. No."). Not
 * a yes: a question ("Okay?"), a number ("Yes, 5."), thanks alone.
 */
export function bareYes(said: string): boolean {
  if (said.trim().endsWith('?') || /\d/.test(said)) return false;
  const words = wordsOf(said);
  return ALL_AGREEING.test(words) && !ONLY_POLITE.test(words);
}
