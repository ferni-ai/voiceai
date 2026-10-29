/**
 * Contact data: the one rule for "may this text be stored or rendered?". A phone
 * number or an email is not kept in memory or put in a prompt. Its contract is to be
 * never worse than the checks it replaced (the parity table in its tests); it is not a
 * complete spoken-language detector, which is a later classifier lane.
 *
 * Not caught (all also missed by the replaced checks, unless noted):
 * - spoken digits beyond single words and "double"/"triple" ("tens" such as "fifty-five",
 *   the letter "o", "nought");
 * - alternate email spellings: "-at-", "_at_", "·" or "。" as the dot, "period",
 *   "dot c o m", "d0t", "dotcom";
 * - Ethiopic numerals (not decimal digits in Unicode);
 * - in rendered text, digits split by letters or letter-like marks ("555-O142",
 *   "call 72755 or, 50142", katakana "ー", Arabic tatweel, "ǀ", the Hangul filler);
 *   stored values catch these through their 7-digit total;
 * - in rendered text, a run that is exactly one full date is kept, so "on 2026-10-20
 *   call 555" renders (the replaced check refused every 7+ digit run); stored values
 *   refuse it.
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
 * removed, every decimal digit in ASCII, and single spoken digits ("five five five",
 * "oh", "double five") as digits.
 */
function fold(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Nd}/gu, (d) => (d >= '0' && d <= '9' ? d : asciiDigit(d)))
    .replace(/\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (w) =>
      String(Math.max(0, DIGIT_WORDS.indexOf(w.toLowerCase())))
    )
    .replace(/\b(double|triple)\s+(\d)\b/gi, (_m, n: string, d: string) =>
      d.repeat(n.toLowerCase() === 'double' ? 2 : 3)
    );
}

// Digits joined by anything that is not a letter: spaces, dashes of every kind,
// dots, commas, colons, slashes, parens. Only a letter ends a run.
const RUN = /\d(?:[^\p{L}\d]*\d)*/gu;
const MIN_DIALABLE = 7;
const digitCount = (s: string): number => s.replace(/\D/g, '').length;

// Fail closed. A run of 7+ digits is dialable unless the WHOLE run is one of two
// shapes a phone number never takes: one full date (2026-10-20, 06/12/2010) or one
// ascending range of two plausible years, exactly YYYY-YYYY (1987-2015; "2015-1987"
// is a number). Every other ordinary number of that size (two years in a list, a
// time range, a big price) is refused: each allow-list rule we added beyond these
// leaked a number (#2962, #3009 reviews).
const YEAR = '(?:19|20)\\d\\d';
const MONTH = '(?:0?[1-9]|1[0-2])';
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const FULL_DATE = new RegExp(`^(?:${YEAR}-${MONTH}-${DAY}|${MONTH}/${DAY}/${YEAR})$`);
const YEAR_RANGE = /^(\d{4})[-\u2010-\u2015\u2212](\d{4})$/;

function isYearRange(run: string): boolean {
  const m = YEAR_RANGE.exec(run);
  const [from, to] = [Number(m?.[1]), Number(m?.[2])];
  return from >= 1900 && to <= 2100 && from < to;
}

const hasDialableRun = (folded: string): boolean =>
  (folded.match(RUN) ?? []).some(
    (run) => digitCount(run) >= MIN_DIALABLE && !FULL_DATE.test(run) && !isYearRange(run)
  );

// Spoken emails. "X at Y" is an address only with a domain ending after it:
//  - "at example.com": a dot with no space, then letters (any script, so "cοm" with
//    a Greek omicron counts);
//  - "at example . com": a space BEFORE the dot; sentence punctuation never has one;
//  - "at example. com": a space only after the dot, which is how a sentence ends
//    ("She was at work. Busy week"), so it counts only for a common TLD, or for any
//    2+ letter label that ends the text or is followed by another ".label";
//  - "at example dot com" / "dot c0m".
// Punctuation may sit before "at" ("jo, at", "(jo) at"), and "at sign" counts as
// "at". The local part is capped at 64 characters so no pattern backtracks over a
// long unbroken string; the domain at 253 (a whole domain name).
const LOCAL = '[\\p{L}\\p{N}_.+-]{1,64}';
const DOMAIN = '[\\p{L}\\p{N}_-]{1,253}';
// Clause punctuation and closing brackets only: none of them can be part of LOCAL, so
// the two never trade characters while backtracking.
const BEFORE_AT = `(?:\\s+|[,;:!?)\\]}>"']{1,3}\\s*)`;
const AT = `${LOCAL}${BEFORE_AT}at(?:\\s+(?:sign|symbol))?\\s+${DOMAIN}`;
const PROVIDERS = 'gmail|googlemail|yahoo|hotmail|outlook|icloud|aol|proton(?:mail)?';
const PLACES = 'office|offices|hq|headquarters|campus|building|store|team|conference';
const EMAIL: readonly RegExp[] = [
  /@|%40|&#0*64;|&#x0*40;|&commat;/i,
  /[([{<]\s*(?:at|dot)\s*[)\]}>]/i,
  new RegExp(`${AT}\\.\\p{L}[\\p{L}\\p{N}]+`, 'iu'),
  new RegExp(`${AT}\\s+\\.\\s*\\p{L}{2,}`, 'iu'),
  new RegExp(`${AT}\\.\\s+(?:com|net|org|edu|gov|io)\\b`, 'iu'),
  new RegExp(`${AT}\\.\\s+\\p{L}{2,}(?:\\s*$|\\.[\\p{L}\\p{N}])`, 'iu'),
  new RegExp(`${AT}\\s+dot\\s+\\S{2,}`, 'iu'),
  /\bdot\s+(?:com|net|org|edu|gov|io|co|us|uk)\b/i, // kept exactly as the replaced check had it
  // "at" a mail provider ("email jo at gmail later"), unless a place noun follows
  // ("meet at gmail HQ"). Cost: "works at Yahoo" is refused too.
  new RegExp(`\\bat\\s+(?:${PROVIDERS})\\b(?!\\s+(?:${PLACES})\\b)`, 'i'),
];

/** True when the text holds a phone number or an email address (see the gaps above). */
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

const ISO_DATE = new RegExp(`^${YEAR}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$`);

/**
 * May this value be stored under this attribute? Fail closed: a stored value with 7+
 * digits in total is refused, however letters split them ("born in 1987, moved
 * 2015" too; dates belong in typed fields such as validFrom). The only exceptions
 * are whole-value typed shapes: a phone attribute holding an E.164 number, and a
 * birthday that is exactly one ISO date.
 */
export function isContactValueAllowed(attribute: string, value: string): boolean {
  if (attribute === 'phone') return toE164(value) !== null;
  if (attribute === 'birthday' && ISO_DATE.test(value)) return true;
  return !containsContactData(value) && digitCount(fold(value)) < MIN_DIALABLE;
}
