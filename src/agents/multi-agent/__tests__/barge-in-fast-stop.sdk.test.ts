/**
 * BARGE_IN_FAST_STOP, on LiveKit's real (patched) room output with the real
 * resume buffer in front, as on a live call with NEVER_SILENT=on.
 *
 * Dev 2026-10-22 (realistic-walk-away): the barge-in model paused Ferni 210 ms
 * after the caller's "Oh wait, sorry", yet he kept talking ~0.8 s more. Since
 * @livekit/agents 1.8 the room output clears its queued audio only when the
 * next frame arrives while paused (1.6 cleared it in pause()). The resume
 * buffer holds every frame while paused, so none arrives: the whole queue
 * plays out, and a resume then replays that audio a second time.
 *
 * Only the rtc AudioSource is a stand-in (it needs a native track); it keeps
 * rtc-node 1.1.0's bookkeeping: clearQueue() also zeroes queuedDuration.
 */
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { initializeLogger, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResumeBufferOutput } from '../resume-buffer.js';

const sdkDist = join(dirname(createRequire(import.meta.url).resolve('@livekit/agents')), 'voice');
const { ParticipantAudioOutput } = (await import(join(sdkDist, 'room_io/_output.js'))) as {
  ParticipantAudioOutput: new (room: unknown, opts: Record<string, unknown>) => RoomOutput;
};
interface RoomOutput extends voice.AudioOutput {
  audioSource: FakeRtcSource;
  startedFuture: { resolve: () => void };
  sourceDiscardedDuration: number;
}

const SAMPLE_RATE = 24_000;
const FRAME_MS = 20;
const QUEUE_MS = 500;
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

/** rtc-node AudioSource: same queuedDuration math, a bounded queue played in real time. */
class FakeRtcSource {
  currentQueueSize = 0;
  lastCapture = 0;
  /** Each frame's play interval; a clear cuts the ones not yet played. */
  private played: Array<[number, number]> = [];
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
    const ms = (frame.samplesPerChannel / frame.sampleRate) * 1000;
    const elapsed = this.lastCapture === 0 ? 0 : now - this.lastCapture;
    this.currentQueueSize = Math.max(this.currentQueueSize - elapsed, 0) + ms;
    this.lastCapture = now;
    const start = Math.max(now, this.audibleUntil);
    this.played.push([start, start + ms]);
    while (this.queuedDuration > QUEUE_MS) await sleep(5);
  }
  async waitForPlayout(): Promise<void> {
    while (Date.now() < this.audibleUntil) await sleep(5);
  }
}

const frame = () => {
  const n = (SAMPLE_RATE * FRAME_MS) / 1000;
  return new AudioFrame(new Int16Array(n), SAMPLE_RATE, 1, n);
};

function roomOutput(): RoomOutput {
  const out = new ParticipantAudioOutput({}, { sampleRate: SAMPLE_RATE, numChannels: 1 });
  out.audioSource = new FakeRtcSource();
  out.startedFuture.resolve();
  return out;
}

/** A reply of `replyMs` streamed into `out` the way LiveKit's forwarder does (one frame at a time). */
function speak(out: voice.AudioOutput, replyMs: number) {
  let cut = false;
  const done = (async () => {
    for (let ms = 0; ms < replyMs && !cut; ms += FRAME_MS) await out.captureFrame(frame());
  })();
  /** The reply was interrupted: its forwarder stops and the output is let go. */
  const interrupt = async () => {
    cut = true;
    out.clearBuffer();
    out.resume();
    await done;
  };
  return { done, interrupt };
}

beforeAll(() => {
  initializeLogger({ pretty: false, level: 'silent' });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Ferni speaking with a full queue, then a pause for the caller: how long is he still heard? */
async function pauseMidReply(flag: 'on' | 'off') {
  vi.stubEnv('BARGE_IN_FAST_STOP', flag);
  const room = roomOutput();
  const logs: Array<Record<string, unknown>> = [];
  const out = new ResumeBufferOutput(room, {}, (f) => logs.push(f));
  const reply = speak(out, 2000);
  await sleep(800); // the queue is full: QUEUE_MS of audio waits to be played
  const queuedAtPause = room.audioSource.queuedDuration;
  const pausedAt = Date.now();
  out.pause();
  await sleep(50);
  const heardAfterPauseMs = room.audioSource.audibleUntil - pausedAt;
  return { room, out, reply, queuedAtPause, heardAfterPauseMs, logs };
}

describe('BARGE_IN_FAST_STOP', () => {
  it('off: Ferni plays on for the whole queued audio after a barge-in pause (today)', async () => {
    const { queuedAtPause, heardAfterPauseMs, reply } = await pauseMidReply('off');
    expect(queuedAtPause).toBeGreaterThan(QUEUE_MS - 60);
    expect(heardAfterPauseMs).toBeGreaterThan(QUEUE_MS - 100);
    await reply.interrupt();
  });

  it('on: Ferni stops at the pause', async () => {
    const { queuedAtPause, heardAfterPauseMs, reply } = await pauseMidReply('on');
    expect(queuedAtPause).toBeGreaterThan(QUEUE_MS - 60);
    expect(heardAfterPauseMs).toBeLessThanOrEqual(FRAME_MS);
    await reply.interrupt();
  });

  it('on: a pause that resumes (a backchannel) loses nothing and repeats nothing', async () => {
    const { room, out, reply, logs } = await pauseMidReply('on');
    await sleep(300); // "mm-hm": the reply resumes
    out.resume();
    await reply.done;
    await room.audioSource.waitForPlayout();
    // the resume buffer replays exactly what the clear took
    const paused = logs.find((l) => l.event === 'paused')?.replayMs as number;
    expect(paused).toBeGreaterThan(QUEUE_MS - 60);
    expect(Math.abs(room.audioSource.heardMs() - 2000)).toBeLessThanOrEqual(2 * FRAME_MS);
  });

  it('off: the same resume repeats the audio that played on during the pause', async () => {
    const { room, out, reply } = await pauseMidReply('off');
    await sleep(300);
    out.resume();
    await reply.done;
    await room.audioSource.waitForPlayout();
    expect(room.audioSource.heardMs()).toBeGreaterThan(2000 + QUEUE_MS - 100);
  });

  it('on: the cleared audio is counted once as unplayed, not again by the paused captureFrame', async () => {
    vi.stubEnv('BARGE_IN_FAST_STOP', 'on');
    const room = roomOutput();
    const reply = speak(room, 1500); // no resume buffer: a frame does reach the paused output
    await sleep(700);
    const queued = room.audioSource.queuedDuration;
    room.pause();
    expect(room.sourceDiscardedDuration * 1000).toBeCloseTo(queued, -1);
    await sleep(100); // the next frame waits in the paused output's clear loop
    expect(room.sourceDiscardedDuration * 1000).toBeCloseTo(queued, -1);
    await reply.interrupt();
  });
});
