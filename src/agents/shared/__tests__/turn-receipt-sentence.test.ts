/**
 * The TURN_RECEIPT's ttsSentenceMs: when the reply's first full sentence was in at the TTS
 * gateway, on the clock of ttsPushMs (ms from the start of the TTS node). The gateway's
 * observer reports it as a 'replySentence' turn timing (first-audio-observer.ts), so a model
 * bake-off can compare time to first sentence per model. Words-free: a number only.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFirstAudioObserver } from '../../../speech/tts-gateway/first-audio-observer.js';
import { noteTurnTiming } from '../../../speech/output-control/turn-timing.js';
import type { TurnReceipt } from '../turn-receipt.js';
import { attachTurnReceipts } from '../turn-receipt-session.js';

const SID = 'RM_sentence';

function call() {
  const session = new EventEmitter();
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: SID,
    userId: 'u1',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env: {},
  });
  const state = (newState: string, oldState?: string) =>
    session.emit('agent_state_changed', { oldState, newState });
  const commit = () =>
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'user', content: 'how was the hike' }),
    });
  const reply = () => {
    state('speaking', 'thinking');
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content: 'Steep, but worth it.' }),
    });
    state('listening', 'speaking');
  };
  return { receipts, detach, commit, reply, state };
}

afterEach(() => vi.useRealTimers());

describe('TURN_RECEIPT ttsSentenceMs', () => {
  it('is null on a turn whose gateway reported no sentence', () => {
    const c = call();
    c.commit();
    c.reply();
    c.detach();
    expect(c.receipts).toHaveLength(1);
    expect(c.receipts[0].timing.ttsSentenceMs).toBeNull();
  });

  it("keeps the turn's first sentence, after the first audio too, and never as a hold", () => {
    const c = call();
    c.commit();
    c.state('speaking', 'thinking'); // Ferni is heard before the long first sentence ends
    noteTurnTiming(SID, 'replySentence', 1240.4);
    noteTurnTiming(SID, 'replySentence', 300); // the after-tool reply's: not the turn's first
    noteTurnTiming('RM_other_call', 'replySentence', 90);
    c.reply();
    c.detach();
    const r = c.receipts[0];
    expect(r.timing.ttsSentenceMs).toBe(1240);
    expect(Object.values(r.holds).filter((v) => v !== null)).toEqual([]);
  });

  it("comes from the gateway observer's sentence stage, on its TTS-node clock", () => {
    vi.useFakeTimers({ now: 5_000_000 });
    const c = call();
    c.commit();
    const observer = createFirstAudioObserver({ sessionId: SID, startTime: Date.now() });
    vi.advanceTimersByTime(180);
    observer.stage('push');
    vi.advanceTimersByTime(470);
    observer.stage('sentence');
    vi.advanceTimersByTime(200);
    observer.stage('sentence'); // once per reply
    c.reply();
    c.detach();
    expect(c.receipts[0].timing.ttsSentenceMs).toBe(650);
  });
});
