/**
 * Contact data: the one rule for "may this text be stored or rendered?". A phone
 * number or an email, in any script or spelling, is never kept in memory or put in a
 * prompt. Ordinary numbers (dates, times, years, prices, house numbers) are kept.
 *
 * Pure: no I/O, imports nothing. Credentials (keys, card numbers, SSNs) are a
 * different concern and live in memory/credential-shapes.ts.
 *
 * @module memory/domain/contact-data
 */

const ND = /^\p{Nd}$/u;

/**
 * Every decimal-digit block in Unicode is 10 contiguous code points from its zero,
 * and adjacent blocks stay aligned, so a digit's value is its offset from the start
 * of its run of digit code points, mod 10. That turns Arabic-Indic, Devanagari and
 * every other script's digits into ASCII ones without a table.
 */
function asciiDigit(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  let start = cp;
  while (start > 0 && ND.test(String.fromCodePoint(start - 1))) start--;
  return String((cp - start) % 10);
}

// Index = digit; "oh" is not listed, so indexOf gives -1 and it reads as zero.
const DIGIT_WORDS = 'zero one two three four five six seven eight nine'.split(' ');

/**
 * The text every check reads: NFKC (full-width, circled and superscript digits,
 * "＠", "．"), invisible format characters (zero-width, soft hyphen, bidi marks)
 * removed, every decimal digit in ASCII, and spoken digits ("five five five") as
 * digits, so a dictated number counts the same as a typed one.
 */
function fold(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Nd}/gu, (d) => (d >= '0' && d <= '9' ? d : asciiDigit(d)))
    .replace(/\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (w) =>
      String(Math.max(0, DIGIT_WORDS.indexOf(w.toLowerCase())))
    );
}

// Digits joined by anything that is not a letter: spaces, dashes of every kind,
// dots, commas, colons, slashes, parens. Only a letter ends a run.
const RUN = /\d(?:[^\p{L}\d]*\d)*/gu;
const MIN_DIALABLE = 7;

// The allowance. A run of 7+ digits is kept only when it is made entirely of
// ordinary number tokens: a date (2026-10-20, 06/12/2010, 10/20), a time or time
// range (12:00-1:30), or years (1987, 2015; 2015-2019). Each token is a shape a phone
// number does not take, and the WHOLE run must parse, so "(727) 012-2019" still
// counts: its "2019" is a year only if nothing dialable sits next to it.
// Money is not masked first (a mask could hide half a number: "$555-0142"). A run is
// an amount only when the WHOLE run is one well-formed amount right after a currency
// sign: "$450,000", "€ 1,250,000.50". "$5551234567" and "727 555 $0142" are not.
const DASH = '\\-\\u2010-\\u2015\\u2212';
const YEAR = '(?:19|20)\\d\\d';
const MONTH_DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const DATE_SEP = `[/.${DASH}]`;
const DATE =
  `(?:${YEAR}${DATE_SEP}${MONTH_DAY}${DATE_SEP}${MONTH_DAY}` +
  `|${MONTH_DAY}${DATE_SEP}${MONTH_DAY}(?:${DATE_SEP}(?:${YEAR}|\\d\\d))?)`;
const TIME = '(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?';
const TOKEN = `(?:${DATE}|${TIME}|${YEAR})`;
const JOIN = `(?:\\s*[,${DASH}]\\s*|\\s+)`;
const ORDINARY_RUN = new RegExp(`^${TOKEN}(?:${JOIN}${TOKEN})*$`);
const AMOUNT = '(?:\\d{1,3}(?:,\\d{3})+|\\d{1,6})(?:\\.\\d{1,2})?';
const ONE_AMOUNT = new RegExp(`^${AMOUNT}$`);
const SIGN_BEFORE = /\p{Sc}\s?$/u;

function hasDialableRun(folded: string): boolean {
  for (const m of folded.matchAll(RUN)) {
    const run = m[0];
    if (run.replace(/\D/g, '').length < MIN_DIALABLE || ORDINARY_RUN.test(run)) continue;
    const signed = SIGN_BEFORE.test(folded.slice(Math.max(0, m.index - 2), m.index));
    if (!(signed && ONE_AMOUNT.test(run))) return true;
  }
  return false;
}

// Stored values get a backstop the prompt guard doesn't need: letters do not reset
// it. 7+ digits anywhere in the value ("call 555 then 0142") are refused, except
// digits inside a recognised date, time, year, amount, or a ZIP ending the value
// ("1245 Oak St, 33701"), so "born in 1987, moved 2015" is still kept.
const MAX_LOOSE_DIGITS = MIN_DIALABLE - 1;
const LOOSE_TOKENS = [
  new RegExp(`\\p{Sc}\\s?${AMOUNT}(?![.,]?\\d)`, 'gu'),
  new RegExp(`(?<!\\d)${TOKEN}(?!\\d)`, 'g'),
  /(?:,\s*|\b[A-Z]{2}\s+)\d{5}(?:-\d{4})?[^\p{L}\d]*$/u,
];

function looseDigits(folded: string): number {
  const rest = LOOSE_TOKENS.reduce((t, re) => t.replace(re, ' '), folded);
  return rest.replace(/\D/g, '').length;
}

// Spoken emails. "X at Y" is an address only with a domain ending after it:
//  - "at example.com": a dot with no space, then letters (any script, so "cοm" with
//    a Greek omicron counts);
//  - "at example . com": a space BEFORE the dot; sentence punctuation never has one;
//  - "at example. com": a space only after the dot, which is how a sentence ends
//    ("She was at work. Busy week"), so only a common TLD after it counts;
//  - "at example dot com" / "dot c0m".
// A determiner is not a domain ("meet at the dot com office"). Parts are capped at
// RFC lengths (64, 63) so no pattern backtracks over a long unbroken string.
const LOCAL = '[\\p{L}\\p{N}_.+-]{1,64}';
const DOMAIN = '(?!(?:the|a|an|my|your|his|her|our|their|this|that)\\b)[\\p{L}\\p{N}_-]{1,63}';
const AT = `${LOCAL}\\s+at\\s+${DOMAIN}`;
const PROVIDERS = 'gmail|googlemail|yahoo|hotmail|outlook|icloud|aol|proton(?:mail)?';
const PLACES = 'office|offices|hq|headquarters|campus|building|store|team|conference';
const EMAIL: readonly RegExp[] = [
  /@|%40|&#0*64;|&#x0*40;|&commat;/i,
  /[([{<]\s*(?:at|dot)\s*[)\]}>]/i,
  new RegExp(`${AT}\\.\\p{L}[\\p{L}\\p{N}]+`, 'iu'),
  new RegExp(`${AT}\\s+\\.\\s*\\p{L}{2,}`, 'iu'),
  new RegExp(`${AT}\\.\\s+(?:com|net|org|edu|gov|io)\\b`, 'iu'),
  new RegExp(`${AT}\\s+dot\\s+\\S{2,}`, 'iu'),
  // "at" a mail provider ("email jo at gmail later"), unless a place noun follows
  // ("meet at gmail HQ"). Cost: "works at Yahoo" is refused too.
  new RegExp(`\\bat\\s+(?:${PROVIDERS})\\b(?!\\s+(?:${PLACES})\\b)`, 'i'),
];

/** True when the text holds a phone number or an email address in any spelling. */
export function containsContactData(text: string): boolean {
  const folded = fold(text);
  return hasDialableRun(folded) || EMAIL.some((re) => re.test(folded));
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * A phone number as E.164 ("+17275550142"), a bare 10-digit number read as US; else
 * null. Only ASCII digits after NFKC: a number in another script is refused, not guessed.
 */
export function toE164(raw: string): string | null {
  const digits = raw.normalize('NFKC').replace(/[\s().-]/g, '');
  const full = /^\d{10}$/.test(digits)
    ? `+1${digits}`
    : /^1\d{10}$/.test(digits)
      ? `+${digits}`
      : digits;
  return E164.test(full) ? full : null;
}

const BIRTHDAY = /^(\d{4}-)?\d{2}-\d{2}$/;

/**
 * May this value be stored under this attribute? A phone attribute holds only an
 * E.164 number, a birthday may be a bare date; every other value must hold no
 * contact data, and no more than 6 digits outside recognised ordinary tokens.
 */
export function isContactValueAllowed(attribute: string, value: string): boolean {
  if (attribute === 'phone') return toE164(value) !== null;
  if (attribute === 'birthday' && BIRTHDAY.test(value)) return true;
  return !containsContactData(value) && looseDigits(fold(value)) <= MAX_LOOSE_DIGITS;
}
