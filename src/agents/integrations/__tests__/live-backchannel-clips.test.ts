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

describe('live backchanneling with clips', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('plays a clip at a breath pause in a long turn, keeps the interval, and varies the clip', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const played: string[] = [];
    const bc = initializeLiveBackchanneling(
      `clip-test-${Date.now()}`,
      'ferni',
      {} as never,
      () => false,
      {
        playClip: (text) => {
          played.push(text);
          return true;
        },
      }
    );
    bc.onNewTurn(); // one exchange done

    let t = 0;
    const run = (loud: boolean, ms: number): void => {
      for (let i = 0; i < ms / 10; i++, t++) {
        vi.advanceTimersByTime(10);
        bc.processAudioFrame(frame(loud, t));
      }
    };
    run(true, 3000); // 3 s of speech
    run(false, 350); // a breath pause
    expect(played).toHaveLength(1);

    run(true, 1500); // talks on; the next pause comes too soon after the last clip
    run(false, 350);
    expect(played).toHaveLength(1);

    run(true, 5000);
    run(false, 350);
    expect(played).toHaveLength(2);
    expect(played[1]).not.toBe(played[0]);
  });
});
