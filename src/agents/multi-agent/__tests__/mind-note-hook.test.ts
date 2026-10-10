/**
 * The theory-of-mind path end to end: a finished call goes through the
 * after-call writer into the store, and on the next call the caller's first
 * words put the note into the real SDK agent's context. Only the reading
 * model is stubbed.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { updateTheoryOfMindAfterCall } from '../../../intelligence/theory-of-mind/after-call.js';
import { MIND_NOTE_HEADER } from '../../../intelligence/theory-of-mind/note.js';
import { memoryMindStore, type MindStore } from '../../../intelligence/theory-of-mind/store.js';
import { CALL_1, READING_1, T0 } from '../../../intelligence/theory-of-mind/__tests__/fixtures.js';
import type { RecallAgent } from '../memory-recall-hook.js';
import { attachMindNote } from '../mind-note-hook.js';

const notesIn = (agent: voice.Agent) =>
  agent.chatCtx.items
    .map((i) => (i as { textContent?: string }).textContent ?? '')
    .filter((t) => t.startsWith(MIND_NOTE_HEADER));

function nextCall(store: MindStore) {
  const session = new EventEmitter();
  const agent = new voice.Agent({ instructions: 'You are Ferni.' });
  const mind = attachMindNote(session, agent as unknown as RecallAgent, {
    userId: 'u1',
    store,
    now: () => new Date(T0.getTime() + 86_400_000),
  });
  return { session, agent, mind };
}

describe('theory of mind on the live path', () => {
  it("brings call 1's pattern and told topics into call 2's first reply", async () => {
    const store = memoryMindStore();
    await updateTheoryOfMindAfterCall(
      { userId: 'u1', sessionId: 'call-1', turns: CALL_1, summary: null },
      { store, llm: vi.fn(async () => READING_1), env: { THEORY_OF_MIND: 'on' }, now: () => T0 }
    );

    const { session, agent, mind } = nextCall(store);
    await mind.ready;
    expect(notesIn(agent)).toHaveLength(0);
    session.emit('user_input_transcribed', { transcript: 'Hey, ugh, my car died this morning.' });
    // In the same tick: preemptive generation copies the context right after this event.
    const [note] = notesIn(agent);
    expect(note).toContain('jokes when anxious, then wants practical help');
    expect(note).toContain('Stripe interview on Monday');

    session.emit('user_input_transcribed', {
      transcript: 'Hey, ugh, my car died this morning. lol',
    });
    expect(notesIn(agent)).toHaveLength(1); // once a call, not once per transcript
    mind.detach();
    expect(session.listenerCount('user_input_transcribed')).toBe(0);
  });

  it('never holds a turn: before the model loads, the turn goes without the note', () => {
    const never: MindStore = { load: () => new Promise(() => {}), save: async () => {} };
    const { session, agent } = nextCall(never);
    const started = performance.now();
    session.emit('user_input_transcribed', { transcript: 'Hey Ferni' });
    expect(performance.now() - started).toBeLessThan(20);
    expect(notesIn(agent)).toHaveLength(0);
  });

  it('adds nothing for a caller with no model yet', async () => {
    const { session, agent, mind } = nextCall(memoryMindStore());
    await mind.ready;
    session.emit('user_input_transcribed', { transcript: 'Hey Ferni' });
    expect(notesIn(agent)).toHaveLength(0);
  });
});
