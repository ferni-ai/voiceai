import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const { factOf } = await import('../sweep-forgotten-index.js');

describe('which fact an index copy belongs to', () => {
  it('reads both id schemes, and only with an owner', () => {
    expect(factOf('conversation_fact_f1', 'u1')).toEqual({ userId: 'u1', docId: 'f1' });
    expect(factOf('fact_fact_u1_f1', 'u1')).toEqual({ userId: 'u1', docId: 'f1' });
    expect(factOf('fact_fact_u2_f1', 'u1')).toBeNull(); // owner mismatch: not this user's fact
    expect(factOf('conversation_s1', 'u1')).toBeNull();
    expect(factOf('conversation_fact_f1', undefined)).toBeNull();
  });
});
