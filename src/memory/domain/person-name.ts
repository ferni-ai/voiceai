/**
 * Whether a word or label names a person, and the word lists that decide it. Shared by
 * entity hygiene (after-call entities) and the relationship network (people the caller
 * mentions), so both reject the same pronouns, placeholders and fillers.
 *
 * Pure: no I/O.
 *
 * @module memory/domain/person-name
 */

import { relationOf } from './person-key.js';

/** A word that only stands in for someone or something ("someone", "unknown"). */
export const PLACEHOLDER = new Set(
  'unknown unspecified unnamed unidentified someone somebody something anyone anybody anything everyone everybody nobody whoever whatever none null undefined n/a tbd'.split(
    ' '
  )
);
/** A name that is only a pronoun, possessive or greeting. */
export const NOT_A_NAME = new Set(
  'i me my mine you your he him his she her hers we us our they them their it its hi hey hello'.split(
    ' '
  )
);
/** "the item", "a person", "some thing": a bare generic noun, not a name. */
export const GENERIC =
  /^(?:the|a|an|some|this|that|any)\s+(?:item|items|thing|things|person|people|place|topic|concept|stuff|one|guy|someone)$/i;

/** The lower-cased words of a name, possessive "'s" dropped: "Maya's mom" → ["maya", "mom"]. */
export const wordsOf = (name: string): string[] =>
  name
    .toLowerCase()
    .split(/[^a-z0-9/']+/)
    .map((w) => w.replace(/'s$/, ''))
    .filter(Boolean);

/**
 * Words the people regexes catch after "call", "tell", "ask", "with" or "and" that are never
 * a name: fillers and verbs ("talked to uh", "and check"), prepositions and plain nouns after
 * a cue ("ask about", "talked to people").
 * Names that are also words (Will, May, Mark, Bill, Grace) are deliberately left out.
 */
const NOT_A_PERSON = new Set(
  'uh uhh um umm er erm ah ahh hm hmm mm mhm oh ooh ok okay yeah yep yup yes no nope nah huh like well so check call text tell ask see go get got do make talk say said meet visit email let help find try take give send thank thanks about for if whether to at in on of from over out up down back off into all people folks guys friends family team work home school dinner lunch'.split(
    ' '
  )
);

/** A title alone is never a name ("Dr" of "Dr. Patel"), "Doctor" included though it is a relation. */
const HONORIFIC = new Set(['dr', 'doctor', 'mr', 'mrs', 'ms', 'prof']);

/**
 * Whether a name stored for someone in the caller's life can be a person: a name ("Bria",
 * "Mel", "Checkers") or a relation ("my mom", "Mom"). Never a lone pronoun, filler, verb,
 * placeholder or number. Whole words only: "me" never drops "Mel". Not flag-gated: prod
 * 2026-11-16 drew "uh", "check", "call", "me" and "her" in the Your World graph.
 */
export function couldBePerson(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || /^[\d\s.,:/#%$-]+$/.test(trimmed)) return false;
  const words = wordsOf(trimmed);
  if (words.length === 1 && HONORIFIC.has(words[0] ?? '')) return false;
  if (relationOf(trimmed)) return true;
  if (words.length === 0 || GENERIC.test(trimmed)) return false;
  if (words.length > 1)
    return !words.every((w) => NOT_A_NAME.has(w) || NOT_A_PERSON.has(w) || HONORIFIC.has(w));
  const [word] = words as [string];
  return !NOT_A_NAME.has(word) && !NOT_A_PERSON.has(word) && !PLACEHOLDER.has(word);
}

/** Capitalized words that start a clause and are never someone's name. */
const CLAUSE_WORDS = new Set(
  'the a an this that it my we they he she you i with said told asked met saw called texted spoke today yesterday tomorrow monday tuesday wednesday thursday friday saturday sunday morning afternoon evening night week month year then when where what who how why but and or so just really very here there now later soon again next last first good great nice new old some many few honestly anyway actually basically also though'.split(
    ' '
  )
);

/**
 * The name a caught word gives, or null: not a clause word, pronoun, filler, honorific or verb
 * (couldBePerson, whole words), and capitalised as said. Name patterns are case-insensitive for
 * their trigger words ("my son", "talked to"), so their "[A-Z][a-z]+" also caught "and" in "my
 * son and I"; a lowercase word is never a name. Shared by the people graph, the profile's family
 * members and fast capture (#3922, #3993).
 */
export function nameAsSaid(word: string | undefined): string | null {
  if (!word || CLAUSE_WORDS.has(word.toLowerCase()) || !couldBePerson(word)) return null;
  return /^\p{Lu}/u.test(word) ? word : null;
}
