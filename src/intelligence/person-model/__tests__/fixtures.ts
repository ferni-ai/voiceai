/**
 * Synthetic store snapshots for person-model tests, shaped like the prod
 * stores (field names and types read 2026-10-18; no real values). Every name,
 * date and line here is invented.
 */
import { loadRecallSnapshot } from '../../../memory/recall/session-recall.js';
import type { PersonModelInputs } from '../build.js';

export const NOW = new Date('2026-10-18T12:00:00.000Z');
export const DAY = 86_400_000;
export const ago = (days: number, at = NOW.getTime()): string =>
  new Date(at - days * DAY).toISOString();

export function inputs(over: Partial<PersonModelInputs> = {}): PersonModelInputs {
  return {
    userId: 'test-user',
    timezone: 'America/New_York',
    summaries: [],
    temporalSnapshots: [],
    facts: [],
    relationshipNetwork: [],
    familyMembers: [],
    commitments: [],
    ferniCommitments: [],
    followThrough: [],
    worldFacts: [],
    topicPatterns: [],
    forgotten: [],
    forgetGeneration: 0,
    ...over,
  };
}

/** A summaries/{id} doc as saveSummary writes it. */
export function summary(daysAgo: number, over: Record<string, unknown> = {}) {
  return {
    id: `s${daysAgo}`,
    sessionId: `sess-${daysAgo}`,
    timestamp: ago(daysAgo),
    duration: 600,
    turnCount: 12,
    emotionalArc: 'steady',
    mainTopics: [],
    keyPoints: [],
    followUpItems: [],
    questionsRemaining: [],
    ...over,
  };
}

/** A dynamic_facts doc as deep-extraction-worker writes it. */
export function factDoc(entityName: string, key: string, value: string, daysAgo = 3) {
  return {
    entityName,
    key,
    value,
    confidence: 0.9,
    extractedAt: ago(daysAgo),
    factType: 'relationship',
    sessionId: 'sess-x',
    source: 'deep_extraction',
    turnNumber: 4,
  };
}

/** Facts through the recall loader, exactly as the nightly job will pass them in. */
export async function recalled(
  docs: Array<Record<string, unknown>>,
  forgotten: string[] = []
): Promise<PersonModelInputs['facts']> {
  const store = {
    facts: async () => docs,
    summaries: async () => [],
    forgotten: async () => forgotten,
  };
  return (await loadRecallSnapshot(store, 'test-user')).facts;
}
