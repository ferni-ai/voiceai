import { afterEach, describe, expect, it } from 'vitest';
import { AudioSource } from '@livekit/rtc-node';
import {
  CANCEL_WINDOW_MS,
  clipFrames,
  DIRECT_CAPACITY_MS,
  DIRECT_TRACK_NAME,
  IDLE_QUEUE_MS,
  DirectClipTrack,
  reactionSidetrackDirect,
  type ClipWire,
} from '../direct-clip-track.js';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** 24 kHz clip PCM of `ms` at a constant level. */
const clip = (ms: number, level = 8000): ArrayBuffer =>
  new Int16Array((24000 * ms) / 1000).fill(level).buffer;

const open: DirectClipTrack[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((t) => t.close()));
});

function track(idleMs = IDLE_QUEUE_MS): { t: DirectClipTrack; wires: ClipWire[] } {
  const wires: ClipWire[] = [];
  const source = new AudioSource(48000, 1, DIRECT_CAPACITY_MS);
  const t = new DirectClipTrack((w) => wires.push(w), source, idleMs);
  open.push(t);
  t.start();
  return { t, wires };
}

/** Median play()-to-wire over three clips, after the queue reaches steady state. */
async function clipToWireMs(idleMs: number): Promise<number> {
  const { t, wires } = track(idleMs);
  await sleep(idleMs + 400); // the idle queue as full as it gets
  for (let i = 0; i < 3; i++) {
    expect(t.play(clip(100), 1, 'Mm')).toBe(true);
    await sleep(idleMs + 300);
  }
  expect(wires).toHaveLength(3);
  const lags = wires.map((w) => w.playToWireMs).sort((a, b) => a - b);
  return lags[1]!;
}

describe('REACTION_SIDETRACK flag', () => {
  it('is off unless REACTION_SIDETRACK=direct', () => {
    expect(reactionSidetrackDirect({})).toBe(false);
    expect(reactionSidetrackDirect({ REACTION_SIDETRACK: 'on' })).toBe(false);
    expect(reactionSidetrackDirect({ REACTION_SIDETRACK: 'direct' })).toBe(true);
  });

  it('names the track so the eval harness counts it as a side track, not the reply voice', () => {
    expect(DIRECT_TRACK_NAME).toMatch(/background/);
  });
});

describe('clipFrames', () => {
  it('turns 24 kHz clip PCM into 10 ms frames at 48 kHz of the same length', () => {
    const frames = clipFrames(clip(500));
    expect(frames.every((f) => f.length === 480)).toBe(true);
    expect(Math.abs(frames.length - 50)).toBeLessThanOrEqual(1);
  });

  it('applies the volume', () => {
    const loud = clipFrames(clip(100, 8000), 1);
    const soft = clipFrames(clip(100, 8000), 0.5);
    const peak = (fs: Int16Array[]) => Math.max(...fs.flatMap((f) => Array.from(f, Math.abs)));
    expect(peak(loud)).toBeGreaterThan(7000);
    expect(Math.abs(peak(soft) - peak(loud) / 2)).toBeLessThan(200);
  });
});

describe('clip to wire (real rtc-node AudioSource)', () => {
  it('a clip reaches the wire in well under 150 ms (mixer path: 640-688 ms)', async () => {
    expect(await clipToWireMs(IDLE_QUEUE_MS)).toBeLessThan(150);
  }, 10_000);

  it('the idle queue is what sets it: topped up to 400 ms, a clip waits ~400 ms', async () => {
    expect(await clipToWireMs(400)).toBeGreaterThan(350);
  }, 10_000);

  it('reports pause onset to wire when the caller passes the pause start', async () => {
    const { t, wires } = track();
    await sleep(200);
    expect(t.lastWireMs).toBeNull();
    const pauseStartedAt = Date.now() - 220;
    t.play(clip(100), 1, 'Mm-hmm', pauseStartedAt);
    await sleep(300);
    expect(t.lastWireMs).toBe(wires[0]!.playToWireMs);
    expect(wires[0]!.label).toBe('Mm-hmm');
    expect(wires[0]!.pauseToWireMs).toBeGreaterThanOrEqual(220);
    expect(wires[0]!.pauseToWireMs).toBeLessThan(220 + 150);
  }, 10_000);
});

describe('an event-loop stall in the middle of a clip', () => {
  it('plays out of the queue instead of leaving a gap', async () => {
    const { t } = track();
    await sleep(200);
    t.play(clip(600), 1, 'Mm-hmm');
    await sleep(60); // the clip goes into the source as fast as it takes it
    const before = (t as unknown as { source: AudioSource }).source.queuedDuration;
    const until = Date.now() + 200;
    while (Date.now() < until) {
      // block the event loop, as a busy agent worker does (dev lag ~470 ms p50)
    }
    const after = (t as unknown as { source: AudioSource }).source.queuedDuration;
    expect(before).toBeGreaterThan(300);
    expect(after).toBeGreaterThan(50); // audio still queued: no underrun mid-clip
    expect(t.playing).toBe(true);
  }, 10_000);
});

describe('one clip at a time, and taking one back', () => {
  it('refuses a second clip while the first still plays, then accepts one', async () => {
    const { t } = track();
    expect(t.play(clip(300), 1, 'a')).toBe(true);
    expect(t.playing).toBe(true);
    expect(t.play(clip(300), 1, 'b')).toBe(false);
    await sleep(500);
    expect(t.playing).toBe(false);
    expect(t.play(clip(100), 1, 'c')).toBe(true);
  }, 10_000);

  it('cuts a fresh clip with a short fade', () => {
    const t = new DirectClipTrack(); // not started: nothing sent yet
    open.push(t);
    t.play(clip(500), 1, 'Mm-hmm');
    expect(t.playing).toBe(true);
    expect(t.cancelIfFresh()).toBe(true);
    const left = (t as unknown as { frames: Int16Array[] }).frames;
    expect(left).toHaveLength(2);
    expect(Math.abs(left[1]![479]!)).toBeLessThan(Math.abs(left[0]![0]!));
    expect(Math.abs(left[1]![479]!)).toBeLessThan(200);
  });

  it('keeps a clip that has been playing longer than the window', async () => {
    const t = new DirectClipTrack();
    open.push(t);
    t.play(clip(1000), 1, 'Mm-hmm');
    await sleep(CANCEL_WINDOW_MS + 50);
    expect(t.cancelIfFresh()).toBe(false);
    expect((t as unknown as { frames: Int16Array[] }).frames.length).toBeGreaterThan(50);
  });

  it('cuts from where playout is: the queued part of the clip is dropped', async () => {
    const { t } = track();
    await sleep(200);
    t.play(clip(600), 1, 'Mm-hmm');
    await sleep(100);
    const source = (t as unknown as { source: AudioSource }).source;
    expect(source.queuedDuration).toBeGreaterThan(300);
    expect(t.cancelIfFresh()).toBe(true);
    expect(source.queuedDuration).toBeLessThan(30);
    await sleep(100);
    expect(t.playing).toBe(false);
  }, 10_000);

  it('has nothing to drop when no clip is playing', () => {
    const t = new DirectClipTrack();
    open.push(t);
    expect(t.cancelIfFresh()).toBe(false);
  });

  it('plays nothing after close, and close runs its cleanups once', async () => {
    const { t } = track();
    let cleaned = 0;
    t.onClose(() => cleaned++);
    await t.close();
    await t.close();
    expect(cleaned).toBe(1);
    expect(t.play(clip(100), 1, 'Mm')).toBe(false);
  });
});
