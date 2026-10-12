import { describe, expect, it } from 'vitest';
import { syncableFact } from '../firestore-spanner-sync.js';

describe('copying facts to Spanner', () => {
  const path = 'bogle_users/u1/dynamic_facts/f1';
  const fact = {
    entityName: 'Pete',
    key: 'phone',
    value: '435-339-7687',
    extractedAt: '2026-01-05',
  };

  it('copies a live fact with its owner', () => {
    expect(syncableFact('f1', path, fact)).toMatchObject({ id: 'f1', userId: 'u1', key: 'phone' });
  });

  it('never copies a fact the caller asked to forget (any forgottenAt value)', () => {
    expect(syncableFact('f1', path, { ...fact, forgottenAt: '2026-01-07T00:00:00Z' })).toBeNull();
    expect(syncableFact('f1', path, { ...fact, forgottenAt: { seconds: 1 } })).toBeNull();
  });
});
