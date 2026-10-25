/**
 * Memory recall golden gate — "said in turn N, retrieve in turn N+k".
 *
 * Uses the deterministic session-recall matcher (no live embeddings). CI fails
 * when recall@5 drops below 0.80 on this fixture set.
 *
 * To extend: add a case to `GOLDEN_CASES` with:
 * - `snapshot`: facts stored after turn N
 * - `laterQuery`: user text at turn N+k
 * - `expectedKeys`: fact keys that MUST appear in the top-5 recall list
 *
 * Run locally: `pnpm test:memory:recall`
 */

import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES, recallAt5 } from './fixtures/memory-recall-golden-cases.js';

const RECALL_AT_5_THRESHOLD = 0.8;

describe('memory recall golden gate', () => {
  it.each(GOLDEN_CASES)('$id recalls stored facts at turn N+k', (caseItem) => {
    const score = recallAt5(caseItem);
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it(`aggregate recall@5 >= ${RECALL_AT_5_THRESHOLD}`, () => {
    const scores = GOLDEN_CASES.map(recallAt5);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThanOrEqual(RECALL_AT_5_THRESHOLD);
  });
});
