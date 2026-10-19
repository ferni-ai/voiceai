/**
 * The memory jobs treat dynamic_facts rows as plain memories, so they leave
 * out rows past their expireAt and rows holding someone else's words from a
 * call Ferni made (call-memory.ts).
 */
import { describe, expect, it, vi } from 'vitest';

const facts: Array<Record<string, unknown>> = [
  { entityName: 'Mom', key: 'hobby', value: 'gardening', confidence: 0.9 },
  { entityName: 'Mom', key: 'trip', value: 'Lisbon', confidence: 0.9, expireAt: new Date(0) },
  { entityName: 'Mom', key: 'said', value: 'Mom said: pie', source: 'on_behalf_call' },
];
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: (name: string) => {
          const rows = name === 'dynamic_facts' ? facts : [];
          const q = {
            where: () => q,
            orderBy: () => q,
            limit: () => q,
            get: async () => ({ docs: rows.map((d, i) => ({ id: `f${i}`, data: () => d })) }),
          };
          return q;
        },
      }),
    }),
  }),
}));
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../memory/index.js')>()),
  getFirestoreStore: () => ({ getProfile: async () => null }),
}));

const { getUserMemories } = await import('../memory-jobs.js');

describe('getUserMemories', () => {
  it('keeps plain facts and leaves out expired and reported-call rows', async () => {
    const memories = await getUserMemories('u1');
    expect(memories.map((m) => m.content)).toEqual(['Fact about Mom: hobby = gardening']);
  });
});
