/**
 * Shared vocabulary and helpers for the money detectors.
 *
 * @module services/finance-memory/detect-helpers
 */

import type { FinanceAmount, FinanceKind, FinanceStatus } from './types.js';

export interface FinanceMention {
  readonly kind: FinanceKind;
  readonly subject: string;
  readonly text: string;
  readonly status?: FinanceStatus;
  readonly amount?: FinanceAmount;
  readonly dueDay?: number;
  readonly confidence: number;
}

export const MONEY_HINT =
  /\b(money|debt|loan|owe|credit|budget|sav(?:e|ing|ed)|afford|broke|rent|mortgage|bill|paycheck|salary|income|earn|make|raise|pay|paid|bought|buy|purchase|refinanc|invest|financ|spend|bonus|unemployment|benefits|pension|fund|dollars?|bucks|grand|[$£€]\d)/i;
export const NEGATED =
  /\b(?:don'?t|do not|never|no longer|not|isn'?t|aren'?t|haven'?t|didn'?t|won'?t|nothing)\b/i;
export const QUESTION =
  /^\s*(?:what|how|why|is|are|do|does|can|could|should i know|who)\b.*\?\s*$/i;

const DEBT_TYPES: ReadonlyArray<[RegExp, string]> = [
  [/credit cards?/i, 'credit card'],
  [/student loans?/i, 'student loans'],
  [/car (?:loan|payment)s?|auto loan/i, 'car loan'],
  [/medical (?:debt|bills?)/i, 'medical bills'],
  [/payday loans?/i, 'payday loan'],
  [/personal loans?/i, 'personal loan'],
  [/tax(?:es)? (?:debt|bill)|back taxes|the irs/i, 'taxes'],
  [/mortgage/i, 'mortgage'],
  [/(?:my|our) (?:parents|mom|dad|family)/i, 'family loan'],
];

export const BIG_ITEMS =
  /\b(house|home|condo|apartment|flat|townhouse|car|truck|suv|van|vehicle|motorcycle|boat|engagement ring|ring|laptop|computer|macbook|tv|couch|sofa|furniture|land|property|piano|e-?bike|camper|rv)\b/i;

/** Money topics, most specific first ("paying rent" is about rent). */
const MONEY_TOPICS: readonly string[] = [
  'rent',
  'mortgage',
  'credit card',
  'student loans',
  'debt',
  'loans',
  'loan',
  'bills',
  'bill',
  'taxes',
  'retirement',
  'savings',
  'budget',
  'paycheck',
  'income',
  'expenses',
  'my job',
  'finances',
  'money',
  'credit',
  'afford',
  'paying',
];

/** The money topic a phrase is about, or null. */
export function moneyTopicOf(phrase: string): string | null {
  const p = phrase.toLowerCase();
  const hit = MONEY_TOPICS.find((t) => new RegExp(`\\b${t}\\b`).test(p));
  if (!hit) return null;
  if (hit === 'afford' || hit === 'paying') return 'money';
  return hit.replace(/^my /, '');
}

export const ORDINAL_WORDS: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  'twenty-first': 21,
  'twenty-second': 22,
  'twenty-third': 23,
  'twenty-fourth': 24,
  'twenty-fifth': 25,
  'twenty-sixth': 26,
  'twenty-seventh': 27,
  'twenty-eighth': 28,
  'twenty-ninth': 29,
  thirtieth: 30,
  'thirty-first': 31,
};

/** "my car" → "their car". */
export function thirdPerson(s: string): string {
  return s
    .replace(/\bmy\b/gi, 'their')
    .replace(/\bour\b/gi, 'their')
    .replace(/\bmyself\b/gi, 'themselves')
    .replace(/\bme\b/gi, 'them')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tidy(s: string | undefined): string {
  return (s ?? '')
    .replace(/\b(?:right now|now|lately|soon|again|too|though|anyway|so far)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripArticle(s: string): string {
  return s
    .replace(/^(?:a|an|the|my|our|some|new|used|first)\s+/gi, '')
    .replace(/^(?:new|used|first)\s+/i, '');
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function debtType(clause: string): string | null {
  return DEBT_TYPES.find(([re]) => re.test(clause))?.[1] ?? null;
}

export type Detector = (clause: string, negated: boolean) => FinanceMention[];
