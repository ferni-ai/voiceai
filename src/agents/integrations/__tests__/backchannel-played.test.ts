/**
 * BACKCHANNEL_PLAYED (backchannel-played.ts): one line per clip played in the
 * caller's pause, written once its take-back window has passed or at once when it
 * is taken back. Driven through the live integration on fake audio (as in
 * live-backchannel-cancel.test.ts) and the direct track's VAD take-back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';

const lines = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const log: Record<string, unknown> = {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: (fields: Record<string, unknown>, msg?: string) => {
      if (msg === 'BACKCHANNEL_PLAYED') lines.push(fields);
    },
  };
  log.child = () => log;
  return { ...real, getLogger: () => log, createLogger: () => log };
});

import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';
import { cutFreshClipOnVoice } from '../clip-voice-cut.js';

/** Past the 200 ms take-back window (CANCEL_WINDOW_MS), when backchannel-played.ts writes the line. */
const SETTLE_MS = 250;

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

let sessions = 0;

function setup(cancelClip?: () => boolean) {
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  lines.length = 0;
  const session = {};
  const sessionId = `played-${++sessions}`;
  let plays = 0;
  const bc = initializeLiveBackchanneling(sessionId, 'ferni', session as never, () => false, {
    playClip: () => {
      plays++;
      return true;
    },
    cancelClip,
  });
  bc.onNewTurn();
  let t = 0;
  const run = (loud: boolean, ms: number): void => {
    for (let i = 0; i < ms / 10; i++, t++) {
      vi.advanceTimersByTime(10);
      bc.processAudioFrame(frame(loud, t));
    }
  };
  return { session, sessionId, run, bc, plays: () => plays };
}

beforeEach(() => {
  vi.stubEnv('BACKCHANNEL_PLAYED', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('BACKCHANNEL_PLAYED', () => {
  it('flag off (the default): the clip still plays and is taken back as before, and no line is written', () => {
    vi.stubEnv('BACKCHANNEL_PLAYED', '');
    const c = setup(() => true);
    c.run(true, 3000);
    c.run(false, 320);
    expect(c.plays()).toBe(1);
    vi.advanceTimersByTime(SETTLE_MS * 4);
    c.run(true, 3000);
    c.run(false, 320);
    c.run(true, 100); // taken back by the pause clock
    cutFreshClipOnVoice(c.session, { cancelIfFresh: () => true }, { newState: 'speaking' });
    vi.advanceTimersByTime(SETTLE_MS * 4);
    expect(c.plays()).toBe(2);
    expect(lines).toEqual([]);
  });

  it('a clip that plays out: one line once the take-back window has passed', () => {
    const c = setup();
    c.run(true, 3000);
    c.run(false, 320); // the clip plays ~220 ms into the pause
    expect(c.plays()).toBe(1);
    expect(lines).toEqual([]); // not yet: it could still be taken back
    vi.advanceTimersByTime(SETTLE_MS);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatchObject({
      event: 'BACKCHANNEL_PLAYED',
      sessionId: c.sessionId,
      clip: 'backchannel',
      cancelledBy: null,
    });
    // They had talked ~3 s; the pause was ~220 ms old when the clip played.
    expect(line.callerRunMs as number).toBeGreaterThanOrEqual(2900);
    expect(line.callerRunMs as number).toBeLessThanOrEqual(3100);
    expect(line.quietMs as number).toBeGreaterThanOrEqual(150);
    expect(line.quietMs as number).toBeLessThanOrEqual(320);
  });

  it('a clip taken back because the caller carried on says so, once', () => {
    const c = setup(() => true);
    c.run(true, 3000);
    c.run(false, 320);
    c.run(true, 100); // they talk on: the clip is taken back
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ clip: 'backchannel', cancelledBy: 'pause_ended' });
    vi.advanceTimersByTime(SETTLE_MS * 4);
    c.run(true, 1000);
    expect(lines).toHaveLength(1);
  });

  it("LiveKit's VAD taking the clip back is 'vad'", () => {
    const c = setup();
    c.run(true, 3000);
    c.run(false, 320);
    cutFreshClipOnVoice(c.session, { cancelIfFresh: () => true }, { newState: 'speaking' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ cancelledBy: 'vad' });
  });

  it('nothing is taken back when the direct track had nothing fresh to cut', () => {
    const c = setup();
    c.run(true, 3000);
    c.run(false, 320);
    cutFreshClipOnVoice(c.session, { cancelIfFresh: () => false }, { newState: 'speaking' });
    vi.advanceTimersByTime(SETTLE_MS);
    expect(lines).toEqual([expect.objectContaining({ cancelledBy: null })]);
  });

  it('a laugh-along clip is a laugh, and its line holds none of what they said', () => {
    vi.stubEnv('LAUGH_ALONG', 'on');
    const c = setup();
    c.bc.updateState({ partialTranscript: 'hahaha and then the cat just sat on it' });
    c.run(true, 3000);
    c.run(false, 320);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(lines).toEqual([expect.objectContaining({ clip: 'laugh', cancelledBy: null })]);
    expect(JSON.stringify(lines)).not.toMatch(/cat|haha/i);
  });

  it('no clip in the pause, no line', () => {
    const c = setup(() => true);
    c.run(true, 1500); // too short a turn for a backchannel
    c.run(false, 300);
    c.run(true, 500);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(c.plays()).toBe(0);
    expect(lines).toEqual([]);
  });

  it('carries only ids, enums and numbers: no words', () => {
    const c = setup();
    c.run(true, 3000);
    c.run(false, 320);
    vi.advanceTimersByTime(SETTLE_MS);
    const line = lines[0]!;
    expect(Object.keys(line).sort()).toEqual(
      ['callerRunMs', 'cancelledBy', 'clip', 'event', 'quietMs', 'sessionId'].sort()
    );
    for (const v of Object.values(line)) {
      expect(['string', 'number', 'object']).toContain(typeof v);
      if (typeof v === 'object') expect(v).toBeNull();
      if (typeof v === 'string') expect(v.length).toBeLessThanOrEqual(40);
    }
  });
});
