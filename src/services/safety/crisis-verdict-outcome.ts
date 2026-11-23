/**
 * A classifier verdict in the pattern guard's terms (crisis-classifier.ts re-exports both).
 *
 * @module CrisisVerdictOutcome
 */
import type { CrisisVerdict } from './crisis-classifier.js';

/** What the pattern guard decided for the same turn. */
export type PatternOutcome = 'block' | 'crisis' | 'none';

export function verdictOutcome(verdict: CrisisVerdict): PatternOutcome {
  if (verdict.risk === 'none') return 'none';
  return verdict.risk === 'imminent' && verdict.subject === 'self' ? 'block' : 'crisis';
}
