/**
 * LiveKit says "listening" when it pauses a reply for the caller's voice
 * (interruptByAudioActivity), not only when the reply is over. Prod
 * 2026-10-14..17: 9 of 12 REPLY_NOT_RECORDED fired at that pause, and each of
 * those replies reached the history once it resumed or was cut (the next
 * request carried it). These drive the recorder through the same events; the
 * real-SDK version is reply-receipt-pause.sdk.test.ts.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { attachTurnReceipts, type TurnReceipt } from '../turn-receipt.js';

function call(now: () => number = Date.now) {
  const activity: { pausedSpeech?: unknown } = {};
  const session = Object.assign(new EventEmitter(), { _activity: activity });
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_pause',
    userId: 'u1',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    now,
    env: {},
  });
  const state = (newState: string, oldState?: string) =>
    session.emit('agent_state_changed', { oldState, newState });
  const commit = () =>
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'user', content: 'a question' }),
    });
  const item = (content: string, interrupted = false) =>
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content, interrupted }),
    });
  /** interruptByAudioActivity: pausedSpeech is set, then the state goes to listening. */
  const pause = () => {
    activity.pausedSpeech = { handle: {} };
    state('listening', 'speaking');
  };
  const unpause = () => (activity.pausedSpeech = undefined);
  const reply = (content = 'Sure thing.') => {
    state('speaking', 'thinking');
    item(content);
    state('listening', 'speaking');
  };
  const view = () =>
    receipts.map((r) => ({
      endedBy: r.endedBy,
      messages: r.reply.messages,
      interrupted: r.reply.interrupted,
      unrecorded: r.reply.unrecorded,
    }));
  return { receipts, detach, state, commit, item, pause, unpause, reply, view };
}

const spoke = (messages: number, interrupted = false, endedBy = 'listening') => ({
  endedBy,
  messages,
  interrupted,
  unrecorded: false,
});

describe('turn receipt across a pause for the caller', () => {
  it('a paused reply that resumes is one turn, recorded', () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking');
    c.pause();
    c.unpause(); // false interruption: LiveKit resumes the reply
    c.state('speaking', 'listening');
    c.item('Sure thing.');
    c.state('listening', 'speaking');
    expect(c.view()).toEqual([spoke(1)]);
  });

  it('a paused reply cut by the caller is credited when its item comes before the commit', () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking');
    c.pause();
    c.unpause();
    c.item('Su', true);
    c.commit();
    c.reply();
    expect(c.view()).toEqual([spoke(1, true, 'superseded'), spoke(1)]);
  });

  it('a paused reply cut by the caller is credited when its item comes after the commit', () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking');
    c.pause();
    c.unpause();
    c.commit();
    c.item('Su', true);
    c.reply();
    expect(c.view()).toEqual([spoke(1, true, 'superseded'), spoke(1)]);
  });

  it('a paused reply cut before a word was heard is emitted when the next reply speaks', () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking');
    c.pause();
    c.unpause();
    c.commit();
    c.state('speaking', 'thinking');
    expect(c.view()).toEqual([spoke(0, false, 'superseded')]);
    c.item('Sure thing.');
    c.state('listening', 'speaking');
    expect(c.view()).toEqual([spoke(0, false, 'superseded'), spoke(1)]);
  });

  // Prod 2026-10-14 (eval calls): a reply cut seconds in left no item at all.
  it('flags a reply paused after a second of audio, then cut, that left no item', () => {
    let t = 0;
    const c = call(() => t);
    c.commit();
    c.state('speaking', 'thinking');
    t += 1500;
    c.pause();
    c.unpause();
    c.commit();
    c.reply();
    expect(c.view()).toEqual([{ ...spoke(0, false, 'superseded'), unrecorded: true }, spoke(1)]);
  });

  it('a call that ends during the pause emits the turn once', () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking');
    c.pause();
    c.detach();
    expect(c.view()).toEqual([
      { endedBy: 'session_end', messages: 0, interrupted: false, unrecorded: false },
    ]);
  });

  it('still flags a reply that ended with nothing added to the history', () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking');
    c.state('listening', 'speaking');
    expect(c.view()).toEqual([{ ...spoke(0), unrecorded: true }]);
  });
});

// Prod 2026-10-16: a reply cut 0.1 s in was committed with the previous reply's
// 129 characters, byte for byte (livekit/agents-js#2566; ROTATED_SEGMENT_FIX).
describe('turn receipt: cut reply committed with the previous reply text', () => {
  const PREVIOUS = 'That makes sense, and I can call her for you if you want.';

  it('marks the cut reply that repeats the previous reply', () => {
    const c = call();
    c.commit();
    c.reply(PREVIOUS);
    c.commit();
    c.state('speaking', 'thinking');
    c.item(PREVIOUS, true);
    c.state('listening', 'speaking');
    expect(c.receipts.map((r) => r.reply.repeatsPrevious)).toEqual([false, true]);
  });

  it('leaves a cut reply with its own text, and a full repeat, unmarked', () => {
    const c = call();
    c.commit();
    c.reply(PREVIOUS);
    c.commit();
    c.state('speaking', 'thinking');
    c.item('That', true);
    c.state('listening', 'speaking');
    c.commit();
    c.reply('That');
    expect(c.receipts.map((r) => r.reply.repeatsPrevious)).toEqual([false, false, false]);
  });
});
