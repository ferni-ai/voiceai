import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAUSE_HOLD_DEFAULTS,
  attachPauseHold,
  hesitantCommit,
  pauseHoldConfig,
  pauseHoldWaitMs,
  waitForPauseHold,
} from '../pause-hold.js';
import { createFirstAudioObserver } from '../../tts-gateway/first-audio-observer.js';

const ON = { PAUSE_HOLD: 'on' };
const cfg = PAUSE_HOLD_DEFAULTS;

describe('pause hold settings', () => {
  it('is off unless PAUSE_HOLD=on', () => {
    expect(pauseHoldConfig({})).toBeNull();
    expect(pauseHoldConfig({ PAUSE_HOLD: 'true' })).toBeNull();
    expect(pauseHoldConfig(ON)).toEqual(PAUSE_HOLD_DEFAULTS);
  });

  it('takes valid overrides and ignores junk', () => {
    expect(pauseHoldConfig({ ...ON, PAUSE_HOLD_MS: '1500', PAUSE_HOLD_LEAD_MS: 'x' })).toEqual({
      ...PAUSE_HOLD_DEFAULTS,
      silenceMs: 1500,
    });
  });
});

describe('hesitantCommit', () => {
  const biscuit = 'Oh, and Biscuit chewed up my phone charger this morning.';
  it('holds when ink waited past the lead after the words', () => {
    expect(hesitantCommit(biscuit, 630, cfg)).toBe(true);
    expect(hesitantCommit(biscuit, cfg.leadMs, cfg)).toBe(true);
  });
  it('does not hold a quick end', () => {
    expect(hesitantCommit(biscuit, 229, cfg)).toBe(false);
  });
  it('does not hold a question: the caller handed over', () => {
    expect(hesitantCommit('So what do you think?', 900, cfg)).toBe(false);
    expect(hesitantCommit('Is it "fun?"', 900, cfg)).toBe(false);
  });
  it('does not hold an empty turn', () => {
    expect(hesitantCommit('  ', 900, cfg)).toBe(false);
  });
});

describe('pauseHoldWaitMs', () => {
  it('waits until the caller has been quiet the full window', () => {
    const held = { stoppedAt: 1000, heldSince: 2000 };
    expect(pauseHoldWaitMs(held, false, 2000, cfg)).toBe(1000 + cfg.silenceMs - 2000);
    expect(pauseHoldWaitMs(held, false, 1000 + cfg.silenceMs, cfg)).toBe(0);
  });
  it('keeps waiting while the caller speaks, up to the cap', () => {
    const held = { stoppedAt: 0, heldSince: 1000 };
    expect(pauseHoldWaitMs(held, true, 5000 - cfg.maxMs + 1000 - 1, cfg)).toBeGreaterThan(0);
    expect(pauseHoldWaitMs(held, true, 1000 + cfg.maxMs, cfg)).toBe(0);
  });
  it('never waits past the cap', () => {
    const held = { stoppedAt: 10_000, heldSince: 0 };
    expect(pauseHoldWaitMs(held, false, 0, cfg)).toBe(cfg.maxMs);
  });
});

/** A session that plays one turn: words, ink's end, the commit. */
function session(): EventEmitter {
  return new EventEmitter();
}

function turn(s: EventEmitter, words: string, stoppedAt: number, leadMs: number): void {
  s.emit('user_state_changed', { newState: 'speaking' });
  s.emit('user_input_transcribed', { transcript: words, isFinal: false });
  s.emit('user_state_changed', { newState: 'listening', createdAt: stoppedAt + 350 });
  vi.advanceTimersByTime(leadMs);
  s.emit('metrics_collected', { metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt } });
  s.emit('agent_state_changed', { newState: 'thinking' });
}

/** Resolves to how long (fake ms) the first audio was held. */
async function heldFor(sessionId: string): Promise<number> {
  const start = Date.now();
  let done = false;
  const p = waitForPauseHold(sessionId).then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 400 && !done; i++) await vi.advanceTimersByTimeAsync(25);
  await p;
  return Date.now() - start;
}

describe('attachPauseHold', () => {
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

  it('is not installed when off', async () => {
    const s = session();
    expect(attachPauseHold(s, 'off-1', {})).toBeNull();
    turn(s, 'Oh, and Biscuit chewed up my phone charger this morning.', Date.now(), 650);
    expect(await heldFor('off-1')).toBe(0);
  });

  it('holds a hesitant turn until the caller has been quiet the window', async () => {
    const s = session();
    detach = attachPauseHold(s, 'h-1', ON);
    const stoppedAt = Date.now() - 120;
    turn(s, 'Oh, and Biscuit chewed up my phone charger this morning.', stoppedAt, 650);
    // Reply audio ready ~300 ms after the commit, as on the fast dev path.
    vi.advanceTimersByTime(300);
    expect(await heldFor('h-1')).toBeGreaterThan(0);
    expect(Date.now() - stoppedAt).toBeGreaterThanOrEqual(cfg.silenceMs);
    expect(Date.now() - stoppedAt).toBeLessThan(cfg.silenceMs + 50);
  });

  it('plays a clear end at once', async () => {
    const s = session();
    detach = attachPauseHold(s, 'c-1', ON);
    turn(s, 'Work was just a lot. My manager moved a big deadline up to Friday.', Date.now(), 150);
    vi.advanceTimersByTime(300);
    expect(await heldFor('c-1')).toBe(0);
  });

  it('plays a hesitant question at once', async () => {
    const s = session();
    detach = attachPauseHold(s, 'q-1', ON);
    turn(s, 'Do you think I should just quit?', Date.now(), 700);
    vi.advanceTimersByTime(300);
    expect(await heldFor('q-1')).toBe(0);
  });

  it('keeps holding while the caller goes on, then counts quiet from their new stop', async () => {
    const s = session();
    detach = attachPauseHold(s, 'r-1', ON);
    const stoppedAt = Date.now();
    turn(s, 'Oh, and Biscuit chewed up my phone charger this morning.', stoppedAt, 650);
    vi.advanceTimersByTime(300);
    const start = Date.now();
    let done = false;
    const p = waitForPauseHold('r-1').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(100); // 1050 ms quiet: the caller goes on
    s.emit('user_state_changed', { newState: 'speaking' });
    await vi.advanceTimersByTimeAsync(800); // past stoppedAt + window, still talking
    expect(done).toBe(false);
    s.emit('user_state_changed', { newState: 'listening', createdAt: Date.now() });
    const newStop = Date.now() - 350;
    while (!done && Date.now() - start < cfg.maxMs + 100) await vi.advanceTimersByTimeAsync(25);
    await p;
    expect(Date.now() - newStop).toBeGreaterThanOrEqual(cfg.silenceMs);
  });

  it('decides a preemptive reply at the commit, not before', async () => {
    const s = session();
    detach = attachPauseHold(s, 'p-1', ON);
    const stoppedAt = Date.now();
    s.emit('user_input_transcribed', {
      transcript: 'Oh, and Biscuit chewed up my phone charger this morning.',
    });
    // Audio is ready before ink ends the turn.
    let done = false;
    const p = waitForPauseHold('p-1').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(650);
    expect(done).toBe(false);
    s.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', lastSpeakingTimeMs: stoppedAt },
    });
    s.emit('agent_state_changed', { newState: 'thinking' });
    while (!done) await vi.advanceTimersByTimeAsync(25);
    await p;
    expect(Date.now() - stoppedAt).toBeGreaterThanOrEqual(cfg.silenceMs);
  });

  it('holds the gateway TTS first audio through the observer', async () => {
    const s = session();
    detach = attachPauseHold(s, 'o-1', ON);
    const stoppedAt = Date.now();
    turn(s, 'Oh, and Biscuit chewed up my phone charger this morning.', stoppedAt, 650);
    const observe = createFirstAudioObserver({ sessionId: 'o-1', startTime: Date.now() });
    let done = false;
    const p = observe.hold().then(() => {
      done = true;
    });
    while (!done) await vi.advanceTimersByTimeAsync(25);
    await p;
    expect(Date.now() - stoppedAt).toBeGreaterThanOrEqual(cfg.silenceMs);
  });

  it('stops holding once the reply is speaking', async () => {
    const s = session();
    detach = attachPauseHold(s, 'f-1', ON);
    turn(s, 'Oh, and Biscuit chewed up my phone charger this morning.', Date.now(), 650);
    // The reply started on a path that doesn't wait (e.g. a cached clip stream):
    // the turn has been answered, so a later stream in it is not held.
    s.emit('agent_state_changed', { newState: 'speaking' });
    expect(await heldFor('f-1')).toBe(0);
  });
  it('does not wait for a commit after words spoken over Ferni', async () => {
    const s = session();
    detach = attachPauseHold(s, 'b-1', ON);
    s.emit('agent_state_changed', { newState: 'speaking' });
    s.emit('user_input_transcribed', { transcript: 'Mm-hmm.' });
    s.emit('agent_state_changed', { newState: 'listening' });
    // A tool call's follow-up reply: no caller turn is pending, so no wait.
    expect(await heldFor('b-1')).toBe(0);
  });
});
