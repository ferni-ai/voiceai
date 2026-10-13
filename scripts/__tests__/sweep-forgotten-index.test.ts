import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const { factOf, verdict } = await import('../sweep-forgotten-index.js');

describe('which fact an index copy belongs to', () => {
  it('reads both id schemes, and only with an owner', () => {
    expect(factOf('conversation_fact_f1', 'u1')).toEqual({
      kind: 'conversation_fact',
      userId: 'u1',
      docId: 'f1',
    });
    expect(factOf('fact_fact_u1_f1', 'u1')).toEqual({
      kind: 'graph_fact',
      userId: 'u1',
      docId: 'f1',
    });
    expect(factOf('fact_fact_u2_f1', 'u1')).toBeNull(); // owner mismatch
    expect(factOf('fact_fact-m1', 'u1')).toBeNull(); // unified-store graph id, not a dynamic fact
    expect(factOf('conversation_s1', 'u1')).toBeNull();
    expect(factOf('conversation_fact_f1', undefined)).toBeNull();
  });
});

describe('what the sweep may delete', () => {
  it('a copy of a forgotten fact; an orphan only where the source is known', () => {
    expect(verdict('conversation_fact', { exists: true, forgotten: true })).toBe('forgotten');
    expect(verdict('graph_fact', { exists: true, forgotten: true })).toBe('forgotten');
    expect(verdict('conversation_fact', { exists: false, forgotten: false })).toBe('orphan');
    // A graph copy may come from a `memories` topic ("<memoryId>_<topic>"): never an orphan.
    expect(verdict('graph_fact', { exists: false, forgotten: false })).toBe('unknown');
    expect(verdict('conversation_fact', { exists: true, forgotten: false })).toBe('live');
  });
});
