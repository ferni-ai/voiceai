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
import { recallForTurn, type RecallSnapshot } from '../recall/session-recall.js';

const RECALL_AT_5_THRESHOLD = 0.8;
const TOP_K = 5;

interface GoldenCase {
  id: string;
  snapshot: RecallSnapshot;
  laterQuery: string;
  expectedKeys: string[];
}

const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'entity-named-later',
    snapshot: {
      facts: [
        { entity: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
        { entity: 'Biscuit', key: 'action', value: 'chewed shoes', confidence: 0.9 },
      ],
      followUps: [],
    },
    laterQuery: 'Biscuit was wild again today',
    expectedKeys: ['action', 'breed'],
  },
  {
    id: 'self-fact-keyword-bridge',
    snapshot: {
      facts: [{ entity: 'Speaker', key: 'sleep', value: 'not sleeping well', confidence: 0.85 }],
      followUps: [],
    },
    laterQuery: "I still can't sleep at night",
    expectedKeys: ['sleep'],
  },
  {
    id: 'job-move-austin',
    snapshot: {
      facts: [{ entity: 'Austin', key: 'job_offer', value: 'new role in Austin', confidence: 0.8 }],
      followUps: [],
    },
    laterQuery: 'Thinking about that Austin opportunity',
    expectedKeys: ['job_offer'],
  },
  {
    id: 'partner-health',
    snapshot: {
      facts: [{ entity: 'Sarah', key: 'health', value: 'starting physical therapy', confidence: 0.9 }],
      followUps: [],
    },
    laterQuery: 'How is Sarah doing with therapy?',
    expectedKeys: ['health'],
  },
  {
    id: 'child-school',
    snapshot: {
      facts: [{ entity: 'Emma', key: 'school', value: ' switched to Montessori', confidence: 0.75 }],
      followUps: [],
    },
    laterQuery: 'Emma had a great day at school',
    expectedKeys: ['school'],
  },
  {
    id: 'dog-vet',
    snapshot: {
      facts: [{ entity: 'Max', key: 'vet', value: 'annual checkup next Tuesday', confidence: 0.7 }],
      followUps: [],
    },
    laterQuery: 'Need to remember Max vet appointment',
    expectedKeys: ['vet'],
  },
  {
    id: 'budget-stress',
    snapshot: {
      facts: [{ entity: 'Speaker', key: 'finance', value: ' worried about rent increase', confidence: 0.8 }],
      followUps: [],
    },
    laterQuery: 'Rent went up again and I am stressed',
    expectedKeys: ['finance'],
  },
  {
    id: 'mom-birthday',
    snapshot: {
      facts: [{ entity: 'Mom', key: 'birthday', value: 'March 12', confidence: 0.95 }],
      followUps: [],
    },
    laterQuery: 'When is my mom birthday again?',
    expectedKeys: ['birthday'],
  },
  {
    id: 'hobby-running',
    snapshot: {
      facts: [{ entity: 'Speaker', key: 'hobby', value: 'training for half marathon', confidence: 0.85 }],
      followUps: [],
    },
    laterQuery: 'Still training for the half marathon this weekend',
    expectedKeys: ['hobby'],
  },
  {
    id: 'friend-team',
    snapshot: {
      facts: [{ entity: 'Mike', key: 'team', value: 'Chiefs fan', confidence: 0.6 }],
      followUps: [],
    },
    laterQuery: 'Did Mike watch the Chiefs game?',
    expectedKeys: ['team'],
  },
  {
    id: 'work-project',
    snapshot: {
      facts: [{ entity: 'Speaker', key: 'project', value: 'launch delayed to Q3', confidence: 0.9 }],
      followUps: [],
    },
    laterQuery: 'The launch got pushed again',
    expectedKeys: ['project'],
  },
  {
    id: 'sibling-visit',
    snapshot: {
      facts: [{ entity: 'Jake', key: 'visit', value: 'flying in Friday', confidence: 0.88 }],
      followUps: [],
    },
    laterQuery: 'Jake lands on Friday',
    expectedKeys: ['visit'],
  },
];

function recallAt5(caseItem: GoldenCase): number {
  const recalled = recallForTurn(caseItem.snapshot, caseItem.laterQuery).slice(0, TOP_K);
  const recalledKeys = new Set(recalled.map((f) => f.key));
  const hits = caseItem.expectedKeys.filter((k) => recalledKeys.has(k)).length;
  return hits / caseItem.expectedKeys.length;
}

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
