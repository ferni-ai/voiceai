/**
 * The mid-turn laugh-along clip (LAUGH_ALONG, live on prod) and the "Ha"
 * reaction never play on a heavy moment, however the caller laughed. Before,
 * only the voice's emotion held them back, so "kms lol" or "haha anyway"
 * right after "my dad died last week" got a laugh. An unflagged harm fix.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { heavyMoment, shouldLaughAlong } from '../backchannel-policy.js';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

let sessions = 0;

/**
 * Each earlier turn, then 3 s of `transcript` and a breath pause: the clips
 * played. `revisions` are interim partials of the last turn before `transcript`.
 */
function clipsFor(transcript: string, earlier: string[] = [], revisions: string[] = []): string[] {
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: string[] = [];
  const bc = initializeLiveBackchanneling(
    `heavy-${++sessions}`,
    'ferni',
    {} as never,
    () => false,
    {
      playClip: (text) => (played.push(text), true),
    }
  );
  for (const turn of earlier) {
    bc.onNewTurn();
    bc.updateState({ partialTranscript: turn });
  }
  bc.onNewTurn();
  for (const partial of [...revisions, transcript]) bc.updateState({ partialTranscript: partial });
  for (let t = 0; t < 400; t++) {
    vi.advanceTimersByTime(10);
    bc.processAudioFrame(frame(t < 300, t));
  }
  bc.cleanup();
  return played;
}

beforeEach(() => {
  vi.stubEnv('LAUGH_ALONG', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('the laugh-along clip on a heavy moment', () => {
  it('still laughs along when the caller laughs at something light', () => {
    expect(clipsFor('hahaha and then the cat just sat on it')).toEqual(['[laughter]']);
  });

  it('never laughs at hard words, however they laughed', () => {
    for (const t of ['kms lol', 'lol my grandma passed', 'we lost the baby haha'])
      expect(clipsFor(t), t).not.toContain('[laughter]');
  });

  it('never laughs at "haha anyway" right after grief', () => {
    expect(clipsFor('haha anyway', ['my dad died last week'])).not.toContain('[laughter]');
  });

  it("remembers the grief when the next turn's partial is revised", () => {
    const revised = ['haha anyway', 'Haha anyway'];
    expect(clipsFor('Haha, anyway', ['my dad died last week'], revised)).not.toContain(
      '[laughter]'
    );
  });

  it('gives no "Ha" either, with the reactions that fit on', () => {
    vi.stubEnv('LAUGH_ALONG', 'off');
    expect(clipsFor('that is so funny lol')).toEqual(['Ha']);
    expect(clipsFor('kms lol that is so funny')).not.toContain('Ha');
  });
});

describe('shouldLaughAlong', () => {
  const at = { emotional: false, agentSpeaking: false, turnCount: 3, lastLaughTurn: null };

  it('reads the earlier turn it is given', () => {
    expect(shouldLaughAlong({ ...at, partialTranscript: 'haha anyway' })).toBe(true);
    const callerTurns = ['my dad died last week', 'haha anyway'];
    expect(shouldLaughAlong({ ...at, partialTranscript: 'haha anyway', callerTurns })).toBe(false);
    expect(heavyMoment({ partialTranscript: 'kms lol' })).toBe(true);
  });
});
