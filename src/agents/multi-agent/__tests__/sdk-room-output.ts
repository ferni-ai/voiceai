/**
 * LiveKit's real (patched) room output for *.sdk tests, with only the rtc AudioSource stood in
 * (it needs a native track). The stand-in keeps rtc-node 1.1.0's bookkeeping: clearQueue()
 * also zeroes queuedDuration.
 */
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';

export const sdkDist = join(
  dirname(createRequire(import.meta.url).resolve('@livekit/agents')),
  'voice'
);
const { ParticipantAudioOutput } = (await import(join(sdkDist, 'room_io/_output.js'))) as {
  ParticipantAudioOutput: new (room: unknown, opts: Record<string, unknown>) => RoomOutput;
};

export interface RoomOutput extends voice.AudioOutput {
  audioSource: FakeRtcSource;
  startedFuture: { resolve: () => void };
  sourceDiscardedDuration: number;
}

export const SAMPLE_RATE = 24_000;
export const QUEUE_MS = 500;
export const sleep = async (ms: number): Promise<void> =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

/** rtc-node AudioSource: same queuedDuration math, a bounded queue played in real time. */
export class FakeRtcSource {
  currentQueueSize = 0;
  lastCapture = 0;
  /** Each frame's play interval; a clear cuts the ones not yet played. */
  private played: Array<[number, number]> = [];
  /** Frames handed to the source so far. */
  framesSent = 0;
  get queuedDuration(): number {
    return Math.max(this.currentQueueSize - Date.now() + this.lastCapture, 0);
  }
  /** When the caller stops hearing audio, as of now. */
  get audibleUntil(): number {
    return this.played.length ? this.played[this.played.length - 1][1] : 0;
  }
  heardMs(): number {
    const now = Date.now();
    return this.played.reduce((a, [s, e]) => a + Math.max(0, Math.min(e, now) - s), 0);
  }
  clearQueue(): void {
    const now = Date.now();
    this.currentQueueSize = 0; // rtc's releaseWaiter
    this.lastCapture = 0;
    this.played = this.played
      .filter(([s]) => s < now)
      .map(([s, e]): [number, number] => [s, Math.min(e, now)]);
  }
  /** Counted when called, as rtc does, then held until the queue has room. */
  async captureFrame(frame: AudioFrame): Promise<void> {
    const now = Date.now();
    this.framesSent += 1;
    const ms = (frame.samplesPerChannel / frame.sampleRate) * 1000;
    const elapsed = this.lastCapture === 0 ? 0 : now - this.lastCapture;
    this.currentQueueSize = Math.max(this.currentQueueSize - elapsed, 0) + ms;
    this.lastCapture = now;
    const start = Math.max(now, this.audibleUntil);
    this.played.push([start, start + ms]);
    while (this.queuedDuration > QUEUE_MS) await sleep(2);
  }
  async waitForPlayout(): Promise<void> {
    while (Date.now() < this.audibleUntil) await sleep(2);
  }
}

export const frame = (ms: number): AudioFrame => {
  const n = (SAMPLE_RATE * ms) / 1000;
  return new AudioFrame(new Int16Array(n), SAMPLE_RATE, 1, n);
};

export function roomOutput(): RoomOutput {
  const out = new ParticipantAudioOutput({}, { sampleRate: SAMPLE_RATE, numChannels: 1 });
  out.audioSource = new FakeRtcSource();
  out.startedFuture.resolve();
  return out;
}
