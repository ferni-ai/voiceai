/**
 * Which dates the hello may ask about, and who a sensitive one is about
 * (docs/plans/2026-10-31-right-moment-memory.md §5.5, ruling 1).
 *
 * Heavy first, and heavy always wins: recall's sensitive rule, or any word of
 * health, care, recovery, the law, money trouble, grief or a separation, so
 * "hospice visit" and "custody meeting" are sensitive whatever event word is in
 * them. Only a label with no heavy word that names a clearly ordinary event
 * ("Priya's visit", "date night") is ordinary; anything else, a label we can't
 * read included, is sensitive. A false "ordinary" asks a cheerful question about
 * someone's surgery or court date; a false "sensitive" only costs a plainer
 * hello. Whole words only ("scanner" is not "scan", "courtyard" is not "court").
 *
 * @module intelligence/world-model/dates/sensitive-date
 */
import { isSensitiveThread } from '../../../memory/index.js';

const HEAVY = new RegExp(
  `\\b(?:${[
    // health and care
    'hospitals?|hospice|rehab|icu|surger(?:y|ies)|procedures?|appointments?|biops(?:y|ies)|scans?|mri|x-?rays?',
    'chemo\\w*|radiation|dialysis|infusions?|therap(?:y|ies)|treatments?|diagnos[ie]s|results|follow[- ]?ups?',
    'clinic|doctors?|nurses?|surgeons?|oncolog\\w*|specialists?|psychiatr\\w*|therapists?|counsell?ors?',
    'medical|memory care|assisted living|nursing home|sponsor',
    // the law
    'court|trial|hearings?|custody|supervised|visitation|parole|probation|sentencing|mediation|deposition',
    'lawyers?|attorneys?|judge|prison|jail|detention|immigration|deportation',
    // money trouble
    'mortgage|foreclosure|eviction|bankruptcy|debts?|collections?|audit|tax(?:es)?|loans?|layoffs?|severance',
    'unemployment',
    // grief and separation
    'funerals?|memorials?|wake|burial|cemetery|graves?|passing|died|divorce|separation',
  ].join('|')})\\b`,
  'i'
);
/** Acronyms in capitals only, so "aa" and "er" in ordinary words never count. */
const HEAVY_ACRONYM = /\b(?:AA|NA|ER|IRS)\b/;

/** Events a friend can ask about lightly, when nothing heavy is in the label. */
const ORDINARY_EVENT =
  /\b(?:visits?|trips?|vacation|holidays?|party|parties|birthdays?|anniversary|wedding|shower|graduation|recitals?|concerts?|shows?|play|games?|match(?:es)?|tournament|race|marathon|interviews?|meetings?|presentation|launch|dinner|lunch|brunch|date night|reunion|celebration|festival|flight|move|pickup|class(?:es)?|lessons?|practice|rehearsal|gig|opening|retirement|ceremony|camp|sleepover|playdate|picnic|barbecue|hike)\b/i;

/** The ruling 1 lexicon, then a capitalised name when one follows ("sister Priya"). */
const RELATION =
  /\b(mom|dad|mother|father|sister|brother|wife|husband|partner|son|daughter|grandma|grandpa|friend)\b('s|’s)?/i;
const NAME = /^\s+(\p{Lu}[\p{L}-]*)/u;

const heavy = (text: string): boolean =>
  isSensitiveThread(text) || HEAVY.test(text) || HEAVY_ACRONYM.test(text);

/** True when the hello must not ask about this date or say what it is. Unsure is true. */
export function sensitiveDate(label: string): boolean {
  if (!/\p{L}/u.test(label) || heavy(label)) return true;
  return !ORDINARY_EVENT.test(label);
}

/** "grandma", "sister Priya": who the date is about, from the label, or null. */
export function personFromLabel(label: string): string | null {
  const m = RELATION.exec(label);
  const relation = m?.[1]?.toLowerCase();
  if (!m || !relation) return null;
  if (m[2]) return relation; // "mom's surgery": no name follows a possessive
  const name = NAME.exec(label.slice(m.index + m[0].length))?.[1]; // "Rose's" stops at the '
  // A capitalised topic ("mom Oncology follow-up") or relation ("mom Dad") is never a name.
  const isWord = !name || heavy(name) || RELATION.test(name) || ORDINARY_EVENT.test(name);
  return isWord ? relation : `${relation} ${name}`;
}
