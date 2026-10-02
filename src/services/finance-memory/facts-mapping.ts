/**
 * Extracted facts labelled `finance` (or with a money key) → money memory.
 *
 * Extraction is asked for these keys (memory/dynamic/extraction-prompts.ts):
 * `income`, `income_change`, `budget_habit`, `savings_goal`, `debt`,
 * `debt_paid_off`, `planned_purchase`, `big_purchase`, `bill_due`,
 * `money_worry`, `money_win`, `money_feeling`, `financial_decision`.
 *
 * Inferred items never keep an amount: amounts are stripped from the text.
 *
 * @module services/finance-memory/facts-mapping
 */

import { redactFinancialSecrets, isSecretFactKey } from '../../utils/financial-redaction.js';
import { categoryForFactType } from '../memory-consent/classifier.js';
import type { FinanceMention } from './detect.js';
import type { FinanceKind, FinanceStatus } from './types.js';

const SELF = /^(user|me|self|i|myself|the user)$/i;
const AMOUNT =
  /(?:(?:about|around|roughly|nearly|almost|over|under) )?(?:[$£€]\s?\d[\d,.]*\s?(?:k|m|million|thousand|grand)?\b|\b\d[\d,.]*\s?(?:k|thousand|grand|million)?\s?(?:dollars?|bucks|pounds?|euros?)\b)(?:\s?(?:in|of|on|worth)\b)?/gi;

const KEY_KINDS: ReadonlyArray<[RegExp, FinanceKind, FinanceStatus?]> = [
  [/^(income_change|raise|pay_cut|bonus)$/, 'income', 'done'],
  [/^(income|salary|earnings|wage|pay)$/, 'income'],
  [/budget/, 'budget'],
  [/^(savings_goal|saving_for|saving|savings)$/, 'savings'],
  [/^debt_paid_off$|paid_off/, 'debt', 'done'],
  [/debt|loan|owes?$/, 'debt'],
  [/^big_purchase$|bought/, 'purchase', 'done'],
  [/purchase|buying/, 'purchase', 'planned'],
  [/bill|rent_due|due_date/, 'bill'],
  [/worry|stress|concern/, 'worry'],
  [/win|milestone/, 'win', 'done'],
  [/feeling|attitude|relationship_with_money/, 'feeling'],
  [/decision|deciding/, 'decision'],
];

const VALUE_KINDS: ReadonlyArray<[RegExp, FinanceKind]> = [
  [/worr|stress|anxi|tight|broke|afford/i, 'worry'],
  [/debt|loan|owe|credit card/i, 'debt'],
  [/sav(?:e|ing)s? (?:for|up)|emergency fund/i, 'savings'],
  [/salary|income|earns?|raise|paycheck/i, 'income'],
  [/budget/i, 'budget'],
];

/** Kind (and status) for an extracted money fact, or null when it isn't one we keep. */
export function kindForFinanceFact(
  key: string,
  value: string
): { kind: FinanceKind; status?: FinanceStatus } | null {
  const k = key
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  for (const [re, kind, status] of KEY_KINDS) {
    if (re.test(k)) return { kind, ...(status ? { status } : {}) };
  }
  for (const [re, kind] of VALUE_KINDS) if (re.test(value)) return { kind };
  return null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** A finance fact about the user → a mention (no amount), or null. */
export function factToMention(d: Record<string, unknown>): FinanceMention | null {
  const typed = categoryForFactType(str(d.factType)) === 'finances';
  const category = str(d.category).toLowerCase();
  const isFinance = typed || category === 'finances' || category === 'finance';
  const entity = str(d.entityName) || 'user';
  const key = str(d.key);
  if (!isFinance || !SELF.test(entity.trim()) || isSecretFactKey(key)) return null;
  const raw = str(d.value) || str(d.text);
  const clean = redactFinancialSecrets(raw, { strict: true })
    .text.replace(AMOUNT, '')
    .replace(/\[removed\]/g, '')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 3) return null;
  const kind = kindForFinanceFact(key, clean);
  if (!kind) return null;
  const confidence = typeof d.confidence === 'number' ? Math.min(0.85, d.confidence) : 0.6;
  const subject = clean
    .toLowerCase()
    .replace(/^(?:saving|savings|save) (?:up )?for (?:a |an |the |my )?/, '')
    .slice(0, 60);
  return {
    kind: kind.kind,
    subject,
    text: clean.charAt(0).toUpperCase() + clean.slice(1),
    ...(kind.status ? { status: kind.status } : {}),
    confidence,
  };
}
