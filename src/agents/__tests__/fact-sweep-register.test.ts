import { describe, expect, it } from 'vitest';
import { FACT_SWEEP_TASK, sweepAfterCall } from '../fact-sweep-register.js';
import { registeredAfterCallTasks } from '../../services/session/after-call-tasks.js';
import type { SweepStore } from '../../memory/dynamic/fact-sweep.js';

const ctx = {
  userId: 'u1',
  sessionId: 's1',
  startedAt: new Date('2026-01-05T18:00:00Z'),
  turns: [
    { role: 'user', content: 'Hey, could you call my brother?' },
    { role: 'assistant', content: 'Sure, what is his name?' },
    { role: 'user', content: 'His name is Pete.' },
  ],
};

function deps(env: Record<string, string>) {
  const prompts: string[] = [];
  const added: string[] = [];
  const store: SweepStore = {
    facts: async () => [],
    add: async (_u, docs) => (
      added.push(...docs.map((d) => String(d.data.entityName))),
      docs.length
    ),
  };
  const llm = async (p: string) => (
    prompts.push(p),
    '[{"entityName":"Pete","factType":"relationship","key":"relation to user","value":"brother","confidence":0.9}]'
  );
  return { prompts, added, run: { env, store, llm } };
}

describe('fact sweep after a call', () => {
  it('is registered as an after-call task (the agents import after-call-register)', async () => {
    await import('../after-call-register.js');
    expect(registeredAfterCallTasks()).toContain(FACT_SWEEP_TASK);
  });

  it("reads only the caller's lines and stores what it finds", async () => {
    const d = deps({ FACT_SWEEP: 'on' });
    expect(await sweepAfterCall(ctx, d.run)).toBe(1);
    expect(d.added).toEqual(['Pete']);
    expect(d.prompts[0]).toContain('- His name is Pete.');
    expect(d.prompts[0]).not.toContain('what is his name');
  });

  it('does nothing, with no model call, when the flag is off', async () => {
    const d = deps({});
    expect(await sweepAfterCall(ctx, d.run)).toBe(0);
    expect(d.prompts).toEqual([]);
  });
});
