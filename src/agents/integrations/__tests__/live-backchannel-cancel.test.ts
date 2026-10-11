/**
 * With REACTION_SIDETRACK=direct a backchannel can be taken back: when the
 * caller carries on in the pause we reacted to, the integration asks the clip
 * player to drop the clip. Each clip also carries the pause onset, so the
 * CLIP_WIRE log can report pause-to-wire.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLiveBackchanneling } from '../live-backchanneling-integration.js';

const RATE = 16000;
const FRAME = RATE / 100; // 10 ms

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

function setup(cancelClip?: () => boolean) {
  vi.stubEnv('BACKCHANNELS', 'on');
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: Array<{ text: string; pauseStartedAt?: number; at: number }> = [];
  const bc = initializeLiveBackchanneling(
    `cancel-${Math.random()}-${Date.now()}`,
    'ferni',
    {} as never,
    () => false,
    {
      playClip: (text, opts) => {
        played.push({ text, pauseStartedAt: opts?.pauseStartedAt, at: Date.now() });
        return true;
      },
      cancelClip,
    }
  );
  bc.onNewTurn();
  let t = 0;
  const run = (loud: boolean, ms: number): void => {
    for (let i = 0; i < ms / 10; i++, t++) {
      vi.advanceTimersByTime(10);
      bc.processAudioFrame(frame(loud, t));
    }
  };
  return { played, run };
}

describe('live backchannels with a direct clip track', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('passes the pause onset with the clip', () => {
    const { played, run } = setup();
    run(true, 3000);
    const silentFrom = Date.now();
    run(false, 350);
    expect(played).toHaveLength(1);
    // The detector confirms a pause a few frames in; the clip decides at 220 ms.
    expect(played[0]!.pauseStartedAt).toBeGreaterThanOrEqual(silentFrom);
    expect(played[0]!.pauseStartedAt).toBeLessThanOrEqual(silentFrom + 80);
    expect(played[0]!.at - played[0]!.pauseStartedAt!).toBeGreaterThanOrEqual(220);
  });

  it('takes the clip back when the caller carries on in the same pause', () => {
    const cancelClip = vi.fn(() => true);
    const { played, run } = setup(cancelClip);
    run(true, 3000);
    run(false, 320); // the clip plays ~220 ms after the pause is confirmed
    expect(played).toHaveLength(1);
    expect(cancelClip).not.toHaveBeenCalled();
    run(true, 100); // ...and they talk on
    expect(cancelClip).toHaveBeenCalledTimes(1);
    run(true, 2000); // once per clip, not every frame of speech
    expect(cancelClip).toHaveBeenCalledTimes(1);
  });

  it('does not take anything back when no clip played in the pause', () => {
    const cancelClip = vi.fn(() => true);
    const { played, run } = setup(cancelClip);
    run(true, 1500); // too short a turn for a backchannel
    run(false, 300);
    run(true, 500);
    expect(played).toHaveLength(0);
    expect(cancelClip).not.toHaveBeenCalled();
  });
});
