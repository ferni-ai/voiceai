/**
 * Which dates the hello may ask about, and who a sensitive one is about
 * (docs/plans/2026-10-31-right-moment-memory.md §5.5, ruling 1).
 *
 * A date is sensitive when recall's sensitive rule says so, when it names a
 * health word, or when it names no ordinary event at all: "Rose, 10am at
 * St. Mary's" says neither, and a false "ordinary" asks a question about
 * someone's surgery, while a false "sensitive" only costs a plainer hello.
 * Whole words only ("scanner" is not "scan").
 *
 * @module intelligence/world-model/dates/sensitive-date
 */
import { isSensitiveThread } from '../../../memory/index.js';

const HEALTH =
  /\b(?:surgery|surgeries|procedures?|appointments?|biops(?:y|ies)|scans?|chemo|therapy|hospital|test results|doctors?|clinic|operations?|treatments?|diagnosis|mri|x-rays?|funerals?|memorials?|medical)\b/i;

/** Events a friend can ask about lightly. Anything not on this list is unsure, so sensitive. */
const ORDINARY_EVENT =
  /\b(?:visits?|trips?|vacation|holidays?|party|parties|birthdays?|anniversary|wedding|shower|graduation|recitals?|concerts?|shows?|play|games?|match(?:es)?|tournament|race|marathon|interviews?|meetings?|presentation|launch|dinner|lunch|brunch|reunion|celebration|festival|flight|move|pickup|class(?:es)?|lessons?|practice|rehearsal|gig|opening|retirement|ceremony|camp|sleepover|playdate|picnic|barbecue|hike)\b/i;

/** The ruling 1 lexicon, then a capitalised name when one follows ("sister Priya"). */
const RELATION =
  /\b(mom|dad|mother|father|sister|brother|wife|husband|partner|son|daughter|grandma|grandpa|friend)\b('s|’s)?/i;
const NAME = /^\s+(\p{Lu}[\p{L}-]*)/u;

const sensitiveWords = (text: string): boolean => isSensitiveThread(text) || HEALTH.test(text);

/** True when the hello must not ask about this date or say what it is. Unsure is true. */
export function sensitiveDate(label: string): boolean {
  if (!/\p{L}/u.test(label)) return true;
  return sensitiveWords(label) || !ORDINARY_EVENT.test(label);
}

/** "grandma", "sister Priya": who the date is about, from the label, or null. */
export function personFromLabel(label: string): string | null {
  const m = RELATION.exec(label);
  const relation = m?.[1]?.toLowerCase();
  if (!m || !relation) return null;
  if (m[2]) return relation; // "mom's surgery": no name follows a possessive
  const name = NAME.exec(label.slice(m.index + m[0].length))?.[1]; // "Rose's" stops at the '
  return name && !sensitiveWords(name) ? `${relation} ${name}` : relation;
}
