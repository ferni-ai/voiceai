/**
 * The first-person ending floor (#2525): where FIRST_PERSON_ENDING matches in a message, and
 * how its clause softens it. crisis-guard.ts scores the result the way it scores its tiers.
 *
 * @module CrisisEndingFloor
 */

import { explicitModifier, type ExplicitModifier } from './crisis-modifiers.js';
import {
  ENDING_ACCIDENT,
  ENDING_IDIOMS,
  ENDING_IDIOM_BEFORE,
  FIRST_PERSON_ENDING,
} from './crisis-patterns.js';

/** The clause around a match: its words before and after, up to the nearest sentence break. */
function clauseOf(text: string, from: number, to: number): { before: string; after: string } {
  const start = Math.max(...['.', '!', '?', ';'].map((c) => text.lastIndexOf(c, from - 1))) + 1;
  const tail = text.slice(to).search(/[.!?;]/);
  return {
    before: text.slice(start, from),
    after: text.slice(to, tail < 0 ? text.length : to + tail),
  };
}

/** "so I don't", "so that I won't", "if I don't": a purpose or condition, not a negation. */
const PURPOSE_NOT =
  /\b(so( that)?|if|unless|or( else)?|in case|before) i (don'?t|do not|won'?t|will not|can'?t|wouldn'?t) $/;

/** First person anywhere in the clause: "lets end it all, me and you, tonight" is the caller. */
const FIRST_PERSON = /\b(i|i'm|im|i'll|i'd|i've|me|my|myself|us|our)\b/;
/** Another subject right before the verb: "lets end it all", "this season finale ended it all". */
const OTHER_SUBJECT =
  /\b(let'?s|lets|we|we'll|they|they'll|he|she|you|it|(this|that|the) \w+( \w+)?) ((just|gonna|going to|will|'ll|can|finally|really|totally) )*$/;

/** The floor's words in an everyday idiom, or "end it all" said with another subject. */
function endingIdiom(text: string, from: number, to: number, words: string): boolean {
  const { before, after } = clauseOf(text, from, to);
  const span = `${words}${after}`;
  if (ENDING_IDIOMS.some((re) => re.test(span))) return true;
  if (ENDING_IDIOM_BEFORE.test(before) && ENDING_ACCIDENT.test(span)) return true;
  if (!/it all$/.test(words) || FIRST_PERSON.test(`${before} ${after}`)) return false;
  return OTHER_SUBJECT.test(before);
}

/** Where the floor's words start once modals and fillers before them are skipped ("I could "). */
const MODAL_BEFORE =
  /\b(could|might|may|would|will|should|must|can|just|really|probably|definitely|literally|totally|gonna|wanna|gotta)\s+$/;
function withoutModal(text: string, from: number): number {
  let at = from;
  for (let m = MODAL_BEFORE.exec(text.slice(0, at)); m; m = MODAL_BEFORE.exec(text.slice(0, at))) {
    at = m.index;
  }
  return at;
}

/**
 * The floor's hit and its softening, or null: no ending words, an everyday idiom, or words a
 * tier already softened (they keep that softening). Judged as the tiers judge "I want to …":
 * the modal or filler before the words is skipped, so "this traffic is so bad I could kill
 * myself" is hyperbole as "… I want to kill myself" is. A purpose or a condition is not a
 * negation: "so I don't kill myself" is means restriction.
 */
export function endingFloor(
  text: string,
  softened: readonly (readonly [number, number])[]
): { modifier: ExplicitModifier; thirdParty: boolean } | null {
  // Every match counts: an idiom or softened first one never hides a later one (#2528).
  let best: ExplicitModifier | undefined;
  let thirdParty = false;
  for (const ending of text.matchAll(new RegExp(FIRST_PERSON_ENDING.source, 'g'))) {
    const from = ending.index;
    const to = from + ending[0].length;
    if (softened.some(([s, e]) => from < e && to > s) || endingIdiom(text, from, to, ending[0])) {
      continue;
    }
    let modifier = explicitModifier(text, withoutModal(text, from), to, false);
    if (modifier === 'negated' && PURPOSE_NOT.test(clauseOf(text, from, to).before))
      modifier = null;
    if (modifier === 'third_party') thirdParty = true;
    else if (best === undefined || rank(modifier) > rank(best)) best = modifier;
  }
  if (best === undefined) return thirdParty ? { modifier: 'third_party', thirdParty } : null;
  return { modifier: best, thirdParty };
}

/** Unsoftened beats a frame, which beats a negation, hyperbole or recovery. */
function rank(modifier: ExplicitModifier): number {
  if (!modifier) return 2;
  return modifier === 'negated' || modifier === 'hyperbole' || modifier === 'recovered' ? 0 : 1;
}
