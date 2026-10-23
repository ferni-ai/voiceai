/**
 * The tense a sentence about a time is in, from its verbs, for resolveTimes'
 * tense input: "I saw her on the 9th" is the 9th just gone, "seeing her on
 * the 9th" the next one. Past only on a verb that dates the event itself: a
 * reporting or arranging verb ("mentioned", "booked") says nothing about when
 * the event is, so with one the tense is unknown, not past.
 * @module understanding/temporal/tense
 */
import type { Tense } from './civil.js';

/** Past forms that date the event: "saw her", "had my interview". */
const EVENT_PAST =
  /\b(was|were|had|did|went|saw|met|got|came|made|took|gave|left|ate|ran|felt|bought|brought|heard|found|sat|spoke|wrote|drove|flew|slept|spent|kept|lost|won|paid|began|became|broke|fell|stood|sang|swam|threw|wore|woke|rode|caught|fought|held|sold)\b/i;
/** Past forms that report or arrange it, which leave its tense open. */
const OTHER_PAST =
  /\b(said|told|thought|knew|forgot|sent|set up|signed up|talked|discussed|mentioned|shared|asked|wondered|worried|decided|agreed|promised|booked|scheduled|planned|arranged|registered|rescheduled|moved|postponed|pushed|invited|confirmed|reminded|hoped|wanted|needed)\b/i;
/** A lowercase regular past ("visited"); names ("Jared") are capitalized. */
const REGULAR_PAST = /\b[a-z]{3,}ed\b/g;
/** Not past forms: "-eed" words ("need", "speed") and a few adjectives. */
const NOT_PAST = /eed$|^(hundred|kindred|sacred|naked|wicked|rugged|ragged|crooked|beloved)$/;
/** "I'm excited", "getting married": an -ed after these is not a past event. */
const BEFORE_ADJECTIVE =
  /\b(am|is|are|'m|'re|be|been|being|get|gets|getting|feel|feeling|so|really|very)\s+$/i;
const FUTURE =
  /\b(will|won't|shall|gonna|going to|about to|plan(?:s|ning)? to|have to|has to|hop(?:e|ing) to|can't wait|looking forward|upcoming|coming up|tomorrow|next)\b|'ll\b|\b(?:am|is|are|'m|'re) \w+ing\b/i;

function regularEventPast(text: string): boolean {
  for (const m of text.matchAll(REGULAR_PAST)) {
    const word = m[0];
    if (NOT_PAST.test(word) || OTHER_PAST.test(word)) continue;
    if (!BEFORE_ADJECTIVE.test(text.slice(0, m.index))) return true;
  }
  return false;
}

/** Any past-tense verb, including those that leave the event's tense open. */
export function hasPastVerb(text: string): boolean {
  return EVENT_PAST.test(text) || OTHER_PAST.test(text) || regularEventPast(text);
}

/** 'past' or 'future' when the verbs agree; undefined when mixed or silent. */
export function sentenceTense(text: string): Tense | undefined {
  const past = EVENT_PAST.test(text) || regularEventPast(text);
  const future = FUTURE.test(text);
  if (past === future) return undefined;
  return past ? 'past' : 'future';
}
