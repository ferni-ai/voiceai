/**
 * The slow-turn sound on a call's real signals: the crisis gate's pending verdict
 * and decision (crisis-gate-signal.ts), the reply's words at TTS
 * (reply-activity.ts), the tool signal (empty-response-watchdog.ts), and the
 * early opening sound it shares one sound per turn with (turn-opening-sound.ts).
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteCrisisVerdictPending, signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import { signalToolCallRequested } from '../../voice-agent/empty-response-watchdog.js';
import {
  clearReplyActivity,
  noteReplyText,
} from '../../../speech/output-control/reply-activity.js';
import { SLOW_TURN } from '../slow-turn-sound.js';
import { attachSlowTurnSoundToCall } from '../slow-turn-wiring.js';
import { attachTurnOpeningSound, turnOpenedSince } from '../turn-opening-sound.js';

let n = 0;
function call(opts: { early?: boolean } = {}) {
  const session = Object.assign(new EventEmitter(), { history: { items: [] } });
  const sessionId = `slow-${++n}`;
  const played: Array<{ turn: number; text: string }> = [];
  let turnNo = 0;
  let lastPlayed = 0;
  const clips = {
    playClip: (text: string) => {
      played.push({ turn: turnNo, text });
      lastPlayed = Date.now();
      return true;
    },
    lastPlayedAt: () => lastPlayed,
  };
  let words = '';
  const detachEarly = opts.early
    ? attachTurnOpeningSound(
        session,
        clips,
        () => words,
        () => false,
        {
          waitMs: 100,
          replyTextSince: () => false,
          clipMs: () => 0,
          holdReply: () => undefined,
        }
      )
    : () => undefined;
  const detach = attachSlowTurnSoundToCall(session, sessionId, clips, () => 'ferni');
  /** One caller turn as prod runs it with ink: the decision and commit come before VAD's stop. */
  const turn = (text: string, preemptiveUsed = false) => {
    turnNo += 1;
    words = text;
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(800);
    session.emit('agent_state_changed', { newState: 'thinking' });
    session.emit('ferni_preemptive_decision', { used: preemptiveUsed });
    session.emit('conversation_item_added', { item: { role: 'user', textContent: text } });
    session.emit('user_state_changed', { newState: 'listening' });
  };
  /** The reply plays, then the caller takes a breath before the next turn. */
  const reply = () => {
    session.emit('agent_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(3000);
    session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(3000);
  };
  return {
    session,
    sessionId,
    played,
    turn,
    reply,
    detach: () => {
      detach();
      detachEarly();
    },
  };
}

describe('slow-turn sound on the real call signals', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a tool turn with no words at TTS gets "Mm", and the reply opener is trimmed after it', () => {
    const c = call();
    c.turn('tell me about it', true);
    signalToolCallRequested(c.session);
    const since = Date.now();
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    expect(c.played.map((p) => p.text)).toEqual(['Mm']);
    expect(turnOpenedSince(c.session, since)).toBe(true);
    c.detach();
  });

  it('words already at TTS: nothing', () => {
    const c = call();
    c.turn('tell me about it');
    signalToolCallRequested(c.session);
    vi.advanceTimersByTime(300);
    noteReplyText(c.sessionId);
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    expect(c.played).toEqual([]);
    clearReplyActivity(c.sessionId);
    c.detach();
  });

  it('a crisis verdict pending at the wait: no sound, even when it clears', async () => {
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
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    settle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.played).toEqual([]);
    c.detach();
  });

  it('after the crisis gate acted on the call: no sound', () => {
    const c = call();
    signalCrisisDecision(c.session, 'guide');
    c.turn('can you call my sister for me');
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    expect(c.played).toEqual([]);
    c.detach();
  });

  it('a hang-up asked for this turn: no sound before it', () => {
    const c = call();
    c.turn('can you call my sister for me');
    signalToolCallRequested(c.session, ['endCall']);
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    expect(c.played).toEqual([]);
    c.detach();
  });

  it('a goodbye turn: no sound', () => {
    const c = call();
    c.turn('okay call you later, bye');
    vi.advanceTimersByTime(SLOW_TURN.waitMs);
    expect(c.played).toEqual([]);
    c.detach();
  });

  it('with the early opening sound: one sound per turn, never two turns running', () => {
    const c = call({ early: true });
    for (let i = 0; i < 6; i++) {
      c.turn(i % 2 ? 'and can you call my mom after' : 'can you call my sister for me');
      vi.advanceTimersByTime(SLOW_TURN.waitMs + 100);
      c.reply();
    }
    const turns = c.played.map((p) => p.turn);
    expect(turns.length).toBeGreaterThanOrEqual(2); // the sounds still happen
    expect(new Set(turns).size).toBe(turns.length); // one per turn
    for (let i = 1; i < turns.length; i++) expect(turns[i] - turns[i - 1]).toBeGreaterThan(1);
    c.detach();
  });
});
