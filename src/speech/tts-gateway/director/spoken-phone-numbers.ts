/**
 * A phone number the LLM wrote in a shape Sonic reads as an amount, rewritten
 * as (NNN) NNN-NNNN, the form Cartesia's prompting guide lists and Sonic reads
 * digit by digit.
 *
 * Measured 2026-10-29 (pronunciation round trip): a 3-3-4 number grouped with
 * commas was read as three amounts in 3 of 3 takes ("415, 555, 7123" as "four
 * hundred fifteen, five hundred fifty-five, seven thousand one hundred
 * twenty-three"), and digit by digit as (415) 555-7123. The parenthesised,
 * dashed, dotted and bare ten-digit forms were all read digit by digit, so
 * they are left alone; +1 E.164 was heard in odd digit pairs by one of the
 * two listeners and is written out too.
 *
 * Two shapes are rewritten:
 * - three groups, 3-3-4 digits, with the same separator between them (", ",
 *   "," or a space): "415, 555, 0147", "415 555 0147";
 * - +1 then ten digits, plain or punctuated: "+14155550147", "+1 415-555-0147".
 *
 * Everything else is a number Sonic already says right and stays as written:
 * money ("$1,200"), counts ("1,500 people", "12,500 steps"), years, times,
 * "401k", other countries' numbers. A grouped number is only a phone number
 * when its area code and exchange start with 2-9 (NANP), and round groups
 * ("200, 300, 1000") are read as the list of counts they almost always are.
 *
 * @module speech/tts-gateway/director/spoken-phone-numbers
 */

/** 3-3-4 groups with one repeated separator, not part of a longer number or an amount. */
const GROUPED = /(?<![\d$€£#+.,-])\b([2-9]\d{2})(,\s?|\s)([2-9]\d{2})\2(\d{4})\b(?![\d%]|[.,]\d)/g;
/** +1 and ten digits, optionally grouped by spaces, dots, dashes or parentheses. */
const E164_US =
  /(?<![\w+])\+1[\s.-]?\(?(\d{3})\)?(?:,\s?|[\s.-])?(\d{3})(?:,\s?|[\s.-])?(\d{4})(?![\d%]|[.,]\d)/g;

const dialable = (area: string, exchange: string, line: string): string =>
  `(${area}) ${exchange}-${line}`;

/** "250, 500, 1000" is a list of counts; a phone number almost never has round groups. */
function roundCounts(exchange: string, line: string): boolean {
  return exchange.endsWith('0') && line.endsWith('00');
}

/** Rewrite the phone numbers in `text`; `hit` is called once per rewrite. */
export function writePhoneNumbersAsDigits(text: string, hit: () => void): string {
  return text
    .replace(E164_US, (_m, area: string, exchange: string, line: string) => {
      hit();
      return dialable(area, exchange, line);
    })
    .replace(GROUPED, (match, area: string, _sep: string, exchange: string, line: string) => {
      if (roundCounts(exchange, line)) return match;
      hit();
      return dialable(area, exchange, line);
    });
}
