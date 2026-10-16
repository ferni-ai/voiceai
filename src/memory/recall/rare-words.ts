/**
 * RECALL_RARE_WORDS: weigh a shared word by how rare it is among the caller's
 * facts (session-recall.ts recallForTurn). Split out of session-recall.ts to
 * keep it under the 500-line limit.
 *
 * @module memory/recall/rare-words
 */

/** RECALL_RARE_WORDS=on: shared words count by how rare they are among the caller's facts. */
export function rareWordsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.RECALL_RARE_WORDS === 'on';
}

/** Too few facts to say which words are common. */
const MIN_FACTS_FOR_WEIGHTS = 5;
/** A fact matched only by words this common (and not named or meant) is left out. */
export const MIN_WEIGHTED_OVERLAP = 0.35;

/**
 * BM25-style rarity of each word across the caller's facts, scaled so a
 * word found in one fact counts 1, as every word did before. "work" in five
 * of fourteen facts counted as much as "hospital" in none, and brought
 * "works long shifts" to a question about a previous employer (memory
 * benchmark, 2026-10-11). `wordsOf` is session-recall's contentWords.
 */
export function weighWords(
  facts: readonly { entity: string; key: string; value: string }[],
  wordsOf: (text: string) => Set<string>
): Map<string, number> | undefined {
  const n = facts.length;
  if (n < MIN_FACTS_FOR_WEIGHTS) return undefined;
  const df = new Map<string, number>();
  for (const f of facts) {
    for (const w of wordsOf(`${f.entity} ${f.key} ${f.value}`)) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const idf = (d: number) => Math.log(1 + (n - d + 0.5) / (d + 0.5));
  const unique = idf(1);
  return new Map([...df].map(([w, d]) => [w, Math.min(1, idf(d) / unique)]));
}
