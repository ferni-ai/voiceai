/**
 * The slow-turn sound on a call's real signals: the crisis gate's pending verdict
 * and decision (crisis-gate-signal.ts), the reply's words at TTS
 * (reply-activity.ts) and the tool signal (empty-response-watchdog.ts).
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crisisVerdictPending,
  noteCrisisVerdictPending,
  signalCrisisDecision,
} from '../../safety/crisis-gate-signal.js';
import { signalToolCallRequested } from '../../voice-agent/empty-response-watchdog.js';
import {
  clearReplyActivity,
  noteReplyText,
} from '../../../speech/output-control/reply-activity.js';
import { SLOW_TURN } from '../slow-turn-sound.js';
import { attachSlowTurnSoundToCall } from '../slow-turn-wiring.js';
import { turnOpenedSince } from '../turn-opening-sound.js';

let n = 0;
function call() {
  const session = Object.assign(new EventEmitter(), { history: { items: [] } });
  const sessionId = `slow-${++n}`;
  const played: string[] = [];
  const detach = attachSlowTurnSoundToCall(
    session,
    sessionId,
    {
      playClip: (t) => (played.push(t), true),
      lastPlayedAt: () => 0,
    },
    () => 'ferni'
  );
  const turn = (words: string) => {
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(500);
    session.emit('user_state_changed', { newState: 'listening' });
    session.emit('ferni_preemptive_decision', { used: true });
    session.emit('conversation_item_added', { item: { role: 'user', textContent: words } });
  };
  return { session, sessionId, played, detach, turn };
}

describe('slow-turn sound on the real call signals', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a tool turn with no words at TTS gets "Mm", and the reply opener is trimmed after it', async () => {
    const c = call();
    c.turn('tell me about it');
    signalToolCallRequested(c.session);
    const since = Date.now();
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(c.played).toEqual(['Mm']);
    expect(turnOpenedSince(c.session, since)).toBe(true);
    c.detach();
  });

  it('words already at TTS: nothing', async () => {
    const c = call();
    c.turn('tell me about it');
    signalToolCallRequested(c.session);
    vi.advanceTimersByTime(300);
    noteReplyText(c.sessionId);
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs);
    expect(c.played).toEqual([]);
    clearReplyActivity(c.sessionId);
    c.detach();
  });

  it('holds while the classifier holds the reply; a guide decision means no sound', async () => {
    const c = call();
    let settle!: () => void;
    noteCrisisVerdictPending(
      c.session,
      new Promise<void>((r) => {
        settle = r;
      })
    );
    c.turn('tell me about it');
    signalToolCallRequested(c.session);
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs + 200);
    expect(c.played).toEqual([]);
    signalCrisisDecision(c.session, 'guide');
    settle();
    await vi.advanceTimersByTimeAsync(0);
    expect(crisisVerdictPending(c.session)).toBeNull();
    expect(c.played).toEqual([]);
    c.detach();
  });

  it('a verdict that clears releases the held sound', async () => {
    const c = call();
    let settle!: () => void;
    noteCrisisVerdictPending(
      c.session,
      new Promise<void>((r) => {
        settle = r;
      })
    );
    c.turn('tell me about it');
    signalToolCallRequested(c.session);
    await vi.advanceTimersByTimeAsync(SLOW_TURN.waitMs + 200);
    settle();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.played).toEqual(['Mm']);
    c.detach();
  });
});
