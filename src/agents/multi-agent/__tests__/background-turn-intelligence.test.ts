import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

import {
  createBackgroundTurnIntelligence,
  wireBackgroundTurnIntelligence,
} from '../background-turn-intelligence.js';
import type { UserTurnHook } from '../turn-intelligence.js';

/** A hook that injects one note per turn, as the turn handler does. */
const noting =
  (prefix = 'note'): UserTurnHook =>
  async (ctx, msg) => {
    ctx.addMessage({ role: 'system', content: `${prefix}: ${msg.textContent}` });
  };

describe('background turn intelligence', () => {
  it('turns a committed user turn into notes for the next reply', async () => {
    const runner = createBackgroundTurnIntelligence(noting());
    expect(runner.notesForReply()).toBeNull();

    await runner.onUserTurn('my dog died last week');

    expect(runner.notesForReply()).toBe('note: my dog died last week');
  });

  it('keeps notes for every generation of a reply and drops them once it is spoken', async () => {
    const runner = createBackgroundTurnIntelligence(noting());
    await runner.onUserTurn('hello');

    expect(runner.notesForReply()).toBe('note: hello'); // preemptive
    expect(runner.notesForReply()).toBe('note: hello'); // final
    runner.onAgentState('speaking');

    expect(runner.notesForReply()).toBeNull();
  });

  it('keeps notes nobody read when the reply was already underway', async () => {
    const runner = createBackgroundTurnIntelligence(noting());
    runner.onAgentState('speaking'); // reply started before the notes existed
    await runner.onUserTurn('I got the job');
    runner.onAgentState('listening');

    expect(runner.notesForReply()).toBe('note: I got the job');
  });

  it('runs one turn at a time, in order', async () => {
    const order: string[] = [];
    const slow: UserTurnHook = async (ctx, msg) => {
      order.push(`start ${msg.textContent}`);
      await new Promise<void>((r) => {
        setTimeout(r, 5);
      });
      ctx.addMessage({ role: 'system', content: String(msg.textContent) });
      order.push(`end ${msg.textContent}`);
    };
    const runner = createBackgroundTurnIntelligence(slow);

    await Promise.all([runner.onUserTurn('one'), runner.onUserTurn('two')]);

    expect(order).toEqual(['start one', 'end one', 'start two', 'end two']);
    expect(runner.notesForReply()).toBe('two');
  });

  it('never throws when the handler fails', async () => {
    const runner = createBackgroundTurnIntelligence(async () => {
      throw new Error('boom');
    });
    await expect(runner.onUserTurn('hi')).resolves.toBeUndefined();
    expect(runner.notesForReply()).toBeNull();
  });

  it('listens to committed user messages and agent state on the session', async () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const session = {
      on: vi.fn((event: string, h: (e: unknown) => void) => (handlers[event] = h)),
      off: vi.fn(),
    };
    const runner = createBackgroundTurnIntelligence(noting());
    const unsubscribe = wireBackgroundTurnIntelligence(session, runner);

    handlers.conversation_item_added({
      item: llm.ChatMessage.create({ role: 'assistant', content: 'ignored' }),
    });
    handlers.conversation_item_added({
      item: llm.ChatMessage.create({ role: 'user', content: 'rough day' }),
    });
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });

    expect(runner.notesForReply()).toBe('note: rough day');
    handlers.agent_state_changed({ newState: 'speaking' });
    expect(runner.notesForReply()).toBeNull();

    unsubscribe();
    expect(session.off).toHaveBeenCalledTimes(2);
  });
});
