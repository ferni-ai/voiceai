import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';
import { setFerniEnergy } from '../../../speech/tts-gateway/director/ferni-energy.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

/** The clip played at the first breath pause of a long turn. */
function firstClip(sessionId: string): string | undefined {
  const played: string[] = [];
  const bc = initializeLiveBackchanneling(sessionId, 'ferni', {} as never, () => false, {
    playClip: (text) => (played.push(text), true),
  });
  bc.onNewTurn();
  for (let t = 0; t < 335; t++) {
    vi.advanceTimersByTime(10);
    bc.processAudioFrame(frame(t < 300, t)); // 3 s of speech, then a breath pause
  }
  return played[0];
}

describe("backchannels follow Ferni's energy (FERNI_STATE, ferni-energy.ts)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('a worn-out Ferni says a soft "mhm" where he would otherwise say "yeah"', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    // 0.5 plays (under the 0.6 odds) and picks the middle clip of the pool.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(firstClip(`bc-steady-${Date.now()}`)).toBe('Yeah');
    const tired = `bc-low-${Date.now()}`;
    setFerniEnergy(tired, 'low');
    expect(firstClip(tired)).toBe('Mhm');
    const lively = `bc-high-${Date.now()}`;
    setFerniEnergy(lively, 'high');
    expect(firstClip(lively)).toBe('Yeah');
  });
});
