/**
 * Speech-ready text: numbers, money, times, dates and abbreviations written
 * the way they are said, before phrasing looks for boundaries (so the comma
 * in "4,200" or the period in "Mrs." can never read as a pause).
 *
 * Conservative by design: small whole numbers ("3 ideas") are left for the
 * voice, a bare "3/4" stays a fraction unless a word like "on" or "by" says
 * it is a date, and nothing inside [...] or <...> markup is touched.
 *
 * Reuses COMMON_ABBREVIATIONS from src/ssml/constants (spec §4.1) except two
 * entries handled here instead: "vs." (the shared pattern leaves a stray
 * period that reads as a sentence end) and "PM" (it would respell the clock
 * times this module writes).
 *
 * @module speech/tts-gateway/director/normalize
 */

import { COMMON_ABBREVIATIONS } from '../../../ssml/constants/common-abbreviations.js';
import {
  decimalToWords,
  digitsToWords,
  integerToWords,
  ordinalToWords,
  yearToWords,
} from './spoken-numbers.js';

export interface NormalizeResult {
  text: string;
  /** How many rewrites were made (for the shadow log; never the text). */
  count: number;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTH_BY_PREFIX = new Map<string, string>(
  MONTHS.flatMap((m) => [
    [m, m],
    [m.slice(0, 3), m],
  ])
);
MONTH_BY_PREFIX.set('Sept', 'September');
const MONTH_NAME =
  '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';

const SCALE_WORDS: Record<string, string> = {
  k: 'thousand',
  m: 'million',
  b: 'billion',
  bn: 'billion',
  thousand: 'thousand',
  million: 'million',
  billion: 'billion',
  trillion: 'trillion',
};

const TITLES: Record<string, string> = { Mr: 'Mister', Mrs: 'Missus', Ms: 'Miz', Dr: 'Doctor' };

const SHARED_ABBREVIATIONS = COMMON_ABBREVIATIONS.filter(
  (e) => e.description !== 'Versus' && e.description !== 'Project Manager or Product Manager'
);

/** Words that make a bare "10/3" a date rather than a fraction. */
const DATE_LEAD = /\b(?:on|by|until|till|from|since|before|after|through|due)\s+$/i;

type Rule = (text: string, count: () => void) => string;

const dollars = (n: number): string => `${integerToWords(n)} dollar${n === 1 ? '' : 's'}`;
const cents = (n: number): string => `${integerToWords(n)} cent${n === 1 ? '' : 's'}`;

function money(whole: string, fraction: string | undefined, scale: string | undefined): string {
  if (scale) {
    const amount = decimalToWords(fraction ? `${whole}.${fraction}` : whole);
    return `${amount} ${SCALE_WORDS[scale.toLowerCase()]} dollars`;
  }
  const n = Number(whole.replace(/,/g, ''));
  const c = fraction ? Number(fraction.padEnd(2, '0').slice(0, 2)) : 0;
  if (n === 0 && c) return cents(c);
  return c ? `${dollars(n)} and ${cents(c)}` : dollars(n);
}

function clock(hour: number, minute: number, meridiem: string | undefined): string {
  const h = integerToWords(hour);
  const suffix = meridiem ? ` ${meridiem.toUpperCase()}M` : '';
  if (minute === 0) return meridiem ? `${h}${suffix}` : `${h} o'clock`;
  const m = minute < 10 ? `oh ${integerToWords(minute)}` : integerToWords(minute);
  return `${h} ${m}${suffix}`;
}

/** Keep the period a "p.m." swallowed when it also ended the sentence. */
function keepSentenceEnd(dot: string | undefined, rest: string): string {
  return dot && /^(\s+[A-Z]|\s*$)/.test(rest) ? '.' : '';
}

function fullYear(y: string): number {
  const n = Number(y);
  if (y.length === 4) return n;
  return n < 50 ? 2000 + n : 1900 + n;
}

const RULES: readonly Rule[] = [
  // Phone numbers: digit by digit, grouped by pauses.
  (t, hit) =>
    t.replace(
      /(?<!\d)\(?(\d{3})\)?[-. ](\d{3})[-.](\d{4})(?!\d)/g,
      (_m, a: string, b: string, c: string) => {
        hit();
        return `${digitsToWords(a)}, ${digitsToWords(b)}, ${digitsToWords(c)}`;
      }
    ),
  // Money: $4,200 / $4.50 / $1.5M / $20k / $3 billion.
  (t, hit) =>
    t.replace(
      /\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(k|K|M|B|bn|thousand|million|billion|trillion)\b)?/g,
      (_m, whole: string, fraction?: string, scale?: string) => {
        hit();
        return money(whole, fraction, scale);
      }
    ),
  // Percentages.
  (t, hit) =>
    t.replace(/(\d+(?:\.\d+)?)\s?%/g, (_m, n: string) => {
      hit();
      return `${decimalToWords(n)} percent`;
    }),
  // Clock times with minutes: 3:30, 3:30 p.m., 9:05am.
  (t, hit) =>
    t.replace(
      /\b(\d{1,2}):(\d{2})(?:\s?([ap])\.?\s?m(?![a-z])(\.)?)?/gi,
      (
        match,
        h: string,
        m: string,
        mer: string | undefined,
        dot: string | undefined,
        offset: number,
        all: string
      ) => {
        if (Number(h) > 23 || Number(m) > 59) return match;
        hit();
        const rest = all.slice(offset + match.length);
        return clock(Number(h), Number(m), mer) + keepSentenceEnd(dot, rest);
      }
    ),
  // Clock times on the hour: 7pm, 7 p.m.
  (t, hit) =>
    t.replace(
      /\b(\d{1,2})\s?([ap])\.?\s?m(?![a-z])(\.)?/gi,
      (match, h: string, mer: string, dot: string | undefined, offset: number, all: string) => {
        if (Number(h) < 1 || Number(h) > 12) return match;
        hit();
        return clock(Number(h), 0, mer) + keepSentenceEnd(dot, all.slice(offset + match.length));
      }
    ),
  // Month-name dates: Oct. 3 / October 3rd, 2026.
  (t, hit) =>
    t.replace(
      new RegExp(`\\b${MONTH_NAME}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'g'),
      (match, month: string, day: string, year?: string) => {
        const d = Number(day);
        if (d < 1 || d > 31) return match;
        hit();
        const name = MONTH_BY_PREFIX.get(month) ?? month;
        return `${name} ${ordinalToWords(d)}${year ? `, ${yearToWords(Number(year))}` : ''}`;
      }
    ),
  // Month and year: March 2020.
  (t, hit) =>
    t.replace(new RegExp(`\\b${MONTH_NAME}\\.?\\s+(\\d{4})\\b`, 'g'), (_m, month: string, y) => {
      hit();
      return `${MONTH_BY_PREFIX.get(month) ?? month} ${yearToWords(Number(y))}`;
    }),
  // Slash dates: 7/4/1999 always; 10/3 only after "on", "by", "due"...
  (t, hit) =>
    t.replace(
      /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g,
      (match, mo: string, d: string, y: string | undefined, offset: number, all: string) => {
        const month = Number(mo);
        const day = Number(d);
        if (month < 1 || month > 12 || day < 1 || day > 31) return match;
        if (!y && !DATE_LEAD.test(all.slice(0, offset))) return match;
        hit();
        const year = y ? `, ${yearToWords(fullYear(y))}` : '';
        return `${MONTHS[month - 1]} ${ordinalToWords(day)}${year}`;
      }
    ),
  // Ordinals: 22nd.
  (t, hit) =>
    t.replace(/\b(\d+)(?:st|nd|rd|th)\b/g, (_m, n: string) => {
      hit();
      return ordinalToWords(Number(n));
    }),
  // Years after a time word: in 1998, since 2020.
  (t, hit) =>
    t.replace(
      /\b(in|since|by|from|until|of|during|before|after|year)\s+(1[1-9]\d{2}|20\d{2})\b(?!,\d)/gi,
      (_m, lead: string, y: string) => {
        hit();
        return `${lead} ${yearToWords(Number(y))}`;
      }
    ),
  // Grouped numbers and decimals: 12,500 / 3.5.
  (t, hit) =>
    t.replace(/(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+)(?!\.?\d)/g, (_m, n: string) => {
      hit();
      return decimalToWords(n);
    }),
  // Long whole numbers: 1500.
  (t, hit) =>
    t.replace(/(?<![\d.,])([1-9]\d{3,})(?![\d,]|\.\d)/g, (_m, n: string) => {
      hit();
      return integerToWords(Number(n));
    }),
  // Abbreviations whose period must not survive as a sentence end.
  (t, hit) =>
    t
      .replace(/\b(Mr|Mrs|Ms|Dr)\.\s+(?=[A-Z])/g, (_m, title: string) => {
        hit();
        return `${TITLES[title]} `;
      })
      .replace(/\bvs\.?(?=[\s,]|$)/gi, () => {
        hit();
        return 'versus';
      })
      .replace(/\be\.g\.(?=[\s,]|$)/gi, () => {
        hit();
        return 'for example';
      })
      .replace(/\bi\.e\.(?=[\s,]|$)/gi, () => {
        hit();
        return 'that is';
      })
      .replace(/\bapprox\.(?=\s)/gi, () => {
        hit();
        return 'approximately';
      })
      // "etc." that also ends the sentence keeps its period.
      .replace(/\betc\.(?=\s+[A-Z]|\s*$)/g, () => {
        hit();
        return 'et cetera.';
      })
      .replace(/\betc\./g, () => {
        hit();
        return 'et cetera';
      }),
  // The shared pronunciation list (FYI, ASAP, CEO, units...).
  (t, hit) => {
    let out = t;
    for (const { pattern, replacement } of SHARED_ABBREVIATIONS) {
      out = out.replace(pattern, (...args: unknown[]) => {
        hit();
        const groups = args.slice(1, -2) as string[];
        return replacement.replace(/\$(\d)/g, (_g, i: string) => groups[Number(i) - 1] ?? '');
      });
    }
    return out;
  },
];

/** Split off [...] and <...> markup so rules only see speakable text. */
const MARKUP = /(\[[^\]]*\]|<[^>]*>)/;

export function normalizeForSpeech(text: string): NormalizeResult {
  let count = 0;
  const hit = (): void => {
    count++;
  };
  const out = text
    .split(MARKUP)
    .map((part, i) => (i % 2 === 1 ? part : RULES.reduce((acc, rule) => rule(acc, hit), part)))
    .join('');
  return { text: out, count };
}
