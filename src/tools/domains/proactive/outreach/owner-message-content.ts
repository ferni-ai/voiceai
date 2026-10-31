/**
 * What a call the server did not verify may not have Ferni send the account
 * owner (owner-message-policy.ts): anything a phishing text needs. A link, a
 * number to call, an address to write to, or an ask for a login, a code or
 * bank details. It fails closed: a message that only looks like one of these
 * ("polka dot", "11.12.2025") is refused too, and the caller can still send it
 * from the app.
 *
 * Every check reads one normal form (`normalForm`), so a disguise is undone
 * once for all of them rather than patched per check: compatibility forms
 * (full-width, ligatures), format characters (zero-width, bidi marks),
 * accents, Cyrillic and Greek look-alikes, "dot" and "at" spelled out,
 * bracketed or spaced. On top of it the number check also reads digits
 * written as words or as look-alike letters (o for 0, l or i for 1), and the
 * word check reads leetspeak and letters spaced apart.
 *
 * @module tools/domains/proactive/outreach/owner-message-content
 */

/** Why a message was refused; logged as the reason code, never with the text. */
export type ContentBlock = 'email' | 'url' | 'phone_number' | 'credential_ask';

/** Cyrillic and Greek letters that pass for Latin ones (lower case). */
const LOOK_ALIKES: Readonly<Record<string, string>> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y',
  х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ӏ: 'l', α: 'a', ε: 'e', ι: 'i', κ: 'k',
  ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
}; // prettier-ignore
const DIGIT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
const DIGIT_WORD = new RegExp(`\\b(?:${DIGIT_WORDS.join('|')})\\b`, 'g');
/** Letters that stand in for digits in a number someone wants read past a filter. */
const DIGIT_LOOK_ALIKES: Readonly<Record<string, string>> = { o: '0', l: '1', i: '1', '|': '1' };
const LEET: Readonly<Record<string, string>> = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' }; // prettier-ignore

/**
 * The one form every check reads: NFKD with accents and format characters
 * gone, look-alikes mapped to Latin, lower case, every full stop a ".", and
 * "x dot y", "x (dot) y", "x [.] y", "x . y", "xdotcom" written "x.y", with
 * "at" likewise as "@" in front of a domain.
 */
export function normalForm(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .toLowerCase()
    .replace(/./gu, (c) => LOOK_ALIKES[c] ?? c)
    .replace(/[。｡︒․]/g, '.')
    .replace(/\s*[[({<]\s*(?:dot|\.)\s*[\])}>]\s*/g, '.')
    .replace(/(?<=[\p{L}\p{N}])(?:\s+dot\s+|\s+\.\s*|dot(?=\p{L}{2,}\b))(?=[\p{L}\p{N}])/gu, '.')
    .replace(/\s*[[({<]\s*(?:at|@)\s*[\])}>]\s*/g, '@')
    .replace(/(?<=[\p{L}\p{N}._-])\s+at\s+(?=[\p{L}\p{N}-]+\.\p{L}{2,})/gu, '@');
}

/** The normal form as digits: number words and look-alike letters read as digits. */
const asDigits = (form: string): string =>
  form
    .replace(DIGIT_WORD, (w) => String(DIGIT_WORDS.indexOf(w)))
    .replace(/[oli|]/g, (c) => DIGIT_LOOK_ALIKES[c]);

/** The normal form as words: leetspeak read as letters, "p a s s" read as "pass". */
const asWords = (form: string, one: 'i' | 'l'): string =>
  form
    .replace(/[0134578@$]/g, (c) => (c === '1' ? one : (LEET[c] ?? c)))
    .replace(/\b(?:\p{L}[\s.\-_*·]+){2,}\p{L}\b/gu, (run) => run.replace(/[^\p{L}]/gu, ''));

const EMAIL = /[\p{L}\p{N}._%+-]@[\p{L}\p{N}-]/u;
const URL_MARK = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\bhttps?:)/;
/** Any domain-shaped token: labels joined by dots, the last one 2+ letters, whatever the TLD. */
const DOMAIN = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}(?![\p{L}\p{N}])/u;
/** Seven or more digits, any script, with spaces, dashes, dots or brackets between them. */
const DIGIT_RUN = /\p{Nd}(?:[\s.,()/+_*\p{Pd}]*\p{Nd}){6,}/u;
const CREDENTIAL_ASK = new RegExp(
  '\\b(?:verif(?:y|ies|ied|ying|ications?)|log(?:ging|ged)?\\s*-?\\s*ins?|logins?|' +
    'sign\\s*-?\\s*ins?|accounts?|banks?|banking|passwords?|pass\\s*codes?|codes?|pins?|' +
    'ssns?|cards?|wires?|wired|wiring|gift\\s*cards?|otps?)\\b'
);

/** The first reason `text` may not be sent from an unverified call, or null when it may. */
export function blockedContent(text: string): ContentBlock | null {
  const form = normalForm(text);
  if (EMAIL.test(form)) return 'email';
  if (URL_MARK.test(form) || DOMAIN.test(form)) return 'url';
  if (DIGIT_RUN.test(asDigits(form))) return 'phone_number';
  const asks = [asWords(form, 'i'), asWords(form, 'l')];
  return asks.some((words) => CREDENTIAL_ASK.test(words)) ? 'credential_ask' : null;
}
