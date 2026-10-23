/**
 * PAUSE_HOLD_PHONE_CAP: a phone caller's hold reads speech by its words.
 *
 * Prod 2026-10-15..22: 41 of 46 capped holds were on the phone, most waiting on a
 * "speaking" state that brought no words. Each case runs the real attachPauseHold on a
 * fake session and clock. The rule may only shorten a hold whose "speaking" has gone
 * wordless longer than any real restart takes to show words (PHONE_HOLD.graceMs). A
 * caller who goes on, even with a filler or with words that come late, must never be
 * talked over.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ msg: string; fields: Record<string, unknown> }>);
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: (fields: Record<string, unknown>, msg: string) => logged.push({ msg, fields }),
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  }),
}));

import {
  PAUSE_HOLD_DEFAULTS,
  PHONE_HOLD,
  attachPauseHold,
  hasNewWords,
  phoneCallerSpeaking,
  phoneHoldOn,
  waitForPauseHold,
} from '../pause-hold.js';

const cfg = PAUSE_HOLD_DEFAULTS;
const HOLD = { PAUSE_HOLD: 'on' };
const PHONE_CAP = { PAUSE_HOLD: 'on', PAUSE_HOLD_PHONE_CAP: 'on' };
const thinking = 'So I was thinking...';

describe('phone hold rules', () => {
  it('is on only for a phone caller with the flag on', () => {
    expect(phoneHoldOn(true, PHONE_CAP)).toBe(true);
    expect(phoneHoldOn(true, HOLD)).toBe(false);
    expect(phoneHoldOn(false, PHONE_CAP)).toBe(false);
    expect(phoneHoldOn(undefined, PHONE_CAP)).toBe(false);
  });

  it('covers the slowest phone words: graceMs is at least first segment + p99 STT delay', () => {
    // Prod phone TURN_METRICS 10-17..22 (n=347): speech end -> final, p99 907 ms.
    expect(PHONE_HOLD.graceMs).toBeGreaterThanOrEqual(907 + 1000);
  });

  it('counts wordless speaking only within the grace', () => {
    const since = 1000;
    expect(phoneCallerSpeaking(true, since, undefined, since + PHONE_HOLD.graceMs - 1)).toBe(true);
    expect(phoneCallerSpeaking(true, since, undefined, since + PHONE_HOLD.graceMs)).toBe(false);
    expect(phoneCallerSpeaking(false, since, 1200, 1100)).toBe(false);
  });

  it('counts speaking with words only when the words came after it began', () => {
    const since = 5000;
    expect(phoneCallerSpeaking(true, since, since + 10, since + 9000)).toBe(true);
    // Words from before this speaking began (an earlier restart) don't make it speech
    expect(phoneCallerSpeaking(true, since, since - 10, since + 9000)).toBe(false);
  });

  it('takes only real new words beyond the transcript that ended the turn', () => {
    const turn = 'So I was thinking';
    expect(hasNewWords('so i was thinking.', turn)).toBe(false); // case and punctuation
    expect(hasNewWords('So, I was thinking...', turn)).toBe(false);
    expect(hasNewWords('So I was', turn)).toBe(false); // a shorter re-send
    expect(hasNewWords('So I was thinking um maybe', turn)).toBe(true);
    expect(hasNewWords('Maybe Thursday', turn)).toBe(true); // a new segment
    expect(hasNewWords('  ...  ', turn)).toBe(false);
  });
});

/** A hesitant turn: words, the caller stops, ink ends the turn 650 ms later. */
function hesitantTurn(s: EventEmitter, words: string): number {
  const stoppedAt = Date.now();
  s.emit('user_state_changed', { newState: 'speaking' });
  s.emit('user_input_transcribed', { transcript: words, isFinal: false });
  s.emit('user_state_changed', { newState: 'listening', createdAt: stoppedAt + 350 });
  vi.advanceTimersByTime(650);
  s.emit('metrics_collected', { metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt } });
  s.emit('agent_state_changed', { newState: 'thinking' });
  return stoppedAt;
}

interface Hold {
  done: () => boolean;
  /** When the first audio was released (fake clock). */
  at: () => number;
  p: Promise<void>;
}

function startHold(sessionId: string): Hold {
  let releasedAt = 0;
  const p = waitForPauseHold(sessionId).then(() => {
    releasedAt = Date.now();
  });
  return { done: () => releasedAt > 0, at: () => releasedAt, p };
}

/** Runs the clock until the hold lets go; returns when it did. */
async function runOut(hold: Hold): Promise<number> {
  for (let i = 0; i < 400 && !hold.done(); i++) await vi.advanceTimersByTimeAsync(25);
  await hold.p;
  return hold.at();
}

describe('attachPauseHold on a phone line', () => {
  let detach: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    logged.length = 0;
  });
  afterEach(() => {
    detach?.();
    detach = null;
    vi.useRealTimers();
  });

  /**
   * The line "speaks" from before the turn ended and never stops, with no words: the
   * case the rule is for (no listening event since the turn's words).
   */
  async function stuckLine(id: string, env: Record<string, string>, phone: boolean) {
    const s = new EventEmitter();
    detach = attachPauseHold(s, id, env, phone);
    const stoppedAt = Date.now();
    s.emit('user_state_changed', { newState: 'speaking' });
    s.emit('user_input_transcribed', { transcript: 'Oh, and Biscuit chewed up my charger.' });
    vi.advanceTimersByTime(650);
    s.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt },
    });
    s.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(300);
    const start = Date.now();
    return { heldMs: (await runOut(startHold(id))) - start, stoppedAt };
  }

  it('pre: flag off, a line stuck "speaking" holds the phone reply to the 2.5 s cap', async () => {
    expect((await stuckLine('pre-1', HOLD, true)).heldMs).toBeGreaterThanOrEqual(cfg.maxMs);
  });

  it('post: flag on, the same phone hold ends by 1.3 s after the turn ended', async () => {
    const { heldMs } = await stuckLine('post-1', PHONE_CAP, true);
    expect(heldMs).toBeLessThanOrEqual(PHONE_HOLD.maxMs);
  });

  it('leaves web and iOS callers as they were', async () => {
    expect((await stuckLine('web-1', PHONE_CAP, false)).heldMs).toBeGreaterThanOrEqual(cfg.maxMs);
  });

  it('logs the caller path on every hold, and the rule only when it is on', async () => {
    await stuckLine('log-off', HOLD, true);
    const off = logged.find((l) => l.msg === 'PAUSE_HOLD_RELEASED');
    expect(off?.fields).toMatchObject({ caller: 'phone' });
    expect(off?.fields).not.toHaveProperty('phoneRule');
    logged.length = 0;
    await stuckLine('log-on', PHONE_CAP, true);
    expect(logged.find((l) => l.msg === 'PAUSE_HOLD_RELEASED')?.fields).toMatchObject({
      caller: 'phone',
      phoneRule: true,
    });
    logged.length = 0;
    await stuckLine('log-web', PHONE_CAP, false);
    expect(logged.find((l) => l.msg === 'PAUSE_HOLD')?.fields).toMatchObject({ caller: 'web' });
  });

  it('does not count a punctuation or case edit of the turn as the caller going on', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'punct-1', PHONE_CAP, true);
    const stoppedAt = Date.now();
    s.emit('user_state_changed', { newState: 'speaking' });
    s.emit('user_input_transcribed', { transcript: 'so i was thinking' });
    vi.advanceTimersByTime(650);
    s.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt },
    });
    s.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(300);
    const start = Date.now();
    const hold = startHold('punct-1');
    await vi.advanceTimersByTimeAsync(200);
    // The turn's final, re-cased and punctuated, lands after the commit
    s.emit('user_input_transcribed', { transcript: 'So I was thinking.', isFinal: true });
    expect((await runOut(hold)) - start).toBeLessThanOrEqual(PHONE_HOLD.maxMs);
  });

  it('still waits when the restart\'s first words come late: "...um... maybe Thursday" at +1.4 s', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'thu-1', PHONE_CAP, true);
    hesitantTurn(s, thinking);
    vi.advanceTimersByTime(300);
    const start = Date.now();
    const hold = startHold('thu-1');
    await vi.advanceTimersByTimeAsync(150);
    s.emit('user_state_changed', { newState: 'speaking' });
    const speakingAt = Date.now();
    await vi.advanceTimersByTimeAsync(1400);
    // Nothing transcribed yet, the caller has been talking 1.4 s: no release
    expect(hold.done()).toBe(false);
    s.emit('user_input_transcribed', { transcript: 'um maybe', isFinal: false });
    await vi.advanceTimersByTimeAsync(400);
    s.emit('user_input_transcribed', { transcript: 'um maybe Thursday', isFinal: true });
    const releasedAt = await runOut(hold);
    expect(releasedAt - speakingAt).toBeGreaterThan(1400);
    expect(releasedAt - start).toBeGreaterThanOrEqual(cfg.maxMs);
  });

  it('still waits when the restart opens with a filler that brings no words ("uh... maybe")', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'uh-1', PHONE_CAP, true);
    hesitantTurn(s, thinking);
    vi.advanceTimersByTime(300);
    const start = Date.now();
    const hold = startHold('uh-1');
    await vi.advanceTimersByTimeAsync(100);
    s.emit('user_state_changed', { newState: 'speaking' }); // "uh": ink drops it
    await vi.advanceTimersByTimeAsync(300);
    s.emit('user_state_changed', { newState: 'listening', createdAt: Date.now() + 350 });
    await vi.advanceTimersByTimeAsync(400);
    s.emit('user_state_changed', { newState: 'speaking' }); // "maybe Thursday"
    await vi.advanceTimersByTimeAsync(1200);
    expect(hold.done()).toBe(false); // no words yet: still waiting
    s.emit('user_input_transcribed', { transcript: 'maybe Thursday', isFinal: true });
    expect((await runOut(hold)) - start).toBeGreaterThanOrEqual(cfg.maxMs);
  });

  it('keeps the quiet window for a reply that was ready before the turn ended', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'early-1', PHONE_CAP, true);
    s.emit('user_state_changed', { newState: 'speaking' });
    s.emit('user_input_transcribed', { transcript: 'So I was thinking' });
    // A preemptive reply's audio is ready while the caller is still talking
    const hold = startHold('early-1');
    await vi.advanceTimersByTimeAsync(500);
    s.emit('user_input_transcribed', { transcript: 'So I was thinking about Friday' });
    const stoppedAt = Date.now();
    s.emit('user_state_changed', { newState: 'listening', createdAt: stoppedAt + 350 });
    await vi.advanceTimersByTimeAsync(650);
    s.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt },
    });
    s.emit('agent_state_changed', { newState: 'thinking' });
    expect((await runOut(hold)) - stoppedAt).toBeGreaterThanOrEqual(cfg.silenceMs);
  });

  it('holds a quiet phone caller the normal 1.3 s window', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'quiet-1', PHONE_CAP, true);
    const stoppedAt = hesitantTurn(s, thinking);
    vi.advanceTimersByTime(300);
    const releasedAt = await runOut(startHold('quiet-1'));
    expect(releasedAt - stoppedAt).toBeGreaterThanOrEqual(cfg.silenceMs);
    expect(releasedAt - stoppedAt).toBeLessThan(cfg.silenceMs + 50);
  });
});
