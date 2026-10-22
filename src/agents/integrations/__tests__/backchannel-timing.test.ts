/**
 * BACKCHANNEL_TIMING: a live "mm-hm" waits longer unless the caller just ended
 * a sentence, never repeats a take inside 60 s or lets one token run the call,
 * and is still not followed by a turn-opening "Mm". Driven through the real live
 * backchanneling and turn-opening modules on fake timers.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';
import { attachTurnOpeningSound } from '../turn-opening-sound.js';
import {
  backchannelPauseMs,
  backchannelTimingEnabled,
  createBackchannelBag,
  jitterVolume,
} from '../backchannel-timing.js';
import { VOICED_TAKES } from '../../shared/reaction-clips.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms
const MID_PHRASE = 'so I told my sister that I would drive up and';
const PHRASE_END = 'My cat knocked a glass of water onto my keyboard.';

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

let calls = 0;

/** A call's live backchanneling on the audio clock, as prod runs it. */
function call(timing: 'on' | 'off', random: () => number = () => 0) {
  vi.stubEnv('BACKCHANNELS', 'on');
  vi.stubEnv('BACKCHANNEL_AUDIO_CLOCK', 'on');
  vi.stubEnv('BACKCHANNEL_TIMING', timing);
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockImplementation(random);
  const played: Array<{ text: string; at: number; pauseMs: number }> = [];
  let t = 0;
  let pauseFrom = 0;
  const bc = initializeLiveBackchanneling(
    `timing-${timing}-${++calls}`,
    'ferni',
    {} as never,
    () => false,
    {
      playClip: (text) => (
        played.push({ text, at: Date.now(), pauseMs: (t + 1) * 10 - pauseFrom }),
        true
      ),
    }
  );
  bc.onNewTurn();
  const run = (loud: boolean, ms: number): void => {
    if (!loud) pauseFrom = t * 10;
    for (let i = 0; i < ms / 10; i++, t++) {
      vi.advanceTimersByTime(10);
      bc.processAudioFrame(frame(loud, t));
    }
  };
  return { played, run, say: (partial: string) => bc.updateState({ partialTranscript: partial }) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('when a backchannel starts', () => {
  it('reads the flag, default off', () => {
    expect(backchannelTimingEnabled({})).toBe(false);
    expect(backchannelTimingEnabled({ BACKCHANNEL_TIMING: 'off' })).toBe(false);
    expect(backchannelTimingEnabled({ BACKCHANNEL_TIMING: 'on' })).toBe(true);
  });

  it('waits 260 ms after a sentence end and 390 ms when the phrase is still open', () => {
    expect(backchannelPauseMs(PHRASE_END)).toBe(260);
    expect(backchannelPauseMs('Again!')).toBe(260);
    expect(backchannelPauseMs(MID_PHRASE)).toBe(390);
    expect(backchannelPauseMs('it was, um')).toBe(390);
    expect(backchannelPauseMs('')).toBe(390);
  });

  it('a mid-phrase pause of 250 ms gets no clip', () => {
    const c = call('on');
    c.run(true, 3000);
    c.say(MID_PHRASE);
    c.run(false, 250);
    c.run(true, 300); // they carried on, as 40% of these callers did
    expect(c.played).toEqual([]);
  });

  it('a mid-phrase pause that runs on still gets its clip, at 390 ms', () => {
    const c = call('on');
    c.run(true, 3000);
    c.say(MID_PHRASE);
    c.run(false, 600);
    expect(c.played).toHaveLength(1);
    expect(c.played[0]!.pauseMs).toBeGreaterThanOrEqual(390);
    expect(c.played[0]!.pauseMs).toBeLessThanOrEqual(400);
  });

  it('a phrase-final pause gets its clip at 260 ms', () => {
    const c = call('on');
    c.run(true, 3000);
    c.say(PHRASE_END);
    c.run(false, 300);
    expect(c.played).toHaveLength(1);
    expect(c.played[0]!.pauseMs).toBeGreaterThanOrEqual(260);
    expect(c.played[0]!.pauseMs).toBeLessThan(280);
  });

  it('flag off is unchanged: the mid-phrase pause gets a clip at 220 ms', () => {
    const c = call('off');
    c.run(true, 3000);
    c.say(MID_PHRASE);
    c.run(false, 250);
    expect(c.played).toHaveLength(1);
    expect(c.played[0]!.pauseMs).toBeGreaterThanOrEqual(220);
    expect(c.played[0]!.pauseMs).toBeLessThan(240);
  });
});

/** The token a clip text belongs to: a voiced mm-hm take is an "Mm-hmm". */
const tokenOf = (text: string): string =>
  (VOICED_TAKES.mmhm as readonly string[]).includes(text) ? 'Mm-hmm' : text;

/** Twenty backchannels in one call: talk 6 s, pause after a sentence, repeat. */
function twenty(timing: 'on' | 'off') {
  let seed = 7;
  const c = call(timing, () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.5);
  for (let i = 0; i < 200 && c.played.length < 20; i++) {
    c.run(true, 6000);
    c.say(PHRASE_END);
    c.run(false, 500);
  }
  return c.played;
}

function repeatsWithin(played: Array<{ text: string; at: number }>, ms: number): number {
  return played.filter((p, i) =>
    played.slice(0, i).some((q) => q.text === p.text && p.at - q.at < ms)
  ).length;
}

describe('variation across a call', () => {
  it('20 backchannels: no take twice inside 60 s, no token above 40%', () => {
    const played = twenty('on');
    expect(played).toHaveLength(20);
    expect(repeatsWithin(played, 60_000)).toBe(0);
    const counts = new Map<string, number>();
    for (const p of played) counts.set(tokenOf(p.text), (counts.get(tokenOf(p.text)) ?? 0) + 1);
    expect(Math.max(...counts.values()) / played.length).toBeLessThanOrEqual(0.4);
    // the voiced takes are in the draw, not only the five plain clips
    expect(played.some((p) => p.text !== tokenOf(p.text))).toBe(true);
  });

  it('flag off repeats a clip inside 60 s, as prod does today', () => {
    expect(repeatsWithin(twenty('off'), 60_000)).toBeGreaterThan(0);
  });

  it('plays nothing rather than a take heard inside the last minute', () => {
    const bag = createBackchannelBag(() => 0);
    const heard: string[] = [];
    const play = (t: string) => (heard.push(t), true);
    expect(bag.play(null, ['Yeah'], false, play, 0)).toBe('Yeah');
    expect(bag.play(null, ['Yeah'], false, play, 59_000)).toBeNull();
    expect(bag.play(null, ['Yeah'], false, play, 60_000)).toBe('Yeah');
    // a contextual reaction heard 10 s ago falls back to a fresh token
    expect(bag.play('Oh no', ['Mm', 'Right'], false, play, 70_000)).toBe('Oh no');
    expect(bag.play('Oh no', ['Mm', 'Right'], false, play, 80_000)).not.toBe('Oh no');
  });

  it('a token with spare takes is held back while the others rest, never past 40%', () => {
    // Mm-hmm has four takes; Yeah and Right one each, stale for a minute after playing.
    const bag = createBackchannelBag(() => 0.99);
    const heard = [bag.play('Right', [], true, () => true, 0)]; // a contextual "Right" first
    for (let at = 10_000; at <= 70_000; at += 10_000)
      heard.push(bag.play(null, ['Mm-hmm', 'Yeah', 'Right'], true, () => true, at));
    const played = heard.filter((t): t is string => t !== null).map(tokenOf);
    expect(played).toEqual(['Right', 'Mm-hmm', 'Yeah', 'Mm-hmm', 'Right']);
    // at 70 s only Mm-hmm is fresh, and a third would make it 3 of 6
    expect(played.filter((t) => t === 'Mm-hmm').length / played.length).toBeLessThanOrEqual(0.4);
  });

  it('never the same token twice running, even with a fresh take ready', () => {
    const bag = createBackchannelBag(() => 0.99); // keeps the order given
    const tokens = ['Yeah', 'Right', 'Mm', 'Mhm', 'Mm-hmm'];
    const heard = [0, 5, 10, 15, 20, 25].map((s) =>
      bag.play(null, tokens, true, () => true, s * 1000)
    );
    expect(heard.map((t) => (t === null ? null : tokenOf(t)))).toEqual([...tokens, null]);
  });

  it('soft moments draw only the plain clips, never a voiced take', () => {
    const bag = createBackchannelBag(() => 0.99);
    const heard = Array.from({ length: 6 }, (_, i) =>
      bag.play(null, ['Mm-hmm'], false, () => true, i * 61_000)
    );
    expect(new Set(heard)).toEqual(new Set(['Mm-hmm']));
  });

  it('gain jitter stays inside +-2 dB', () => {
    expect(jitterVolume(1, () => 0)).toBeCloseTo(10 ** (-2 / 20), 6);
    expect(jitterVolume(1, () => 1)).toBeCloseTo(10 ** (2 / 20), 6);
    expect(jitterVolume(0.75, () => 0.5)).toBeCloseTo(0.75, 6);
  });
});

describe('inside the grave gate (#2413)', () => {
  it('hard news: only the plain soft clips, never Yeah, Right or a voiced take', () => {
    let seed = 11;
    const c = call('on', () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.5);
    for (let i = 0; i < 40 && c.played.length < 6; i++) {
      c.run(true, 8000);
      c.say('My dad died last week and I keep thinking about him.');
      c.run(false, 300);
    }
    expect(c.played.length).toBeGreaterThanOrEqual(3);
    for (const p of c.played) expect(['Mm', 'Mhm', 'Mm-hmm']).toContain(p.text);
  });
});

describe('one sound per turn edge', () => {
  /** Early-mode opener; a backchannel played `bcBeforeMs` before the turn ended. */
  function edge(timing: 'on' | 'off', bcBeforeMs: number): string[] {
    vi.stubEnv('BACKCHANNEL_TIMING', timing);
    vi.useFakeTimers({ now: 50_000 });
    const session = new EventEmitter();
    const played: string[] = [];
    const lastClipAt = 50_000 - bcBeforeMs;
    attachTurnOpeningSound(
      session,
      { playClip: (t) => (played.push(t), true), lastPlayedAt: () => lastClipAt },
      () => 'It has been a long week, I am exhausted.',
      () => false,
      { waitMs: 120, replyTextSince: () => false, clipMs: () => 400, holdReply: () => {} }
    );
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(200);
    return played;
  }

  // The opener's own check (turn-opening-sound.ts, #2413) holds with the flag either way.
  it('a backchannel 1 s before the turn ended means no opener, flag on or off', () => {
    expect(edge('on', 1000)).toEqual([]);
    expect(edge('off', 1000)).toEqual([]);
  });

  it('one 3 s before still gets its opener', () => {
    expect(edge('on', 3000)).toEqual(['Oof']);
  });
});
