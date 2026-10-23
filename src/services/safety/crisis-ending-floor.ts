/**
 * The first-person ending floor (#2525): where FIRST_PERSON_ENDING matches in a message, and
 * how its clause softens it. crisis-guard.ts scores the result the way it scores its tiers.
 *
 * @module CrisisEndingFloor
 */

import { explicitModifier, recoveredMessage, type ExplicitModifier } from './crisis-modifiers.js';
import {
  ENDING_ACCIDENT,
  ENDING_IDIOMS,
  ENDING_IDIOM_BEFORE,
  FIRST_PERSON_ENDING,
} from './crisis-patterns.js';

/**
 * How far around a match the floor looks: REACH before the words, 2 * REACH after them (the
 * clause and the next sentence). Every look is bounded, so a long message costs time in
 * proportion to its length (#2538: an 80 KB message took 3.8 s when each match re-scanned the
 * whole text). Messages shorter than this are judged exactly as before.
 */
const REACH = 1000;

/** A window edge never splits a word: "cannot" cut to "not" is no negation. Words over 64 chars aren't words. */
const WORD = /[\w']/;
export function snapStart(text: string, at: number): number {
  if (at <= 0) return 0;
  for (let i = at; i < Math.min(text.length, at + 64); i++) {
    if (!WORD.test(text[i - 1]) || !WORD.test(text[i])) return i;
  }
  return at;
}
export function snapEnd(text: string, at: number): number {
  if (at >= text.length) return text.length;
  for (let i = at; i > Math.max(0, at - 64); i--) {
    if (!WORD.test(text[i - 1]) || !WORD.test(text[i])) return i;
  }
  return at;
}

const lastBreak = (s: string): number =>
  Math.max(...['.', '!', '?', ';'].map((c) => s.lastIndexOf(c)));

/**
 * The clause around a match (its words before and after, up to the nearest sentence break), the
 * sentence before it and the next one after it, within the windows above. cut: the windows ended
 * before one of them did, so part of it is unread.
 */
function clauseOf(
  text: string,
  from: number,
  to: number
): { prev: string; before: string; after: string; next: string; cut: boolean } {
  const base = snapStart(text, Math.max(0, from - REACH));
  const back = text.slice(base, from);
  const start = lastBreak(back) + 1;
  const prevStart = start > 0 ? lastBreak(back.slice(0, start - 1)) + 1 : 0;
  const limit = snapEnd(text, to + 2 * REACH);
  const ahead = text.slice(to, limit);
  const end = ahead.search(/[.!?;]/);
  const after = end < 0 ? ahead : ahead.slice(0, end);
  const rest = end < 0 ? '' : ahead.slice(end + 1);
  const nextEnd = rest.search(/[.!?;]/);
  const cut =
    // prevStart is 0 when the clause or the sentence before it starts before the window.
    (base > 0 && prevStart === 0) || (limit < text.length && (end < 0 || nextEnd < 0));
  return {
    prev: start > 0 ? back.slice(prevStart, start - 1) : '',
    before: back.slice(start),
    after,
    next: nextEnd < 0 ? rest : rest.slice(0, nextEnd),
    cut,
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
 * A means, a place or intent in the clause, the sentence before it or the next one: then no
 * idiom exempts the words ("killing myself over this exam with pills", "I have pills. I almost
 * killed myself on the stairs", "…on the stairs, I'll try again"). A time alone ("I killed
 * myself laughing today") cancels nothing, except for "end it all" said with "let's" or "we",
 * which include the caller: then any time keeps it theirs.
 */
const MEANS_OR_INTENT =
  /\b(on purpose|intentionally|deliberately|for real|for good|next time|wanted to|want(ed)? to stop|wish i (had|could)|wanted it (to be )?over|(might|will|gonna|going to) do it|finish (it|the job)|do it again|try again|again|i will|i'll|i'm going to|i'm gonna|gonna|pills?|gun|rope|blade|knife|razor|bridge|roof|ledge|train|tracks|overdose)\b/;
const TIME =
  /\b(tonight|tonite|tomorrow|today|now|soon|later|this (morning|afternoon|evening|week|weekend)|at (midnight|noon|dawn|\d{1,2}(:\d\d)?( ?[ap]m)?)|next (week|month)|in (a|an|\d+) (minute|hour|day)s?)\b/;
const WITH_CALLER =
  /\b(let'?s|lets|we|we'll) ((just|gonna|going to|will|'ll|can|finally|really|totally) )*$/;

/** The floor's words in an everyday idiom, or "end it all" said with another subject. */
function endingIdiom(text: string, from: number, to: number, words: string): boolean {
  const { prev, before, after, next, cut } = clauseOf(text, from, to);
  // A sentence longer than the window is never exempt: the unread part could carry the risk.
  if (cut || MEANS_OR_INTENT.test(`${prev} ${before} ${after} ${next}`)) return false;
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
  const base = snapStart(text, Math.max(0, from - REACH));
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
  // Judged once on the whole message, as the tiers judge it, though each match reads a window.
  const recovered = recoveredMessage(text);
  for (const ending of text.matchAll(new RegExp(FIRST_PERSON_ENDING.source, 'g'))) {
    const from = ending.index;
    const to = from + ending[0].length;
    if (softened.some(([s, e]) => from < e && to > s) || endingIdiom(text, from, to, ending[0])) {
      continue;
    }
    // The modifier reads a window around the words, so each match costs at most 2 * REACH.
    const base = snapStart(text, Math.max(0, from - REACH));
    const window = text.slice(base, snapEnd(text, to + REACH));
    const at = withoutModal(text, from) - base;
    let modifier = explicitModifier(window, at, to - base, false, recovered);
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
