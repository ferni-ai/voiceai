/**
 * Is this answer nothing but how it went? "pretty well", "it was rough",
 * "fine, thanks", "he did well": then it is the answer to "how did it go?",
 * not an event of its own (same-event.ts rule b2).
 *
 * Whole words from two closed lists, never stems: the memory stemmer folds
 * "quite" into "quit", so a stemmed list erased the event in "he quit, it went
 * fine" (#2948 round 2). Every word must be on a list (or name whose event it
 * was), and at least one must say how it went. Any other word ("fell", "job",
 * "home", "monday") makes it an event, asked about in its turn.
 *
 * @module intelligence/world-model/dates/plain-outcome
 */

/** Words that say how it went, good or bad. */
const SAYS_HOW = new Set(
  (
    'well good great fine ok okay alright smooth smoothly amazing fantastic perfect wonderful ' +
    'lovely nice decent rough bad badly awful terrible horrible hard tough better worse so-so meh'
  ).split(' ')
);

/** Words that only frame how it went: "it was", "he did", "pretty", "thanks". */
const FRAMING = new Set(
  (
    "a an the it it's its was is were be been i i'm he he's she she's they they're we we're " +
    "you you're his her their my our all so very really pretty quite kind of sort bit little " +
    'lot much super actually honestly just not too at went go going goes did do doing everything ' +
    'day today thanks thank right yeah yes'
  ).split(' ')
);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .match(/[\p{L}][\p{L}'-]*/gu) ?? [];

/** True when `value` is only how it went; `whose` (subject, relation) may be named too ("Mom is okay"). */
export function isPlainOutcome(value: string, whose: string): boolean {
  const named = new Set(words(whose));
  const said = words(value).filter((w) => !named.has(w));
  return said.some((w) => SAYS_HOW.has(w)) && said.every((w) => SAYS_HOW.has(w) || FRAMING.has(w));
}
