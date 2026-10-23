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

const lastBreak = (text: string, at: number): number =>
  Math.max(...['.', '!', '?', ';'].map((c) => text.lastIndexOf(c, at)));

/**
 * The clause around a match (its words before and after, up to the nearest sentence break), and
 * the sentence before it and the one after it.
 */
function clauseOf(
  text: string,
  from: number,
  to: number
): { prev: string; before: string; after: string; next: string } {
  const start = lastBreak(text, from - 1) + 1;
  const tail = text.slice(to).search(/[.!?;]/);
  const end = tail < 0 ? text.length : to + tail;
  const nextEnd = text.slice(end + 1).search(/[.!?;]/);
  return {
    prev: start > 0 ? text.slice(lastBreak(text, start - 2) + 1, start - 1) : '',
    before: text.slice(start, from),
    after: text.slice(to, end),
    next:
      end < text.length ? text.slice(end + 1, nextEnd < 0 ? text.length : end + 1 + nextEnd) : '',
  };
}

/** "so I don't", "so that I won't", "if I don't": a purpose or condition, not a negation. */
const PURPOSE_NOT =
  /\b(so( that)?|if|unless|or( else)?|in case|before) i (don'?t|do not|won'?t|will not|can'?t|wouldn'?t) $/;

/** First person anywhere in the clause: "lets end it all, me and you, tonight" is the caller. */
const FIRST_PERSON = /\b(i|i'm|im|i'll|i'd|i've|me|my|myself|us|our)\b/;
/** A named other subject right before the verb: "lets end it all", "this season finale ended it all". */
const OTHER_SUBJECT =
  /\b(let'?s|lets|we|we'll|they|they'll|he|she|you|(this|that|the) (\w+ )?(finale|episode|season|show|series|movie|film|game|match|band|team|party|concert|book|story|war|storm|meeting)) ((just|gonna|going to|will|'ll|can|finally|really|totally) )*$/;

/**
 * A means, a place or plain intent: in the clause, the sentence before or the next one, no idiom
 * exempts the words ("killing myself over this exam with pills", "I have pills. I almost killed
 * myself on the stairs", "…on the stairs. next time I'll finish it").
 */
const MEANS_OR_INTENT =
  /\b(next time|on purpose|intentionally|deliberately|for real|for good|wanted to|wish i (had|could)|wanted it (to be )?over|finish (it|the job)|try again|do it again|pills?|gun|rope|blade|knife|razor|bridge|roof|ledge|train|tracks|overdose)\b/;
/**
 * The caller's own future in the clause ("…on the stairs, I'll try again"). Only in the clause:
 * "I killed myself laughing. I'll send you the clip" is no risk. "ill" and "gunna" are how
 * speech-to-text often writes "I'll" and "gonna", so they count before a verb of doing.
 */
const FUTURE_IN_CLAUSE =
  /\b(i will|i'll|i'm going to|(ill|gunna) (do|try|make|be|go|finish|end))\b/;
/**
 * A time in the clause: no idiom exempts the words ("killing myself over this exam tonight").
 * With "let's" or "we", which include the caller, any time keeps "end it all" theirs.
 */
const TIME_IN_CLAUSE = /\b(tonight|tomorrow|today|right now|soon|this (week|weekend))\b/;
const ANY_TIME =
  /\b(tonight|tonite|tomorrow|today|now|soon|later|this (morning|afternoon|evening|week|weekend)|at (midnight|noon|dawn|\d{1,2}(:\d\d)? ?([ap]m)?)|next (week|month)|in (a|an|\d+|a few) (minute|hour|day)s?)\b/;
const WITH_CALLER =
  /\b(let'?s|lets|we|we'll) ((just|going to|will|'ll|can|finally|really|totally) )*$/;

/** The floor's words in an everyday idiom, or "end it all" said with another subject. */
function endingIdiom(text: string, from: number, to: number, words: string): boolean {
  const { prev, before, after, next } = clauseOf(text, from, to);
  const clause = `${before} ${after}`;
  if (TIME_IN_CLAUSE.test(clause) || FUTURE_IN_CLAUSE.test(clause)) return false;
  if (MEANS_OR_INTENT.test(`${prev} ${clause} ${next}`)) return false;
  if (WITH_CALLER.test(before) && ANY_TIME.test(clause)) return false;
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
