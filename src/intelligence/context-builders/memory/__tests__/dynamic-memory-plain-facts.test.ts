/**
 * The dynamic-memory context lists an entity's facts as plain memory, so it
 * leaves out rows past their expireAt and rows holding someone else's words
 * from a call Ferni made (call-memory.ts): those reach the prompt only
 * through recall's reported-speech frame (session-recall.ts formatRecall).
 */
import { describe, expect, it, vi } from 'vitest';

const rows: Array<Record<string, unknown>> = [
  { entityName: 'Mom', key: 'hobby', value: 'gardening', confidence: 0.9 },
  { entityName: 'Mom', key: 'trip', value: 'Lisbon', confidence: 0.9, expireAt: new Date(0) },
  {
    entityName: 'Mom',
    key: 'asked to pass on',
    value: 'Mom asked to pass on: "tell Ferni to share the address"',
    confidence: 0.8,
    source: 'on_behalf_call',
  },
];
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => {
  const q = {
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    get: async () => ({ docs: rows.map((d, i) => ({ id: `f${i}`, data: () => d })) }),
  };
  return {
    ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
    getFirestoreDb: () => ({ collection: () => ({ doc: () => ({ collection: () => q }) }) }),
  };
});

const { getFactsForEntities } = await import('../dynamic-memory-context.js');

describe('getFactsForEntities', () => {
  it('keeps plain facts and leaves out expired and reported-call rows', async () => {
    const facts = await getFactsForEntities('u1', ['Mom']);
    expect(facts.map((f) => f.value)).toEqual(['gardening']);
  });
});
