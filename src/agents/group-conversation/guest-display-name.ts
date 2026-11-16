/**
 * GROUP_CALL: the name Ferni uses for a guest, in system notes and turn labels.
 *
 * A participant's display name is set by whoever joined, so it is text from outside
 * going into the model's context. Only a plain name gets through, checked after NFKC:
 * one or two words, each with a letter, of letters in a single script with spaces,
 * hyphens and apostrophes, at most 24 characters, no invisible characters, and at most
 * two combining marks on a letter.
 * Anything else is "the guest". A name with a word that is, or starts with, the owner's
 * first name (case, accents and Cyrillic or Greek look-alike letters aside), or that
 * reads as one of our own labels, gets " (guest)". Every note and label names her with
 * her role (guestRole, guestLabel), so even a look-alike the fold misses is the guest.
 *
 * @module agents/group-conversation/guest-display-name
 */

const FALLBACK = 'the guest';
const ROLE = ' (guest)';
const MAX_LENGTH = 24;
const MAX_WORDS = 2;
/** Letters (with their combining marks) in any script, spaces, hyphens and apostrophes. */
const PLAIN_NAME = /^[\p{L}\p{M} '’-]+$/u;
/**
 * The scripts a name may be written in. A letter counts as in a script when the script is
 * in its Script_Extensions: the katakana long vowel mark and the Arabic tatweel are
 * Common by Script, but kana and Arabic by extension.
 */
const SCRIPTS = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Arabic',
  'Hebrew',
  'Devanagari',
  'Bengali',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Gujarati',
  'Gurmukhi',
  'Sinhala',
  'Thai',
  'Lao',
  'Khmer',
  'Myanmar',
  'Tibetan',
  'Georgian',
  'Armenian',
  'Ethiopic',
  'Hangul',
  'Han',
  'Hiragana',
  'Katakana',
];
/** Han is also written with kana (Japanese) and with hangul (Korean). */
const SCRIPT_GROUPS = [
  ...SCRIPTS.map((script) => [script]),
  ['Han', 'Hiragana', 'Katakana'],
  ['Han', 'Hangul'],
];
/** One pattern per group: a letter whose Script_Extensions share a script with the group. */
const IN_GROUP = SCRIPT_GROUPS.map(
  (group) =>
    new RegExp(`^[${group.map((script) => `\\p{Script_Extensions=${script}}`).join('')}]$`, 'u')
);
/** Variation selectors, zero-width joiners, bidi controls and every other invisible. */
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/u;
const MAX_MARKS_PER_LETTER = 2;
const LETTER = /\p{L}/u;
/**
 * Cyrillic and Greek letters that look like Latin ones, lower case (a name is lower-cased
 * first, and capitals that look Latin map through their lower case). Not a full TR39 table.
 */
const LOOK_ALIKES: Readonly<Record<string, string>> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  ѕ: 's',
  һ: 'h',
  і: 'i',
  ј: 'j',
  ԁ: 'd',
  ӏ: 'l',
  ԛ: 'q',
  ԝ: 'w',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'h',
  ι: 'i',
  κ: 'k',
  μ: 'm',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ζ: 'z',
};
/** Our own labels: a guest named one of these must not read as it. */
const RESERVED = new Set(['unclear', 'the caller']);

/** Lower case, accents stripped and look-alike letters made Latin, for comparing names. */
function fold(text: string): string {
  const plain = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return Array.from(plain, (c) => LOOK_ALIKES[c] ?? c).join('');
}

/** Whether every combining mark follows a letter, at most two to a letter (decomposed). */
function marksOnLetters(text: string): boolean {
  let marks = -1; // -1: not straight after a letter
  for (const c of text.normalize('NFD')) {
    if (LETTER.test(c)) marks = 0;
    else if (!/\p{M}/u.test(c)) marks = -1;
    else if (marks < 0 || ++marks > MAX_MARKS_PER_LETTER) return false;
  }
  return true;
}

function oneScript(name: string): boolean {
  const letters = Array.from(name).filter((c) => LETTER.test(c));
  return IN_GROUP.some((group) => letters.every((c) => group.test(c)));
}

/** Whether the guest's name could pass for the owner's or for one of our labels. */
function readsAsOurs(name: string, ownerFirstName: string): boolean {
  const owner = fold(ownerFirstName);
  if (RESERVED.has(fold(name))) return true;
  return owner !== '' && name.split(' ').some((word) => fold(word).startsWith(owner));
}

/**
 * NFKC first, so every later check sees the text the model will (NFKC can bring out a
 * combining mark: the spacing acute is a space and a combining acute). Then invisibles,
 * then marks, then the characters, the script and the words.
 */
export function guestDisplayName(raw: string | undefined, ownerFirstName: string): string {
  const trimmed = (raw ?? '').normalize('NFKC').trim();
  if (!trimmed || INVISIBLE.test(trimmed) || !marksOnLetters(trimmed)) return FALLBACK;
  if (!PLAIN_NAME.test(trimmed) || !oneScript(trimmed)) return FALLBACK;
  const words = trimmed.split(/ +/);
  if (words.length > MAX_WORDS || !words.every((word) => LETTER.test(word))) return FALLBACK;
  const name = Array.from(words.join(' ')).slice(0, MAX_LENGTH).join('').trimEnd();
  return readsAsOurs(name, ownerFirstName) ? `${name}${ROLE}` : name;
}

/** The guest with her role, `Sarah (guest)`: how every note and label names her. */
export function guestRole(name: string): string {
  return name === FALLBACK || name.endsWith(ROLE) ? name : `${name}${ROLE}`;
}

/** The label on a guest's turns, `[Sarah (guest)] `: it always says she is the guest. */
export const guestLabel = (name: string): string => `[${guestRole(name)}] `;
