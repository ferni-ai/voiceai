/**
 * The world extraction runs after a call through the after-call registry:
 * registered by agents/after-call-register.ts, gated on both flags, and it
 * writes what the caller said into the temporal store. Only the model and the
 * store are fakes.
 */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryWorldFactStore } from '../../temporal/__tests__/memory-store.js';

// The one import the voice agent entry makes; it must register the task
// (read before this file imports register.js itself).
await import('../../../../agents/after-call-register.js');
const { registeredAfterCallTasks } =
  await import('../../../../services/session/after-call-tasks.js');
const registeredByEntry = registeredAfterCallTasks();
const { extractWorldAfterCall, WORLD_EXTRACTION_TASK } = await import('../register.js');

const ON = { AFTER_CALL_EXTRACTION: 'on', WORLD_MODEL_TEMPORAL: 'on' };
const call = {
  userId: 'u1',
  sessionId: 's1',
  startedAt: new Date('2026-10-10T15:00:00Z'),
  timezone: 'America/New_York',
  turns: [
    { role: 'user', content: 'My sister Mindy has knee surgery on Tuesday.' },
    { role: 'assistant', content: 'Oh no, I hope it goes smoothly.' },
  ],
};
const reply = JSON.stringify({
  observations: [
    {
      subject: 'Mindy',
      subjectKind: 'person',
      relation: 'sister',
      attribute: 'event',
      value: 'knee surgery',
      eventDate: '2026-10-13',
      confidence: 0.9,
    },
  ],
});

describe('world extraction after a call', () => {
  it('is registered by the agent entry', () => {
    expect(registeredByEntry).toContain(WORLD_EXTRACTION_TASK);
    expect(WORLD_EXTRACTION_TASK).toBe('world-extraction');
  });

  it('with both flags on: reads the call once and stores what the caller said', async () => {
    const store = createMemoryWorldFactStore();
    const llm = vi.fn(async (_prompt: string) => reply);
    expect(store.all('u1')).toEqual([]);
    await extractWorldAfterCall(call, { env: ON, store, llm, newId: () => 'f1' });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0]?.[0]).toContain('My sister Mindy has knee surgery');
    expect(store.all('u1')).toMatchObject([
      { id: 'f1', subject: 'Mindy', value: 'knee surgery', eventDate: '2026-10-13', validTo: null },
    ]);
  });

  it('with either flag off: no model call, nothing stored', async () => {
    for (const env of [{}, { AFTER_CALL_EXTRACTION: 'on' }, { WORLD_MODEL_TEMPORAL: 'on' }]) {
      const store = createMemoryWorldFactStore();
      const llm = vi.fn(async (_prompt: string) => reply);
      await extractWorldAfterCall(call, { env, store, llm });
      expect(llm).not.toHaveBeenCalled();
      expect(store.all('u1')).toEqual([]);
    }
  });
});
