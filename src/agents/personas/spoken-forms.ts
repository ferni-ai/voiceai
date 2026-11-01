/**
 * Spoken forms put in one reading (spoken-addresses.ts matches on the result): a said "dot"
 * (and "dotcom", the ideographic full stop, a spaced dot) is ".", letters spelled after a dot
 * are joined, digits said before a label are part of it, a toll-free vanity number is the
 * digits it dials, "eight hundred" is 800, and everything is lower case.
 *
 * @module agents/personas/spoken-forms
 */
import { foldContactText } from '../../memory/index.js';
import { ALT_ROOT_ENDINGS, TLDS } from './iana-tlds.js';

/**
 * Said "dot" is a dot only where it reads as a web address. After a common ending
 * ("evil dot com", "dot ru") it always is. After an ordinary English word that is also an
 * ending ("polka dot is fun", "a dot in the map") it never is. Otherwise the word before must
 * be a plausible host label (two or more characters, not a function word). Simple on purpose.
 */
const COMMON_ENDINGS = new Set(
  'com net org edu gov mil io ai co app dev me us uk ru cn de info biz xyz online site tech store shop help'.split(
    ' '
  )
);
const NOT_A_HOST = new Set(
  'a an the this that these those one two my your our his her their its some any each no not and or but so if as at by for from in of on to with is are was be it i we you he she they there here then than also just very really polka little tiny small single red blue green black white yellow pink decimal full'.split(
    ' '
  )
);
const wordOf = (token: string): string => token.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, '');
/**
 * What a said "dot" is: "said" (a dot of an address), "dropped" (an ordinary word, gone from
 * the text) or "kept" (left as the word "dot" so the final contact-data check still sees it).
 * After a common ending it is always said. After any other real ending, or a spelled letter,
 * it is said when the word before is a plausible host label ("evil dot is" is evil.is), even
 * if the ending is also an ordinary English word. An implausible word before ("a dot",
 * "polka dot", "the dot") makes it ordinary.
 */
function saidDot(before: string, after: string): 'said' | 'dropped' | 'kept' {
  const ending = wordOf(after.split(/[^\p{L}\p{N}-]/u)[0] ?? '');
  if (COMMON_ENDINGS.has(ending)) return 'said';
  const label = wordOf(before.split(/[^\p{L}\p{N}-]/u).pop() ?? '');
  if (label.length < 2 || NOT_A_HOST.has(label)) return 'dropped';
  const real =
    TLDS.has(ending) ||
    ALT_ROOT_ENDINGS.has(ending) ||
    ending.startsWith('xn--') ||
    /[^\p{ASCII}]/u.test(ending) ||
    ending.length === 1; // "dot o n l i n e"
  return real ? 'said' : 'kept';
}

/** Phone keypad letters: "HELP" is 4357. */
const KEYPAD = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => {
  const groups = ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz'];
  return String(groups.findIndex((g) => g.includes(c)) + 2);
});
/**
 * A toll-free vanity number as it is dialled: "1-800-662-HELP" is 1-800-662-4357, and a
 * repeat of the same digits in brackets ("1-800-662-HELP (4357)") is dropped. A bare "800 "
 * needs a hyphen or dot ("800 dollars" is money); with a leading "1 " a space does too, but
 * only for capital letters ("1 800 950 NAMI").
 */
const TOLL = '8(?:00|33|44|55|66|77|88)';
const VANITY_PLAIN = new RegExp(
  `\\b(${TOLL}[-.](?:\\d{3}[-.])?)([A-Za-z]{3,10})\\b(\\s*\\(\\d{3,10}\\))?`,
  'gu'
);
const VANITY_SPACED = new RegExp(
  `\\b(1[-\\s.]${TOLL}[-\\s.](?:\\d{3}[-\\s.])?)([A-Z]{3,10})\\b(\\s*\\(\\d{3,10}\\))?`,
  'gu'
);
const dialWord = (word: string): string =>
  [...word.toLowerCase()].map((c) => KEYPAD[c.charCodeAt(0) - 97]).join('');
const vanity = (_m: string, prefix: string, word: string, repeat?: string): string => {
  const digits = dialWord(word);
  return prefix + digits + (repeat && repeat.replace(/\D/g, '') !== digits ? repeat : '');
};
/** "one eight hundred ..." is 1 800 ...: a digit word before "hundred". */
const HUNDRED = /\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred\b/giu;
const DIGIT_WORD = 'zero one two three four five six seven eight nine'.split(' ');
const dialled = (text: string): string =>
  text
    .replace(HUNDRED, (_m, w: string) => `${DIGIT_WORD.indexOf(w.toLowerCase())}00`)
    .replace(VANITY_SPACED, vanity)
    .replace(VANITY_PLAIN, vanity);
/** "nine eight eight lifeline dot org": digits said before a label are part of it (988lifeline). */
const DIGITS_THEN_LABEL = /(?<![\p{L}\p{N}])((?:\d ){1,6}\d) ([a-z][a-z0-9-]*\.[a-z])/giu;

/** The text in one reading (see the module note). */
export function normalise(text: string): string {
  return foldContactText(dialled(text))
    .replace(/\b24\s*\/\s*7\b(?:,\s*365 days)?/giu, ' ') // "1-800-799-7233 (24/7)": hours, not digits of the number
    .replace(/\s*\bdot(com|net|org)\b/giu, '.$1') // "evil dotcom"
    .replace(/(?<=\p{L})[\u3002\uff61](?=\p{L})/gu, '.') // "evil。ru"
    .replace(/(\S)\s{1,3}\.\s{1,3}(?=\p{L})/gu, '$1.') // "evil . ru"
    .replace(/(\S{1,63})\s{1,3}dot\s{1,3}(?=(\S{1,24}))/giu, (m, before: string, after: string) => {
      const said = saidDot(before, after);
      return said === 'said' ? `${before}.` : said === 'kept' ? m : `${before} `;
    })
    .replace(/-dot-/giu, '.')
    .replace(
      DIGITS_THEN_LABEL,
      (_m, digits: string, label: string) => `${digits.replace(/ /g, '')}${label}`
    )
    .replace(
      /\.((?:\p{L} )+\p{L})(?![\p{L}\p{N}])/gu,
      (_m, letters: string) => `.${letters.replace(/ /g, '')}`
    )
    .toLowerCase();
}
