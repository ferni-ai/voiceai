/**
 * PAUSE_HOLD_PHONE_CAP: a phone caller's hold reads speech by its words.
 *
 * Prod 2026-10-15..22: 41 of 46 capped holds were on the phone, most waiting
 * on a "speaking" state that never ended and brought no words. Each case runs
 * the real attachPauseHold on a fake session: the same turn with the flag off
 * (or on the web) holds to the 2.5 s cap, with it on a phone hold ends by
 * 1.3 s, and a caller who really goes on is still waited for.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAUSE_HOLD_DEFAULTS,
  PHONE_HOLD,
  attachPauseHold,
  phoneCallerSpeaking,
  phoneHoldConfig,
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

  it('counts wordless speaking only within the grace', () => {
    expect(phoneCallerSpeaking(true, 1000, 0, 1000 + PHONE_HOLD.graceMs - 1)).toBe(true);
    expect(phoneCallerSpeaking(true, 1000, 0, 1000 + PHONE_HOLD.graceMs)).toBe(false);
    expect(phoneCallerSpeaking(true, 1000, 1200, 5000)).toBe(true);
    expect(phoneCallerSpeaking(false, 1000, 1200, 1100)).toBe(false);
  });

  it('caps at 1.3 s until new words come', () => {
    expect(phoneHoldConfig(cfg, false).maxMs).toBe(PHONE_HOLD.maxMs);
    expect(phoneHoldConfig(cfg, true)).toEqual(cfg);
    expect(phoneHoldConfig({ ...cfg, maxMs: 900 }, false).maxMs).toBe(900);
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
  /** Whether the first audio was released. */
  done: () => boolean;
  /** When it was released (fake clock). */
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
  });
  afterEach(() => {
    detach?.();
    detach = null;
    vi.useRealTimers();
  });

  /** Reply ready 300 ms after the commit, then the line goes "speaking" with no words. */
  async function noisyHold(id: string, env: Record<string, string>, phone: boolean) {
    const s = new EventEmitter();
    detach = attachPauseHold(s, id, env, phone);
    hesitantTurn(s, 'Oh, and Biscuit chewed up my phone charger this morning.');
    vi.advanceTimersByTime(300);
    const start = Date.now();
    const hold = startHold(id);
    await vi.advanceTimersByTimeAsync(100);
    s.emit('user_state_changed', { newState: 'speaking' });
    return (await runOut(hold)) - start;
  }

  it('pre: with the flag off a wordless "speaking" holds the phone reply to the 2.5 s cap', async () => {
    expect(await noisyHold('pre-1', HOLD, true)).toBeGreaterThanOrEqual(cfg.maxMs);
  });

  it('post: with the flag on the same phone hold ends by 1.3 s', async () => {
    const heldMs = await noisyHold('post-1', PHONE_CAP, true);
    expect(heldMs).toBeGreaterThan(0);
    expect(heldMs).toBeLessThanOrEqual(PHONE_HOLD.maxMs);
  });

  it('leaves web and iOS callers as they were', async () => {
    expect(await noisyHold('web-1', PHONE_CAP, false)).toBeGreaterThanOrEqual(cfg.maxMs);
  });

  it('caps a phone hold whose caller keeps stopping and starting with no words', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'flicker-1', PHONE_CAP, true);
    hesitantTurn(s, thinking);
    vi.advanceTimersByTime(300);
    const start = Date.now();
    const hold = startHold('flicker-1');
    for (let i = 0; i < 12 && !hold.done(); i++) {
      s.emit('user_state_changed', { newState: 'speaking' });
      await vi.advanceTimersByTimeAsync(200);
      s.emit('user_state_changed', { newState: 'listening', createdAt: Date.now() });
      await vi.advanceTimersByTimeAsync(100);
    }
    expect((await runOut(hold)) - start).toBeLessThanOrEqual(PHONE_HOLD.maxMs);
  });

  it('still waits for a phone caller who goes on: "so I was thinking... um... maybe Thursday"', async () => {
    const s = new EventEmitter();
    detach = attachPauseHold(s, 'thu-1', PHONE_CAP, true);
    hesitantTurn(s, thinking);
    vi.advanceTimersByTime(300);
    const start = Date.now();
    const hold = startHold('thu-1');
    await vi.advanceTimersByTimeAsync(150);
    s.emit('user_state_changed', { newState: 'speaking' });
    await vi.advanceTimersByTimeAsync(300);
    s.emit('user_input_transcribed', { transcript: `${thinking} um...`, isFinal: false });
    await vi.advanceTimersByTimeAsync(600);
    s.emit('user_input_transcribed', { transcript: `${thinking} um... maybe`, isFinal: false });
    await vi.advanceTimersByTimeAsync(500);
    // Past the 1.3 s phone cap, the caller still talking: the reply waits.
    expect(Date.now() - start).toBeGreaterThan(PHONE_HOLD.maxMs);
    expect(hold.done()).toBe(false);
    s.emit('user_input_transcribed', {
      transcript: `${thinking} um... maybe Thursday`,
      isFinal: true,
    });
    // The SDK takes "maybe Thursday" as a new turn and drops this reply unheard;
    // the hold never let it start over the caller before the 2.5 s cap.
    expect((await runOut(hold)) - start).toBeGreaterThanOrEqual(cfg.maxMs);
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
