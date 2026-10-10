import { describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

// A fake Firestore that records how dynamic_facts is queried.
const fake = vi.hoisted(() => {
  const calls: string[] = [];
  let ordered: Array<Record<string, unknown>> = [];
  const plain = [{ entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }];
  const query = (orderedBy?: string) => ({
    orderBy: (field: string, dir: string) => {
      calls.push(`orderBy:${field}:${dir}`);
      return query(field);
    },
    limit: (n: number) => {
      calls.push(`limit:${n}`);
      return {
        get: async () => ({
          docs: (orderedBy ? ordered : plain).map((d) => ({ data: () => d })),
        }),
      };
    },
  });
  const db = {
    collection: () => ({ doc: () => ({ collection: () => query() }) }),
  };
  return { calls, db, setOrdered: (d: Array<Record<string, unknown>>) => (ordered = d) };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));

import {
  addRecallNote,
  createMemoryRecall,
  firestoreRecallStore,
  memoryRecallMode,
  type RecallAgent,
} from '../memory-recall-hook.js';

describe('firestoreRecallStore.facts', () => {
  it('loads the newest facts first, not an arbitrary 300', async () => {
    fake.calls.length = 0;
    fake.setOrdered([{ entityName: 'Biscuit', key: 'age', value: 'three', extractedAt: '2026-10-04' }]);
    const facts = await firestoreRecallStore.facts('u1');
    expect(fake.calls).toContain('orderBy:extractedAt:desc');
    expect(facts).toEqual([{ entityName: 'Biscuit', key: 'age', value: 'three', extractedAt: '2026-10-04' }]);
  });

  it('falls back to the plain query when no fact has a date', async () => {
    fake.calls.length = 0;
    fake.setOrdered([]);
    const facts = await firestoreRecallStore.facts('u1');
    expect(facts).toEqual([{ entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }]);
  });
});

const store = {
  facts: async () => [
    { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
  ],
  summaries: async () => [{ followUpItems: ['Ask how Biscuit is settling in'] }],
};

describe('createMemoryRecall', () => {
  it('recalls for the transcript, offers follow-ups once, and does not repeat a fact', async () => {
    const recall = createMemoryRecall({ userId: 'u1', userName: 'Sam', store });
    await recall.ready;

    const first = recall.noteFor('Hey, how are you?');
    expect(first).toContain('Ask how Biscuit is settling in');

    const second = recall.noteFor('Biscuit chewed my shoes again');
    expect(second).toContain('- Biscuit: breed = golden retriever');
    expect(second).not.toContain('settling in');

    expect(recall.noteFor('Biscuit is asleep now')).toBeNull();
  });

  it('recalls at most 4 facts, 2 per entity, per user turn across interim transcripts, then resets', async () => {
    const many = {
      facts: async () =>
        Array.from({ length: 12 }, (_, i) => ({
          entityName: i % 2 ? 'Biscuit' : 'Mochi',
          key: `fact_${i}`,
          value: `detail number ${i}`,
          confidence: 1,
        })),
      summaries: async () => [],
    };
    const recall = createMemoryRecall({ userId: 'u1', store: many });
    await recall.ready;

    const count = (note: string | null, who = 'Biscuit') =>
      (note?.match(new RegExp(`^- ${who}:`, 'gm')) ?? []).length;
    let biscuit = 0;
    let all = 0;
    for (const interim of ['Biscuit and Mochi', 'Biscuit and Mochi did', 'Biscuit and Mochi did it']) {
      const note = recall.noteFor(interim);
      biscuit += count(note);
      all += count(note) + count(note, 'Mochi');
    }
    expect(biscuit).toBe(2);
    expect(all).toBe(4);

    recall.newTurn();
    expect(count(recall.noteFor('Biscuit again'))).toBe(2);
  });

  it('returns null instead of waiting while memory is still loading', () => {
    const slow = {
      facts: () =>
        new Promise<Array<Record<string, unknown>>>((resolve) => {
          setTimeout(() => resolve([]), 500);
        }),
      summaries: async () => [],
    };
    const recall = createMemoryRecall({ userId: 'u1', store: slow });
    expect(recall.noteFor('Biscuit is great')).toBeNull();
  });

  it('offers shared inside jokes once per call, only with INSIDE_JOKES=on', async () => {
    const withJokes = {
      facts: store.facts,
      summaries: async () => [{ insideJokes: ['the mushroom thing'] }],
    };
    vi.stubEnv('INSIDE_JOKES', 'on');
    try {
      const recall = createMemoryRecall({ userId: 'u1', store: withJokes });
      await recall.ready;
      expect(recall.noteFor('Hey, how are you?')).toContain('- the mushroom thing');
      expect(recall.noteFor('Biscuit chewed my shoes again')).not.toContain('mushroom');

      vi.stubEnv('INSIDE_JOKES', 'off');
      const off = createMemoryRecall({ userId: 'u1', store: withJokes });
      await off.ready;
      expect(off.noteFor('Hey, how are you?')).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('is on by default and turns off with MEMORY_RECALL=off', () => {
    expect(memoryRecallMode({})).toBe(true);
    expect(memoryRecallMode({ MEMORY_RECALL: 'off' })).toBe(false);
  });
});

describe('addRecallNote', () => {
  it("puts the note in the real SDK agent's context before returning", () => {
    const agent = new voice.Agent({ instructions: 'You are Ferni.' });
    const before = agent.chatCtx.items.length;

    addRecallNote(agent as unknown as RecallAgent, '[WHAT YOU REMEMBER] Biscuit is a golden retriever');

    // Synchronous: preemptive generation copies the context in the same tick.
    const items = agent.chatCtx.items;
    expect(items.length).toBe(before + 1);
    const last = items[items.length - 1] as { role?: string; textContent?: string };
    expect(last.role).toBe('system');
    expect(last.textContent).toContain('golden retriever');
  });
});
