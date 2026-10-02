import { describe, expect, it } from 'vitest';
import { voice } from '@livekit/agents';
import {
  addRecallNote,
  createMemoryRecall,
  memoryRecallMode,
  type RecallAgent,
} from '../memory-recall-hook.js';

const store = {
  facts: async () => [
    { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
  ],
  summaries: async () => [{ followUpItems: ['Ask how Biscuit is settling in'] }],
};

describe('createMemoryRecall', () => {
  it('recalls for the transcript, offers follow-ups once, and does not repeat a fact', async () => {
    const recall = createMemoryRecall({ userId: 'u1', userName: 'Sam', store, embed: null });
    await recall.ready;

    const first = recall.noteFor('Hey, how are you?');
    expect(first).toContain('Ask how Biscuit is settling in');

    const second = recall.noteFor('Biscuit chewed my shoes again');
    expect(second).toContain('- Biscuit: breed = golden retriever');
    expect(second).not.toContain('settling in');

    expect(recall.noteFor('Biscuit is asleep now')).toBeNull();
  });

  it('recalls at most the per-turn fact budget across interim transcripts, then resets', async () => {
    const many = {
      facts: async () =>
        Array.from({ length: 12 }, (_, i) => ({
          entityName: 'Biscuit',
          key: `fact_${i}`,
          value: `detail number ${i}`,
          confidence: 1,
        })),
      summaries: async () => [],
    };
    const recall = createMemoryRecall({
      userId: 'u1',
      store: many,
      embed: null,
      limits: { factsPerTurn: 4, charsPerTurn: 10_000 },
    });
    await recall.ready;

    const count = (note: string | null) => (note?.match(/^- Biscuit:/gm) ?? []).length;
    let recalled = 0;
    for (const interim of ['Biscuit', 'Biscuit did', 'Biscuit did it', 'Biscuit did it again']) {
      recalled += count(recall.noteFor(interim));
    }
    expect(recalled).toBe(4);

    recall.newTurn();
    expect(count(recall.noteFor('Biscuit again'))).toBe(4);
  });

  it('returns null instead of waiting while memory is still loading', () => {
    const slow = {
      facts: () =>
        new Promise<Array<Record<string, unknown>>>((resolve) => {
          setTimeout(() => resolve([]), 500);
        }),
      summaries: async () => [],
    };
    const recall = createMemoryRecall({ userId: 'u1', store: slow, embed: null });
    expect(recall.noteFor('Biscuit is great')).toBeNull();
  });

  it('defaults to 6 facts per turn within a character budget', async () => {
    const many = {
      facts: async () =>
        Array.from({ length: 12 }, (_, i) => ({
          entityName: 'Biscuit',
          key: `fact_${i}`,
          value: `detail number ${i}`,
          confidence: 1,
        })),
      summaries: async () => [],
    };
    const count = (note: string | null) => (note?.match(/^- Biscuit:/gm) ?? []).length;

    const byCount = createMemoryRecall({ userId: 'u1', store: many, embed: null });
    await byCount.ready;
    expect(count(byCount.noteFor('Biscuit did it again'))).toBe(6);

    // ~35 chars per fact: a 100-char budget fits 2 (the first always fits).
    const byChars = createMemoryRecall({
      userId: 'u1',
      store: many,
      embed: null,
      limits: { charsPerTurn: 100 },
    });
    await byChars.ready;
    expect(count(byChars.noteFor('Biscuit did it again'))).toBeLessThanOrEqual(3);
    expect(count(byChars.noteFor('Biscuit again and again'))).toBe(0);
  });

  it('recalls by meaning when embeddings are available', async () => {
    const semanticStore = {
      facts: async () => [
        { id: 'f1', entityName: 'Biscuit', key: 'species', value: 'dog', confidence: 0.9 },
        { id: 'f2', entityName: 'Dana', key: 'job', value: 'accountant', confidence: 0.9 },
      ],
      summaries: async () => [],
    };
    // Toy vectors: anything about pets points one way, work the other.
    const embed = async (texts: string[]) =>
      texts.map((t) => (/dog|pup|species/i.test(t) ? [1, 0] : [0, 1]));
    const recall = createMemoryRecall({ userId: 'u1', store: semanticStore, embed });
    await recall.ready;
    await new Promise((r) => {
      setTimeout(r, 0);
    }); // fact vectors
    expect(recall.noteFor('my little pup chewed everything')).toBeNull(); // query vector in flight
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    const note = recall.noteFor('my little pup chewed everything up');
    expect(note).toContain('Biscuit: species = dog');
    expect(note).not.toContain('accountant');
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

    addRecallNote(
      agent as unknown as RecallAgent,
      '[WHAT YOU REMEMBER] Biscuit is a golden retriever'
    );

    // Synchronous: preemptive generation copies the context in the same tick.
    const items = agent.chatCtx.items;
    expect(items.length).toBe(before + 1);
    const last = items[items.length - 1] as { role?: string; textContent?: string };
    expect(last.role).toBe('system');
    expect(last.textContent).toContain('golden retriever');
  });
});
