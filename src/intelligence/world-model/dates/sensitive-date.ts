/**
 * Which dates the hello may ask about, and who a date is about
 * (docs/plans/2026-10-31-right-moment-memory.md §5.5, ruling 1: when unsure, sensitive).
 *
 * An allowlist, so an unknown heavy word can never be outvoted: the label is split
 * into whole words (hyphens and possessives split: "re-hab" is "re" + "hab"), and
 * stopwords, day and time words, relation words and names are set aside. Names count
 * only in safe shapes: a capitalised word before a possessive ("Priya's"), right after
 * a relation ("sister Priya") or right after "with" ("dinner with Marcus"); any other
 * capitalised word ("Hospice visit") is a content word. The date is ordinary only when
 * at least one content word is left and every one is in LIGHT_WORDS. Anything else is
 * sensitive: an empty label, a label of only names and days, any word not on the list.
 * A false "sensitive" costs a plainer hello; a false "ordinary" asks a cheerful
 * question about someone's surgery.
 *
 * @module intelligence/world-model/dates/sensitive-date
 */
import { isSensitiveThread } from '../../../memory/index.js';

/** Clearly happy or neutral events. Nothing ambiguous: no "anniversary" alone, no "appointment". */
export const LIGHT_WORDS: ReadonlySet<string> = new Set(
  `birthday party dinner lunch brunch breakfast coffee trip vacation holiday getaway visit wedding
  shower housewarming graduation recital concert show movie game match tournament practice race
  marathon hike camping beach picnic barbecue bbq festival fair sleepover playdate date reunion
  homecoming arrival flight move meeting interview class school launch opening christmas
  thanksgiving easter halloween hanukkah diwali eid passover night big first family team job friends`.split(
    /\s+/
  )
);

const STOPWORDS = new Set(
  'a an the of to for with at in on and my our their his her your'.split(' ')
);
const TIME_WORD =
  /^(?:(?:mon|tues|wednes|thurs|fri|satur|sun)days?|january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|tonight|yesterday|next|this|morning|afternoon|evening|night|noon|midnight|weekend|am|pm|\d+(?:st|nd|rd|th|am|pm)?)$/;
const RELATIONS = new Set(
  'mom dad mother father sister brother wife husband partner son daughter grandma grandpa friend'.split(
    ' '
  )
);
/** A name is Capitalised then lower case: "IRS", "HR" and "ER" never are. */
const NAME_SHAPE = /^\p{Lu}\p{Ll}{2,}$/u;

interface Word {
  word: string;
  lower: string;
  possessive: boolean;
}

function wordsOf(label: string): Word[] {
  const found = label.normalize('NFKC').matchAll(/([\p{L}\p{N}]+)(['’]s(?![\p{L}\p{N}]))?/gu);
  return [...found].map((m) => {
    const word = m[1] ?? '';
    return { word, lower: word.toLowerCase(), possessive: m[2] !== undefined };
  });
}

/** A name in one of the safe shapes; `prev` is the word before it in the label. */
function isName(w: Word, prev: Word | undefined): boolean {
  if (!NAME_SHAPE.test(w.word) || RELATIONS.has(w.lower) || LIGHT_WORDS.has(w.lower)) return false;
  return (
    w.possessive || (prev !== undefined && (RELATIONS.has(prev.lower) || prev.lower === 'with'))
  );
}

/** The word, or its singular ("games", "classes", "parties"), when that is on the list. */
const lightForm = (w: string): boolean =>
  [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y')].some((f) =>
    LIGHT_WORDS.has(f)
  );

/** A content word is light on its own, or "anniversary" after "wedding", "new year" as a pair. */
function isLight(w: string, prev: string | undefined, next: string | undefined): boolean {
  if (w === 'anniversary') return prev === 'wedding';
  if (w === 'new') return next === 'year';
  if (w === 'year') return prev === 'new';
  return lightForm(w);
}

/** True when the hello must not ask about this date or say what it is. Unsure is true. */
export function sensitiveDate(label: string): boolean {
  if (isSensitiveThread(label)) return true;
  const words = wordsOf(label);
  const set = (w: Word, i: number): boolean =>
    STOPWORDS.has(w.lower) ||
    TIME_WORD.test(w.lower) ||
    RELATIONS.has(w.lower) ||
    isName(w, words[i - 1]);
  const content = words.filter((w, i) => !set(w, i)).map((w) => w.lower);
  if (content.length === 0) return true;
  return !content.every((w, i) => isLight(w, content[i - 1], content[i + 1]));
}

/** The names in the label, in the safe shapes only ("Priya", "Rose"). */
export function namesIn(label: string): string[] {
  const words = wordsOf(label);
  return words.filter((w, i) => isName(w, words[i - 1])).map((w) => w.word);
}

/** "grandma", "grandma Rose": who the date is about, from the relation lexicon, or null. */
export function personFromLabel(label: string): string | null {
  const words = wordsOf(label);
  const at = words.findIndex((w) => RELATIONS.has(w.lower));
  const relation = words[at];
  if (!relation) return null;
  const next = words[at + 1];
  // A name only in the surest shape, "grandma Rose's": never "mom Oncology follow-up".
  const named = !relation.possessive && next?.possessive === true && isName(next, relation);
  return named ? `${relation.lower} ${next.word}` : relation.lower;
}
