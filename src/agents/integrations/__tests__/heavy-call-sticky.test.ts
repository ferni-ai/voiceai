/**
 * HEAVY_CALL_STICKY (#3845): once a call has had a hard moment, its live
 * backchannels stay grave until the call ends. Before, "grave" was only the
 * caller's last 3 turns, and speech-to-text splits a grieving caller into short
 * fragments, so a few fragments after the loss the happy "Mmhm!" take and the
 * laugh-along were allowed again. Flag off: exactly that, as on main.
 *
 * Drives the real integration (initializeLiveBackchanneling) over an invented
 * call from the fictional eval caller Riley Test; the session's history holds
 * the turns the call has committed, as the live AgentSession's does.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BACKCHANNEL_TAKES, VOICED_TAKES } from '../../shared/reaction-clips.js';
import { getLiveBackchannelingService } from '../../../speech/live-backchanneling/index.js';
import { SOFT_BACKCHANNELS } from '../backchannel-policy.js';
import { heavyCallSticky } from '../heavy-call-sticky.js';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';
import { startVoicedPresence } from '../voiced-presence.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

/** Riley Test's loss, early in the call. */
const LOSS = 'My grandpa died on Sunday.';
/** Then halting fragments, as speech-to-text splits them: none says anything hard. */
const FRAGMENTS = ['so.', 'anyway the', 'kitchen is', 'a mess.', 'and the', 'car too.'];
/** Then a plain line: nothing in it is hard, and no reaction fits it. */
const NEUTRAL = 'I picked up some milk at the store.';
const LAUGHING = 'hahaha and then the cat just sat on it';

const HAPPY = '<emotion value="happy"/>Mmhm!';
const SOFT = new Set<string>([
  ...SOFT_BACKCHANNELS,
  ...Object.values(BACKCHANNEL_TAKES.soft).flat(),
]);

interface HistoryItem {
  type: 'message';
  role: 'user';
  textContent: string;
}
interface CallSession {
  history: { items: HistoryItem[] };
}

/** A session whose history holds these caller turns, committed. */
const committed = (lines: readonly string[]): CallSession => ({
  history: { items: lines.map((textContent) => ({ type: 'message', role: 'user', textContent })) },
});

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

const seeded =
  (seed: number, scale = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) / 2147483647) * scale;

let calls = 0;

/** A call: `earlier` committed caller turns, then `said` again and again across pauses. */
function liveCall(opts: {
  earlier: readonly string[];
  said: string;
  clips: number;
  sessionId?: string;
  session?: CallSession;
}) {
  const sessionId = opts.sessionId ?? `sticky-${++calls}`;
  const session = opts.session ?? { history: { items: [] } };
  const played: string[] = [];
  const bc = initializeLiveBackchanneling(sessionId, 'ferni', session as never, () => false, {
    playClip: (text) => (played.push(text), true),
  });
  for (const line of opts.earlier) {
    bc.onNewTurn();
    bc.updateState({ partialTranscript: line });
    session.history.items.push({ type: 'message', role: 'user', textContent: line });
  }
  bc.onNewTurn();
  let t = 0;
  const run = (loud: boolean, ms: number): void => {
    for (let i = 0; i < ms / 10; i++, t++) {
      vi.advanceTimersByTime(10);
      bc.processAudioFrame(frame(loud, t));
    }
  };
  for (let i = 0; i < 200 && played.length < opts.clips; i++) {
    run(true, 6000);
    bc.updateState({ partialTranscript: opts.said });
    run(false, 500);
  }
  return { played, end: () => bc.cleanup(), sessionId };
}

beforeEach(() => {
  vi.stubEnv('BACKCHANNEL_AUDIO_CLOCK', 'on');
  vi.stubEnv('BACKCHANNEL_TIMING', 'on');
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockImplementation(seeded(7, 0.5));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('a grief call, the loss 7 fragments back', () => {
  const earlier = [LOSS, ...FRAGMENTS];

  it('flag off (main): the loss has left the window, bright takes and the happy "Mmhm!" play', () => {
    const { played, end } = liveCall({ earlier, said: NEUTRAL, clips: 40 });
    end();
    expect(played).toHaveLength(40);
    expect(played.some((clip) => !SOFT.has(clip))).toBe(true);
    expect(played).toContain(HAPPY);
  });

  it('flag on: soft "mm"s only for the rest of the call, never the happy take', () => {
    vi.stubEnv('HEAVY_CALL_STICKY', 'on');
    const { played, end } = liveCall({ earlier, said: NEUTRAL, clips: 40 });
    end();
    expect(played).toHaveLength(40);
    for (const clip of played) expect(SOFT, clip).toContain(clip);
    expect(played.some((clip) => (VOICED_TAKES.mmhm as readonly string[]).includes(clip))).toBe(
      false
    );
  });

  it('flag on: no laugh-along when the caller laughs, nor a "Ha"', () => {
    vi.stubEnv('LAUGH_ALONG', 'on');
    const off = liveCall({ earlier, said: LAUGHING, clips: 1 });
    off.end();
    expect(off.played).toEqual(['[laughter]']);
    vi.stubEnv('HEAVY_CALL_STICKY', 'on');
    const on = liveCall({ earlier, said: LAUGHING, clips: 3 });
    on.end();
    expect(on.played).toHaveLength(3);
    expect(on.played).not.toContain('[laughter]');
    expect(on.played).not.toContain('Ha');
    for (const clip of on.played) expect(SOFT, clip).toContain(clip);
  });
});

describe('flag on, a call with no hard moment', () => {
  it('still gets bright takes and the laugh-along', () => {
    vi.stubEnv('HEAVY_CALL_STICKY', 'on');
    const light = liveCall({ earlier: ['Hey Ferni.', ...FRAGMENTS], said: NEUTRAL, clips: 40 });
    light.end();
    expect(light.played.some((clip) => !SOFT.has(clip))).toBe(true);
    vi.stubEnv('LAUGH_ALONG', 'on');
    const laugh = liveCall({ earlier: ['Hey Ferni.'], said: LAUGHING, clips: 1 });
    laugh.end();
    expect(laugh.played).toEqual(['[laughter]']);
  });
});

describe('flag on, the call ends', () => {
  it('the next call on the same session id starts light', () => {
    vi.stubEnv('HEAVY_CALL_STICKY', 'on');
    vi.stubEnv('LAUGH_ALONG', 'on');
    const grief = liveCall({ earlier: [LOSS, ...FRAGMENTS], said: LAUGHING, clips: 1 });
    expect(grief.played).not.toContain('[laughter]');
    grief.end();
    const next = liveCall({
      earlier: ['Hey Ferni.'],
      said: LAUGHING,
      clips: 1,
      sessionId: grief.sessionId,
    });
    next.end();
    expect(next.played).toEqual(['[laughter]']);
  });
});

describe('the spoken (TTS) backchannel path, no clips', () => {
  it('flag on: a hard moment 7 fragments back still asks for an empathetic phrase', () => {
    const emotional = (flag: 'on' | 'off'): boolean[] => {
      vi.stubEnv('HEAVY_CALL_STICKY', flag);
      const sessionId = `sticky-tts-${flag}`;
      const ask = vi.spyOn(getLiveBackchannelingService(sessionId), 'shouldEmitLiveBackchannel');
      const session: CallSession = { history: { items: [] } };
      const bc = initializeLiveBackchanneling(sessionId, 'ferni', session as never, () => false);
      for (const line of [LOSS, ...FRAGMENTS]) {
        bc.onNewTurn();
        bc.updateState({ partialTranscript: line });
        session.history.items.push({ type: 'message', role: 'user', textContent: line });
      }
      bc.onNewTurn();
      for (let t = 0; t < 400; t++) {
        vi.advanceTimersByTime(10);
        bc.processAudioFrame(frame(t < 300, t));
      }
      bc.cleanup();
      return ask.mock.calls.map(([ctx]) => ctx.isEmotionalMoment === true);
    };
    const off = emotional('off');
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((e) => !e)).toBe(true);
    const on = emotional('on');
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((e) => e)).toBe(true);
  });
});

describe('VOICED_PRESENCE reaction variants', () => {
  const direct = { play: () => true, stop: () => {} };
  /** The take `vary` plays for a soft "Mm-hmm" on this call, the happy one when allowed. */
  function variantFor(session: CallSession, env: Record<string, string>): string[] {
    const voiced = startVoicedPresence({
      session: session as never,
      direct,
      mixerBusy: () => false,
      getClip: () => new Int16Array(2400).buffer,
      personaId: () => 'ferni',
      env: { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'off', ...env },
      rng: () => 0.6, // the happy "Mmhm!" in ['Mm-hmm', ...VOICED_TAKES.mmhm]
    });
    if (!voiced) throw new Error('VOICED_PRESENCE did not start');
    const played: string[] = [];
    voiced.vary((text) => (played.push(text), true))('Mm-hmm');
    voiced.close();
    return played;
  }
  it('flag off: a soft "Mm-hmm" after the loss can turn into the happy take (main)', () => {
    expect(variantFor(committed([LOSS, ...FRAGMENTS]), {})).toEqual([HAPPY]);
  });

  it('flag on: the plain "Mm-hmm" after a hard moment; a light call still varies', () => {
    const on = { HEAVY_CALL_STICKY: 'on' };
    expect(variantFor(committed([LOSS, ...FRAGMENTS]), on)).toEqual(['Mm-hmm']);
    expect(variantFor(committed(['Hey Ferni.', ...FRAGMENTS]), on)).toEqual([HAPPY]);
  });
});

describe('heavyCallSticky', () => {
  it('reads the whole call, only with the flag on', () => {
    const session = committed([LOSS, ...FRAGMENTS]);
    expect(heavyCallSticky(session, {})).toBe(false);
    expect(heavyCallSticky(session, { HEAVY_CALL_STICKY: 'on' })).toBe(true);
    expect(heavyCallSticky({ history: { items: [] } }, { HEAVY_CALL_STICKY: 'on' })).toBe(false);
  });
});
