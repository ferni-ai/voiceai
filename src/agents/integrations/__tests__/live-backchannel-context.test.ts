import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';
import { pickContextualBackchannel } from '../backchannel-context.js';

vi.mock('../backchannel-context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../backchannel-context.js')>();
  return { ...actual, pickContextualBackchannel: vi.fn(actual.pickContextualBackchannel) };
});

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

let sessions = 0;

/** 3 s of speech then a breath pause, with `transcript` as the words so far. */
function oneClip(transcript: string, cached: (text: string) => boolean = () => true): string[] {
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: string[] = [];
  const bc = initializeLiveBackchanneling(`ctx-${++sessions}`, 'ferni', {} as never, () => false, {
    playClip: (text) => cached(text) && (played.push(text), true),
  });
  bc.onNewTurn();
  bc.updateState({ partialTranscript: transcript });
  for (let t = 0; t < 400; t++) {
    vi.advanceTimersByTime(10);
    bc.processAudioFrame(frame(t < 300, t));
  }
  bc.cleanup();
  return played;
}

const BAD_NEWS = 'so I missed my flight this morning and';
/** Hard news (isHeavyMoment): soft "mm"s only, no reaction (presence-heavy.ts callIsGrave). */
const GRAVE = 'so my dad passed away last week and';

describe('live backchannels that fit what the caller says', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(pickContextualBackchannel).mockClear();
  });

  it('reacts to bad news with "Oh no"', () => {
    expect(oneClip(BAD_NEWS)).toEqual(['Oh no']);
  });

  it('on hard news, only a soft "mm", never "Oh no" or a neutral "Yeah"', () => {
    expect(oneClip(GRAVE)).toEqual(['Mm']);
    expect(pickContextualBackchannel).not.toHaveBeenCalled();
  });

  it('falls back to the neutral pick when the fitting clip is not cached', () => {
    expect(oneClip(BAD_NEWS, (text) => text !== 'Oh no')).toEqual(['Mm-hmm']);
  });

  it('falls back to the neutral pick when nothing fits', () => {
    expect(oneClip('we went to the store for milk and')).toEqual(['Mm-hmm']);
    expect(pickContextualBackchannel).toHaveBeenCalledTimes(1);
  });
});
