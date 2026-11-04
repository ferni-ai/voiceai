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

  // FACT_SUBJECT_GUARD, through the real after-call entry point: the persona named its own
  // friends and the caller echoed the names. With the flag on the model sees who said what.
  const echoed = {
    ...ctx,
    turns: [
      { role: 'user', content: 'Who do you hang out with these days?' },
      { role: 'assistant', content: 'My buddies Theo and Max, we go way back.' },
      { role: 'system', content: 'Persona instructions never reach the sweep.' },
      { role: 'user', content: 'Theo and Max.' },
      { role: 'user', content: 'My brother Pete is visiting next week.' },
    ],
  };
  const found = JSON.stringify([
    {
      entityName: 'User',
      factType: 'relationship',
      key: 'friends',
      value: 'Theo and Max',
      confidence: 0.9,
    },
    {
      entityName: 'Theo',
      factType: 'relationship',
      key: 'friend of',
      value: 'User',
      confidence: 0.9,
    },
    {
      entityName: 'Pete',
      factType: 'event',
      key: 'visit',
      value: 'visiting next week',
      confidence: 0.9,
    },
  ]);

  it('with FACT_SUBJECT_GUARD on, the model reads both sides, tagged; nothing is dropped after it', async () => {
    const d = deps({ FACT_SWEEP: 'on', FACT_SUBJECT_GUARD: 'on' });
    d.run.llm = async (p: string) => (d.prompts.push(p), found);
    expect(await sweepAfterCall(echoed, d.run)).toBe(3);
    expect(d.added).toEqual(['User', 'Theo', 'Pete']);
    expect(d.prompts[0]).toContain('are about the AI friend, never the caller');
    expect(d.prompts[0]).toContain(
      'The call:\nCaller: Who do you hang out with these days?\nAI friend: My buddies Theo and Max, we go way back.\nCaller: Theo and Max.'
    );
    expect(d.prompts[0]).not.toContain('Persona instructions'); // only the two speakers
  });

  it('with FACT_SUBJECT_GUARD off, stores what the model found as on main', async () => {
    const d = deps({ FACT_SWEEP: 'on' });
    d.run.llm = async (p: string) => (d.prompts.push(p), found);
    expect(await sweepAfterCall(echoed, d.run)).toBe(3);
    expect(d.added).toEqual(['User', 'Theo', 'Pete']);
    expect(d.prompts[0]).not.toContain('about the AI friend, never the caller');
  });

  it('does nothing, with no model call, when the flag is off', async () => {
    const d = deps({});
    expect(await sweepAfterCall(ctx, d.run)).toBe(0);
    expect(d.prompts).toEqual([]);
  });
});
