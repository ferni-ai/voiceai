/**
 * Numbers as people say them (US English): integers, decimals, ordinals,
 * years and digit strings. Pure functions; used by normalize.ts.
 *
 * @module speech/tts-gateway/director/spoken-numbers
 */

const ONES = [
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
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

/** 0-999 as words. */
function underThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest >= 20) {
    parts.push(rest % 10 ? `${TENS[Math.floor(rest / 10)]}-${ONES[rest % 10]}` : TENS[rest / 10]);
  } else if (rest || !hundreds) {
    parts.push(ONES[rest]);
  }
  return parts.join(' ');
}

/** A non-negative integer as words; numbers past the trillions stay digits. */
export function integerToWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e15) return String(n);
  if (n < 1000) return underThousand(n);
  const parts: string[] = [];
  let scale = 0;
  let rest = n;
  while (rest > 0) {
    const group = rest % 1000;
    if (group) parts.unshift(`${underThousand(group)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return parts.join(' ');
}

/** Each digit as a word: "4567" → "four five six seven". */
export function digitsToWords(digits: string): string {
  return [...digits].map((d) => ONES[Number(d)]).join(' ');
}

/** "3.5" → "three point five"; the fractional part is read digit by digit. */
export function decimalToWords(value: string): string {
  const [whole, fraction] = value.replace(/,/g, '').split('.');
  const head = integerToWords(Number(whole || '0'));
  return fraction ? `${head} point ${digitsToWords(fraction)}` : head;
}

const ORDINAL_IRREGULAR: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

/** 22 → "twenty-second". */
export function ordinalToWords(n: number): string {
  const words = integerToWords(n);
  const match = /([a-z]+)$/.exec(words);
  if (!match) return words;
  const last = match[1];
  let ordinal: string;
  if (ORDINAL_IRREGULAR[last]) ordinal = ORDINAL_IRREGULAR[last];
  else if (last.endsWith('y')) ordinal = `${last.slice(0, -1)}ieth`;
  else ordinal = `${last}th`;
  return words.slice(0, match.index) + ordinal;
}

/** A calendar year: 2026 → "twenty twenty-six", 2005 → "two thousand five". */
export function yearToWords(year: number): string {
  if (year >= 2000 && year < 2010) return integerToWords(year);
  const high = Math.floor(year / 100);
  const low = year % 100;
  if (low === 0) return `${integerToWords(high)} hundred`;
  const tail = low < 10 ? `oh ${ONES[low]}` : integerToWords(low);
  return `${integerToWords(high)} ${tail}`;
}
