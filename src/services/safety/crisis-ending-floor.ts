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

/**
 * How far around a match the floor looks. Every look is bounded, so a long message costs time
 * in proportion to its length (#2538: an 80 KB message took 3.8 s when each match re-scanned
 * the whole text). Messages shorter than this are judged exactly as before.
 */
const REACH = 1000;

/**
 * The clause around a match (its words before and after, up to the nearest sentence break) and
 * the next sentence after it, each within REACH.
 */
function clauseOf(
  text: string,
  from: number,
  to: number
): { before: string; after: string; next: string } {
  const back = text.slice(Math.max(0, from - REACH), from);
  const start = Math.max(...['.', '!', '?', ';'].map((c) => back.lastIndexOf(c))) + 1;
  const ahead = text.slice(to, to + 2 * REACH);
  const end = ahead.search(/[.!?;]/);
  const after = end < 0 ? ahead : ahead.slice(0, end);
  const rest = end < 0 ? '' : ahead.slice(end + 1);
  const nextEnd = rest.search(/[.!?;]/);
  return { before: back.slice(start), after, next: nextEnd < 0 ? rest : rest.slice(0, nextEnd) };
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
 * A means, a place or intent in the clause or the next sentence: then no idiom exempts the
 * words ("killing myself over this exam with pills", "…on the stairs. next time I'll finish
 * it", "I almost killed myself on purpose"). A time alone ("I killed myself laughing today")
 * cancels nothing, except for "end it all" said with "let's" or "we", which include the caller.
 */
const MEANS_OR_INTENT =
  /\b(on purpose|intentionally|deliberately|for real|for good|next time|wanted to|want(ed)? to stop|wish i (had|could)|wanted it (to be )?over|(might|will|gonna|going to) do it|finish (it|the job)|do it again|pills?|gun|rope|blade|knife|razor|bridge|roof|ledge|train|tracks|overdose)\b/;
const TIME = /\b(tonight|tomorrow|right now|this (week|weekend))\b/;
const WITH_CALLER =
  /\b(let'?s|lets|we|we'll) ((just|gonna|going to|will|'ll|can|finally|really|totally) )*$/;

/** The floor's words in an everyday idiom, or "end it all" said with another subject. */
function endingIdiom(text: string, from: number, to: number, words: string): boolean {
  const { before, after, next } = clauseOf(text, from, to);
  if (MEANS_OR_INTENT.test(`${before} ${after} ${next}`)) return false;
  const span = `${words}${after}`;
  if (ENDING_IDIOMS.some((re) => re.test(span))) return true;
  if (ENDING_IDIOM_BEFORE.test(before) && ENDING_ACCIDENT.test(span)) return true;
  if (!/it all$/.test(words) || FIRST_PERSON.test(`${before} ${after}`)) return false;
  if (WITH_CALLER.test(before) && TIME.test(`${before} ${after}`)) return false;
  return OTHER_SUBJECT.test(before);
}

/** Where the floor's words start once modals and fillers before them are skipped ("I could "). */
const MODAL_BEFORE =
  /\b(could|might|may|would|will|should|must|can|just|really|probably|definitely|literally|totally|gonna|wanna|gotta)\s+$/;
function withoutModal(text: string, from: number): number {
  // Within REACH: a run of fillers longer than that is no longer one phrase.
  const base = Math.max(0, from - REACH);
  const back = text.slice(base, from);
  let at = back.length;
  for (let m = MODAL_BEFORE.exec(back.slice(0, at)); m; m = MODAL_BEFORE.exec(back.slice(0, at))) {
    at = m.index;
  }
  return base + at;
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
    // The modifier reads a window around the words, so each match costs at most 2 * REACH.
    const base = Math.max(0, from - REACH);
    const window = text.slice(base, to + REACH);
    let modifier = explicitModifier(window, withoutModal(text, from) - base, to - base, false);
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
