/**
 * A phone number the LLM wrote in a shape Sonic reads as an amount, rewritten
 * as (NNN) NNN-NNNN, the form Cartesia's prompting guide lists and Sonic reads
 * digit by digit.
 *
 * Measured 2026-10-29 (pronunciation round trip): a 3-3-4 number grouped with
 * commas was read as three amounts in 3 of 3 takes ("415, 555, 0123" as "four
 * hundred fifteen, five hundred fifty-five, ..."), and digit by digit as
 * (415) 555-0123. The parenthesised, dashed, dotted and bare ten-digit forms
 * were all read digit by digit, so they are left alone; +1 E.164 was heard in
 * odd digit pairs by one of the two listeners and is written out too.
 *
 * Rewritten:
 * - +1 then ten digits, plain or punctuated: "+14155550123", "+1 415-555-0123";
 * - 1 then three groups, 3-3-4, with one repeated separator (", ", "," or a
 *   space): "1 415 555 0123";
 * - three such groups alone ("415, 555, 0123", "415 555 0123") only after a
 *   phone cue (number, phone, call, text, cell, dial, reach, mobile, landline,
 *   at) within the four words before it, counting what the reply already said.
 *   Without a cue, "250, 375, 1200 calories" or "512 768 1024" is a list of
 *   amounts and is read as one.
 *
 * Everything else stays as written: money ("$1,200"), counts ("1,500 people"),
 * years, times, "401k", and other countries' numbers ("+44 207 946 0958"). A
 * grouped number is only a phone number when its area code and exchange start
 * with 2-9 (NANP), and round groups ("200, 300, 1000") are always counts.
 *
 * @module speech/tts-gateway/director/spoken-phone-numbers
 */

/** 3-3-4 groups with one repeated separator, not part of a longer number, an amount or a non-US number. */
const GROUPED =
  /(?<![\d$€£#+.,-])(?<!\+\d{1,3}[\s.-]?)\b([2-9]\d{2})(,\s?|\s)([2-9]\d{2})\2(\d{4})\b(?![\d%]|[.,]\d)/g;
/** A leading 1 and the same groups: "1 415 555 0123", "1, 415, 555, 0123". */
const LEADING_ONE =
  /(?<![\w$€£#+.,-])\b1(,\s?|\s)([2-9]\d{2})\1([2-9]\d{2})\1(\d{4})\b(?![\d%]|[.,]\d)/g;
/** +1 and ten digits, optionally grouped by spaces, dots, dashes or parentheses. */
const E164_US =
  /(?<![\w+])\+1[\s.-]?\(?(\d{3})\)?(?:,\s?|[\s.-])?(\d{3})(?:,\s?|[\s.-])?(\d{4})(?![\d%]|[.,]\d)/g;
/** Words that make the next number a phone number. */
const PHONE_CUE =
  /^(?:numbers?|phones?|call(?:s|ed|ing)?|texts?|texted|texting|cells?|dial(?:s|ed|ing)?|reach(?:ed|ing)?|mobile|landline|at)$/;
const CUE_WINDOW = 4;

const dialable = (area: string, exchange: string, line: string): string =>
  `(${area}) ${exchange}-${line}`;

/** "250, 500, 1000" is a list of counts; a phone number almost never has round groups. */
function roundCounts(exchange: string, line: string): boolean {
  return exchange.endsWith('0') && line.endsWith('00');
}

/** True when one of the last few words (numbers not counted) is a phone cue. */
function followsPhoneCue(before: string): boolean {
  const words = before
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && !/^\d+$/.test(w));
  return words.slice(-CUE_WINDOW).some((w) => PHONE_CUE.test(w));
}

/**
 * Rewrite the phone numbers in `text`; `hit` is called once per rewrite.
 * `said` is what the reply said before `text`, so a cue in an earlier push counts.
 */
export function writePhoneNumbersAsDigits(text: string, hit: () => void, said = ''): string {
  return text
    .replace(E164_US, (_m, area: string, exchange: string, line: string) => {
      hit();
      return dialable(area, exchange, line);
    })
    .replace(LEADING_ONE, (_m, _sep: string, area: string, exchange: string, line: string) => {
      hit();
      return dialable(area, exchange, line);
    })
    .replace(GROUPED, (...m: [string, string, string, string, string, number, string]) => {
      const [match, area, , exchange, line, at, all] = m;
      if (roundCounts(exchange, line) || !followsPhoneCue(said + all.slice(0, at))) return match;
      hit();
      return dialable(area, exchange, line);
    });
}
