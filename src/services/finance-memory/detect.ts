/**
 * High-precision, first-person money detector for user turns.
 *
 * "I'm paying off my credit card", "we're saving for a house", "my rent is due
 * on the 1st", "money is tight", "I'm trying to decide whether to refinance".
 * Not: "my brother is broke", "I don't have any debt", "what's a 401k?".
 *
 * Text is redacted (strict) before matching, so no secret can reach a
 * mention. Amounts are kept only when they were said in the same sentence.
 *
 * @module services/finance-memory/detect
 */

import { redactFinancialSecrets } from '../../utils/financial-redaction.js';
import {
  MONEY_HINT,
  NEGATED,
  QUESTION,
  type Detector,
  type FinanceMention,
} from './detect-helpers.js';
import { decision, feeling, win, worry } from './detect-feelings.js';
import { bill, budget, debt, income, purchase, savings } from './detect-money.js';

export { thirdPerson, type FinanceMention } from './detect-helpers.js';

const DETECTORS: readonly Detector[] = [
  income,
  budget,
  savings,
  debt,
  purchase,
  bill,
  worry,
  win,
  feeling,
  decision,
];

/** Money things the user said about themselves in this text. */
export function detectFinanceMentions(text: string): FinanceMention[] {
  if (!text || text.length < 6) return [];
  const clean = redactFinancialSecrets(text, { strict: true }).text;
  const out = new Map<string, FinanceMention>();
  for (const raw of clean.split(/(?<=[.!?;])\s+|\n+|\s+but\s+/i)) {
    const clause = raw.trim();
    if (clause.length < 6 || !MONEY_HINT.test(clause) || QUESTION.test(clause)) continue;
    if (!/\b(?:i|i'm|i've|im|we|we're|we've|my|our|money)\b/i.test(clause)) continue;
    const negated = NEGATED.test(clause);
    for (const detect of DETECTORS) {
      for (const m of detect(clause, negated)) {
        const key = `${m.kind}|${m.subject}`;
        if (!out.has(key)) out.set(key, m);
      }
    }
  }
  return [...out.values()];
}
