/**
 * The search tokens a keyword query can send to Firestore.
 *
 * Firestore expands `array-contains-any` x `in` into one disjunction per pair
 * and refuses more than 30 (and more than 30 values in `array-contains-any`).
 * Proactive surfacing searches four entity types, so any turn with more than
 * 7 distinct words failed with "Too many disjunctions after normalization"
 * (14 times in one dev run, 2026-10-05) and surfaced nothing. The longest
 * words are kept: they are the most specific.
 *
 * @module memory/entity-store/query-tokens
 */

const MAX_DISJUNCTIONS = 30;

export function queryTokens(tokens: readonly string[], typeFilterCount = 0): string[] {
  const max = Math.floor(MAX_DISJUNCTIONS / Math.max(1, typeFilterCount));
  return [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, max);
}
