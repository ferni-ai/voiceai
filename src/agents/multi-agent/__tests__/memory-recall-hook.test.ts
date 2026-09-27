import { describe, expect, it } from 'vitest';
import type { llm } from '@livekit/agents';
import { chainUserTurnHooks, createMemoryRecallHook, memoryRecallMode } from '../memory-recall-hook.js';

function turn(text: string) {
  const added: Array<{ role: string; content: string }> = [];
  const turnCtx = { addMessage: (m: { role: string; content: string }) => added.push(m) };
  const message = { textContent: text };
  return {
    added,
    args: [turnCtx as unknown as llm.ChatContext, message as unknown as llm.ChatMessage] as const,
  };
}

const store = {
  facts: async () => [
    { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
  ],
  summaries: async () => [{ followUpItems: ['Ask how Biscuit is settling in'] }],
};

describe('createMemoryRecallHook', () => {
  it('adds what it remembers to the turn before the reply, follow-ups on the first turn only', async () => {
    const hook = createMemoryRecallHook({ userId: 'u1', userName: 'Sam', store });

    const first = turn('Hey, how are you?');
    await hook(...first.args);
    expect(first.added).toHaveLength(1);
    expect(first.added[0].role).toBe('system');
    expect(first.added[0].content).toContain('Ask how Biscuit is settling in');

    const second = turn('Biscuit chewed my shoes again');
    await hook(...second.args);
    expect(second.added[0].content).toContain('- Biscuit: breed = golden retriever');
    expect(second.added[0].content).not.toContain('settling in');

    // Already surfaced: the same fact is not repeated on the next mention.
    const third = turn('Biscuit is asleep now');
    await hook(...third.args);
    expect(third.added).toHaveLength(0);
  });

  it('does not hold the first turn when memory is slow to load', async () => {
    const slow = {
      facts: () =>
        new Promise<Array<Record<string, unknown>>>((resolve) => {
          setTimeout(() => resolve([]), 500);
        }),
      summaries: async () => [],
    };
    const hook = createMemoryRecallHook({ userId: 'u1', store: slow, firstTurnWaitMs: 20 });
    const t = turn('Biscuit is great');
    const started = Date.now();
    await hook(...t.args);
    expect(Date.now() - started).toBeLessThan(200);
    expect(t.added).toHaveLength(0);
  });

  it('is on by default and turns off with MEMORY_RECALL=off', () => {
    expect(memoryRecallMode({})).toBe(true);
    expect(memoryRecallMode({ MEMORY_RECALL: 'off' })).toBe(false);
  });
});

describe('chainUserTurnHooks', () => {
  it('runs every hook in order even if one fails', async () => {
    const calls: string[] = [];
    const chained = chainUserTurnHooks(
      async () => {
        calls.push('a');
        throw new Error('boom');
      },
      undefined,
      async () => {
        calls.push('b');
      }
    );
    await chained!(...turn('hi').args);
    expect(calls).toEqual(['a', 'b']);
  });

  it('passes a single hook through and returns undefined for none', () => {
    const only = async () => undefined;
    expect(chainUserTurnHooks(undefined, only)).toBe(only);
    expect(chainUserTurnHooks(undefined, undefined)).toBeUndefined();
  });
});
