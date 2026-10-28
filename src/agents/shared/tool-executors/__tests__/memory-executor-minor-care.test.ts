/**
 * MINOR_CARE in the memory executor: the user's hold counts, not just this session's.
 *
 * Text chat runs these with no sessionId, so memoryHeld(ctx.sessionId) let a caller held on a
 * voice call update and reinforce stored facts. Now callerHeld (writeHeld(userId, sessionId), or
 * ctx.held: a hold read in another process) stops every write. Firestore and embeddings are
 * mocked; the hold is the real one. Synthetic ids and words only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as string[]);
const factDoc = vi.hoisted(() => ({
  data: () => ({ fact: 'likes the colour teal', confidence: 0.5 }),
  ref: { update: async () => void writes.push('update') },
}));

vi.mock('../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          add: async () => (writes.push('add'), { id: 'f1' }),
          get: async () => ({ empty: false, docs: [factDoc] }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => void writes.push('index') }),
}));
vi.mock('../../../../memory/embeddings.js', () => ({ embed: async () => [0.1, 0.2] }));

const { memoryExecutor } = await import('../memory-executor.js');
const { heldAfter, resetMinorCare } = await import('../../../../utils/minor-care.js');

const update = { oldFact: 'teal', newFact: 'likes the colour green' };
const env = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  resetMinorCare();
  process.env.MINOR_CARE = 'on';
});
afterEach(() => {
  process.env = { ...env };
});

describe('memory executor writes and a user-bound MINOR_CARE hold', () => {
  it('updates and reinforces nothing for a held user with no session (text chat)', async () => {
    heldAfter('voice-sess-2', "I'm 14 years old", { userId: 'teen-uid' });
    const ctx = { userId: 'teen-uid' };

    await memoryExecutor.execute('updateMemory', update, ctx);
    await memoryExecutor.execute('reinforceMemory', { memory: 'teal' }, ctx);
    expect(writes).toEqual([]);
  });

  it('writes nothing when the caller passes a hold read elsewhere (ctx.held)', async () => {
    const ctx = { userId: 'teen-uid', held: true };

    await memoryExecutor.execute('rememberAboutUser', { fact: 'has a cat' }, ctx);
    await memoryExecutor.execute('updateMemory', update, ctx);
    expect(writes).toEqual([]);
  });

  it("still remembers, updates and reinforces for a user who isn't held", async () => {
    heldAfter('voice-sess-2', "I'm 14 years old", { userId: 'teen-uid' }); // someone else's hold
    const ctx = { userId: 'adult-uid' };

    await memoryExecutor.execute('rememberAboutUser', { fact: 'has a cat' }, ctx);
    await memoryExecutor.execute('updateMemory', update, ctx);
    await memoryExecutor.execute('reinforceMemory', { memory: 'teal' }, ctx);
    expect(writes).toEqual(['add', 'index', 'update', 'update']);
  });
});
