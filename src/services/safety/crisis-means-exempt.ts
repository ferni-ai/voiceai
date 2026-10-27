/**
 * The one everyday exemption the means-in-hand forms take (crisis-means-in-hand.ts, #2697). It can
 * only hold back the new imminent read those forms add, never a read main already gives: the
 * crisis sweep (#2768) proves 0 lowered.
 *
 * Scope is the sub-clause around each means token in the match, never the message; every token
 * must be covered:
 * - pills: the caller's own medication, "my pills" with no word between or only allowlisted ones
 *   ("my heart pills"), or a check-in phrase ("like always", "with food"). Any other word, a
 *   possessive above all ("my stepdad's pills"), is not a check-in. Pills never take a setting.
 * - a weapon, rope or blade (means-in-hand form only): a stated everyday purpose ("at the range").
 * - never: means on the body, an overdose by count or dose word, "i did it", cutting now.
 * Words that make it imminent anywhere in the message (an amount, "them now", a goodbye) cancel it.
 *
 * @module CrisisMeansExempt
 */

import { MEANS_WORDS, PILL_KIND, RUN_ON } from './crisis-means-words.js';

export type MeansKind = 'pills' | 'means';

const BREAK = /[.!?;,]|\b(?:but|and|so)\b/g;
/** Every means word the forms can match, longest first: built from their own lists. */
export const TOKEN = new RegExp(
  String.raw`\b(${[...MEANS_WORDS].sort((a, b) => b.length - a.length).join('|')})\b`,
  'g'
);
const MODIFIER = String.raw`(?:heart|blood pressure|bp|morning|night|nighttime|evening|daily|allergy|allergies|thyroid|cholesterol|diabetes|vitamin|vitamins|anxiety|anti anxiety|anti-anxiety|asthma|seizure|birth control|iron|adhd|stomach|reflux|migraine|usual|regular|prescription)`;
const MY_MEDS = new RegExp(
  String.raw`(?<!\ball )\bmy (?:${MODIFIER} ){0,2}(?:pills|meds|medication|medicine|prescription)\b`
);
const CHECK_IN =
  /\b(like always|as usual|with (food|water|breakfast|lunch|dinner)|as (directed|prescribed)|(the |my )?doctor (said|told me|prescribed|wants|ordered)|every (day|night|morning|evening)|before bed|at bedtime|refill)\b/;
const PURPOSE =
  /\b(shav(e|es|ed|ing)|belay(ing)?|(for|at|on) (the |a )?(range|shooting range|hunt|hunting trip|target practice|camping trip|climbing gym|deer stand)|hunting|target practice|jump rope|costume|prop|halloween|rehearsal)\b/;
/** Imminent whatever the setting: an amount, "them now", a goodbye (the forms' own run-on list). */
const IMMINENT_WORDS = new RegExp(
  String.raw`\ball\b|whole bottle|entire bottle|every (?:last |single )?(?:one|pill)|handful|bunch|\b(?:[2-9]\d|\d{3})\b(?! ?(?:mg|mcg|units?|ml|iu|g)\b)|\b(?:them|em|these|those)(?: all)? (?:now|right now)\b|\b(?:${RUN_ON})\b`
);

/** The sub-clause of `text` that holds position `at`. */
function clauseAt(text: string, at: number): string {
  let from = 0;
  let to = text.length;
  for (const b of text.matchAll(BREAK)) {
    if (b.index + b[0].length <= at) from = b.index + b[0].length;
    else if (b.index >= at) {
      to = b.index;
      break;
    }
  }
  return text.slice(from, to);
}

/** Whether the everyday exemption holds back this match's new imminent read. */
export function exemptedMeans(
  text: string,
  start: number,
  end: number,
  kind: MeansKind | undefined
): boolean {
  if (!kind || IMMINENT_WORDS.test(text)) return false;
  // Every means token in the match must be covered in its own sub-clause: "i took my meds and i
  // have the gun right here" matches from "meds" to "right here", and the gun is not covered.
  const tokens = [...text.slice(start, end).matchAll(TOKEN)];
  return (
    tokens.length > 0 &&
    tokens.every((token) => {
      const clause = clauseAt(text, start + token.index);
      if (kind === 'pills' || PILL_KIND.has(token[1])) {
        return MY_MEDS.test(clause) || CHECK_IN.test(clause);
      }
      return PURPOSE.test(clause);
    })
  );
}
