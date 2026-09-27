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
    const recall = createMemoryRecall({ userId: 'u1', userName: 'Sam', store });
    await recall.ready;

    const first = recall.noteFor('Hey, how are you?');
    expect(first).toContain('Ask how Biscuit is settling in');

    const second = recall.noteFor('Biscuit chewed my shoes again');
    expect(second).toContain('- Biscuit: breed = golden retriever');
    expect(second).not.toContain('settling in');

    expect(recall.noteFor('Biscuit is asleep now')).toBeNull();
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
