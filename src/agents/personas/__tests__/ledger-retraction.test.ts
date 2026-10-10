import { describe, expect, it, vi } from 'vitest';

// persona_told for one caller: a real fact and one already retracted.
const fake = vi.hoisted(() => {
  const rows = [
    { personaId: 'ferni', fact: 'Ferni is reading a book about the silk road', saidAt: '2026-10-10' },
    { personaId: 'ferni', fact: 'Ferni has a pet named Biscuit', saidAt: '2026-10-09', retracted: true },
  ];
  const query = {
    orderBy: () => query,
    limit: () => ({ get: async () => ({ docs: rows.map((d) => ({ data: () => d })) }) }),
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => query }) }) };
  return { db };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));

import { firestoreLedgerStore } from '../life-ledger.js';
import { planRetractions } from '../ledger-retraction.js';

const BIO = 'Wyoming kid. Third of seven siblings.';

describe('planRetractions', () => {
  it('names each stored fact that is not his life, with the reason', async () => {
    const facts = [
      { id: 'a', fact: 'Ferni would end up eating his own wallet by Tuesday.' },
      { id: 'b', fact: 'Ferni has a pet named Biscuit.' },
      { id: 'c', fact: 'Ferni is an only child.' },
      { id: 'd', fact: 'Ferni has a brother who lives out West.' },
      { id: 'e', fact: 'Ferni is reading an old history book about the silk road.' },
    ];
    // Both biography answers rule out fact 1 of the 3 left (c), quoting the biography.
    const ask = async () => '1 | Third of seven siblings.';
    expect(await planRetractions(facts, ['Biscuit', 'Mom'], BIO, 'Ferni', ask)).toEqual([
      { id: 'a', fact: facts[0].fact, reason: 'not-his-life' },
      { id: 'b', fact: facts[1].fact, reason: 'callers' },
      { id: 'c', fact: facts[2].fact, reason: 'biography' },
    ]);
  });

  it('retracts nothing from a clean ledger', async () => {
    const facts = [{ id: 'e', fact: 'Ferni is reading an old history book about the silk road.' }];
    expect(await planRetractions(facts, [], BIO, 'Ferni', async () => 'NONE')).toEqual([]);
  });
});

describe('firestoreLedgerStore.recent', () => {
  it('never recalls a retracted fact', async () => {
    const facts = await firestoreLedgerStore.recent('u1', 'ferni', 10);
    expect(facts.map((f) => f.fact)).toEqual(['Ferni is reading a book about the silk road']);
  });
});
