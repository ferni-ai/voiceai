/**
 * What a call the server did not verify may not have Ferni send the account
 * owner (owner-message-policy.ts): anything a phishing text needs. A link, a
 * number to call, an address to write to, or an ask for a login, a code or
 * bank details. It fails closed: a message that only looks like one of these
 * ("polka dot", "11.12.2025") is refused too, and the caller can still send it
 * from the app.
 *
 * Each check runs on the text after the usual disguises are undone: Unicode
 * look-alikes (full-width digits, other scripts' digits, Cyrillic letters,
 * accents), zero-width characters, "dot" / "at" spelled out or bracketed,
 * letters spaced apart and digits written as words or leetspeak.
 *
 * @module tools/domains/proactive/outreach/owner-message-content
 */

/** Why a message was refused; logged as the reason code, never with the text. */
export type ContentBlock = 'email' | 'url' | 'phone_number' | 'credential_ask';

const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const TLDS = 'com|net|org|io|co|app|ai|me|us|ly|link|xyz|info|biz|gov|edu|site|online|page';
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
/** Cyrillic and Greek letters that pass for Latin ones. */
const LOOK_ALIKES: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y',
  х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v',
  ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
}; // prettier-ignore

/** Lower case, NFKC (full-width forms), no invisible characters, every full stop a "." */
function plain(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/[\u3002\uFF61\uFE12]/g, '.')
    .toLowerCase();
}

/** "x dot y", "x (dot) y", "x [.] y" and "x . com" written as "x.y"; "at" likewise as "@". */
function unspelled(text: string): string {
  return text
    .replace(/\s*[[({<]\s*(?:dot|\.)\s*[\])}>]\s*/g, '.')
    .replace(/(?<=[\p{L}\p{N}])\s+dot\s+(?=[\p{L}\p{N}])/gu, '.')
    .replace(new RegExp(`(?<=[\\p{L}\\p{N}])\\s+\\.\\s*(?=(?:${TLDS})\\b)`, 'gu'), '.')
    .replace(/\s*[[({<]\s*(?:at|@)\s*[\])}>]\s*/g, '@')
    .replace(/(?<=[\p{L}\p{N}._-])\s+at\s+(?=[\p{L}\p{N}-]+\.\p{L}{2,})/gu, '@');
}

/** Letters as written to dodge a word list: accents, look-alikes, leetspeak, "p a s s". */
function lettersOnly(text: string, one: 'i' | 'l'): string {
  const leet: Record<string, string> = { 0: 'o', 1: one, 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' }; // prettier-ignore
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/./gu, (c) => LOOK_ALIKES[c] ?? leet[c] ?? c)
    .replace(/\b(?:\p{L}[\s.\-_*\u00B7]+){2,}\p{L}\b/gu, (run) => run.replace(/[^\p{L}]/gu, ''));
}

const EMAIL = /[\p{L}\p{N}._%+-]@[\p{L}\p{N}-]/u;
const URL_MARK = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\bhttps?:)/;
const BARE_DOMAIN = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}(?![\p{L}\p{N}])/u;
const SPELLED_TLD = new RegExp(`dot\\s*(?:${TLDS})\\b`);
const DIGIT_WORD = new RegExp(`\\b(?:${DIGIT_WORDS.join('|')})\\b`, 'g');
/** Seven or more digits, any script, with spaces, dashes, dots or brackets between them. */
const DIGIT_RUN = /\p{Nd}(?:[\s.,\-\u2010-\u2015\u2212()/+_*]*\p{Nd}){6,}/u;
const CREDENTIAL_ASK = new RegExp(
  '\\b(?:verif(?:y|ies|ied|ying|ications?)|log(?:ging|ged)?\\s*-?\\s*ins?|logins?|' +
    'sign\\s*-?\\s*ins?|accounts?|banks?|banking|passwords?|pass\\s*codes?|codes?|pins?|' +
    'ssns?|cards?|wires?|wired|wiring|gift\\s*cards?|otps?)\\b'
);

/** The first reason `text` may not be sent from an unverified call, or null when it may. */
export function blockedContent(text: string): ContentBlock | null {
  const seen = unspelled(plain(text));
  if (EMAIL.test(seen)) return 'email';
  if (URL_MARK.test(seen) || BARE_DOMAIN.test(seen) || SPELLED_TLD.test(seen)) return 'url';
  const digits = seen.replace(DIGIT_WORD, (w) => String(DIGIT_WORDS.indexOf(w)));
  if (DIGIT_RUN.test(digits)) return 'phone_number';
  const asks = [lettersOnly(seen, 'i'), lettersOnly(seen, 'l')];
  return asks.some((t) => CREDENTIAL_ASK.test(t)) ? 'credential_ask' : null;
}
