/**
 * Money amounts as the user said them, and the rounded, conversational form
 * used in prompts ("about $2k a month").
 *
 * An amount is only kept when the user said it in their own words; summaries
 * and inferred facts never add one.
 *
 * @module services/finance-memory/amounts
 */

import type { AmountPeriod, Currency, FinanceAmount } from './types.js';

const SYMBOLS: Readonly<Record<string, Currency>> = { $: 'USD', '£': 'GBP', '€': 'EUR' };
const WORDS: ReadonlyArray<[RegExp, Currency]> = [
  [/^(?:dollars?|bucks?|usd)$/i, 'USD'],
  [/^(?:pounds?|quid|gbp)$/i, 'GBP'],
  [/^(?:euros?|eur)$/i, 'EUR'],
];

const MULTIPLIERS: Readonly<Record<string, number>> = {
  k: 1_000,
  thousand: 1_000,
  grand: 1_000,
  m: 1_000_000,
  mil: 1_000_000,
  million: 1_000_000,
};

const PERIODS: ReadonlyArray<[RegExp, AmountPeriod]> = [
  [/^\s*every (?:two|2|other) weeks\b|^\s*bi-?weekly\b/i, 'biweekly'],
  [/^\s*(?:a|per|each|every|\/)\s*(?:month|mo)\b|^\s*monthly\b/i, 'month'],
  [/^\s*(?:a|per|each|every|\/)\s*(?:year|yr|annum)\b|^\s*(?:yearly|annually)\b/i, 'year'],
  [/^\s*(?:a|per|each|every|\/)\s*(?:week|wk)\b|^\s*weekly\b/i, 'week'],
];

// "$2,000" "$2k" "$1.5 million" "2000 dollars" "2 grand" "£500"
const AMOUNT_RE =
  /([$£€])\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|m|mil|thousand|grand|million)?\b|\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|thousand|grand|million)?\s?(dollars?|bucks?|pounds?|quid|euros?|usd|gbp|eur)?\b/gi;

/** The first money amount in the text, with its period, or null. */
export function parseAmount(text: string): FinanceAmount | null {
  if (!text) return null;
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const symbol = m[1];
    const raw = symbol ? m[2] : m[4];
    const mult = (symbol ? m[3] : m[5])?.toLowerCase();
    const word = m[6];
    // A bare number needs a currency word or "k/grand": "5 years" is not money.
    if (!symbol && !word && !(mult && mult !== 'm')) continue;
    let currency: Currency = symbol ? (SYMBOLS[symbol] ?? 'USD') : 'USD';
    if (!symbol && word) currency = WORDS.find(([re]) => re.test(word))?.[1] ?? 'USD';
    const value = Number(raw?.replace(/,/g, '')) * (mult ? (MULTIPLIERS[mult] ?? 1) : 1);
    if (!Number.isFinite(value) || value <= 0 || value > 1e10) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 24);
    let period: AmountPeriod | undefined;
    let periodText = '';
    for (const [re, p] of PERIODS) {
      const pm = after.match(re);
      if (pm) {
        period = p;
        periodText = pm[0];
        break;
      }
    }
    return {
      value: Math.round(value * 100) / 100,
      currency,
      ...(period ? { period } : {}),
      said: `${m[0]}${periodText}`.trim().slice(0, 60),
    };
  }
  return null;
}

const SIGN: Readonly<Record<Currency, string>> = { USD: '$', GBP: '£', EUR: '€' };
const PERIOD_WORDS: Readonly<Record<AmountPeriod, string>> = {
  week: ' a week',
  biweekly: ' every two weeks',
  month: ' a month',
  year: ' a year',
};

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** Rounded, spoken-style amount: "about $2k a month", "about $350", "about $1.2M". */
export function formatAmountConversational(amount: FinanceAmount): string {
  const sign = SIGN[amount.currency] ?? '$';
  const v = amount.value;
  let body: string;
  if (v < 100) body = `${sign}${Math.max(5, Math.round(v / 5) * 5)}`;
  else if (v < 1_000) body = `${sign}${Math.round(v / 50) * 50}`;
  else if (v < 10_000) body = `${sign}${trim(Math.round(v / 500) / 2)}k`;
  else if (v < 1_000_000) body = `${sign}${Math.round(v / 1_000)}k`;
  else body = `${sign}${trim(Math.round(v / 100_000) / 10)}M`;
  return `about ${body}${amount.period ? PERIOD_WORDS[amount.period] : ''}`;
}
