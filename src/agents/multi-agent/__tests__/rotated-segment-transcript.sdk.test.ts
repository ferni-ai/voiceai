/**
 * An interrupted reply is committed with its own text, not the previous reply's
 * (ROTATED_SEGMENT_FIX, patches/@livekit__agents@1.9.3.patch).
 *
 * livekit/agents-js#2566: when a reply's audio finishes before its text stream
 * closes (a barge-in is the usual way), the late text flush ends the next,
 * still-empty transcript segment. The next reply then queues that segment as if
 * a playback finish were still owed to it. Nothing ever settles it, so from then
 * on every playback finish settles the segment queued a turn earlier, and each
 * interrupted reply goes into the chat context with the previous reply's text.
 * The model reads that back as something it said.
 *
 * The hunk is a port of the unmerged upstream fix, livekit/agents-js#2655: queue
 * a rotated segment only when it carried audio and its finish has not arrived.
 * These are that PR's synchronizer tests, run against the installed SDK.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, describe, expect, it } from 'vitest';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const load = <T>(file: string): Promise<T> => import(pathToFileURL(join(agentsDist, file)).href);

interface PlaybackFinished {
  playbackPosition: number;
  interrupted: boolean;
  synchronizedTranscript?: string;
}
interface SyncAudio {
  captureFrame(frame: AudioFrame): Promise<void>;
  onPlaybackStarted(at: number): void;
  flush(): void;
  waitForPlayout(): Promise<PlaybackFinished>;
}
interface SyncText {
  captureText(text: string): Promise<void>;
  flush(): Promise<void> | void;
}
interface Synchronizer {
  audioOutput: SyncAudio;
  textOutput: SyncText;
  _pendingRotatedSegments: unknown[];
  barrier(): Promise<void>;
  close(): Promise<void>;
}
interface Downstream {
  onPlaybackFinished(ev: { playbackPosition: number; interrupted: boolean }): void;
}

async function setup() {
  const { initializeLogger } = await load<{ initializeLogger: (o: object) => void }>('log.js');
  initializeLogger({ pretty: false, level: 'silent' });
  const io = await load<{
    AudioOutput: new (sampleRate: number) => Downstream;
    TextOutput: new () => object;
  }>('voice/io.js');
  const { TranscriptionSynchronizer } = await load<{
    TranscriptionSynchronizer: new (audio: unknown, text: unknown) => Synchronizer;
  }>('voice/transcription/synchronizer.js');

  class Audio extends io.AudioOutput {
    constructor() {
      super(8000);
    }
    clearBuffer(): void {}
  }
  class Text extends io.TextOutput {
    async captureText(): Promise<void> {}
    flush(): void {}
  }
  const downstream = new Audio();
  const synchronizer = new TranscriptionSynchronizer(downstream, new Text());
  return { downstream, synchronizer };
}

const frame = () => new AudioFrame(new Int16Array(160), 8000, 1, 160);

/** A reply cut off by the caller, whose finish lands before its text flush. */
async function interruptWithLateTextFlush(sync: Synchronizer, downstream: Downstream) {
  await sync.textOutput.captureText('turn-one');
  await sync.audioOutput.captureFrame(frame());
  sync.audioOutput.onPlaybackStarted(Date.now());
  sync.audioOutput.flush();
  downstream.onPlaybackFinished({ playbackPosition: 1, interrupted: true });
  await sync.barrier();
  await sync.textOutput.flush();
  await sync.barrier();
}

async function playTurn(
  sync: Synchronizer,
  downstream: Downstream,
  text: string,
  interrupted: boolean
) {
  await sync.textOutput.captureText(text);
  await sync.barrier();
  await sync.audioOutput.captureFrame(frame());
  sync.audioOutput.onPlaybackStarted(Date.now());
  await sync.textOutput.flush();
  sync.audioOutput.flush();
  downstream.onPlaybackFinished({ playbackPosition: 1, interrupted });
  const ev = await sync.audioOutput.waitForPlayout();
  await sync.barrier();
  return ev;
}

const saved = process.env.ROTATED_SEGMENT_FIX;
afterEach(() => {
  if (saved === undefined) delete process.env.ROTATED_SEGMENT_FIX;
  else process.env.ROTATED_SEGMENT_FIX = saved;
});

describe('transcript segment rotated after a late text flush (patched)', () => {
  it('on: does not queue a rotated segment that carried no audio', async () => {
    process.env.ROTATED_SEGMENT_FIX = 'on';
    const { downstream, synchronizer } = await setup();
    await interruptWithLateTextFlush(synchronizer, downstream);
    await synchronizer.textOutput.captureText('turn-two-text');
    await synchronizer.barrier();
    expect(synchronizer._pendingRotatedSegments).toHaveLength(0);
    await synchronizer.close();
  });

  it('on: each later reply reports its own text', async () => {
    process.env.ROTATED_SEGMENT_FIX = 'on';
    const { downstream, synchronizer } = await setup();
    await interruptWithLateTextFlush(synchronizer, downstream);
    const second = await playTurn(synchronizer, downstream, 'turn-two-text', false);
    const third = await playTurn(synchronizer, downstream, 'turn-three-text', true);
    expect(second.synchronizedTranscript).toBe('turn-two-text');
    expect(third.synchronizedTranscript ?? '').not.toContain('turn-two');
    await synchronizer.close();
  });

  it('off (the default): stock 1.9.3 runs one reply behind', async () => {
    delete process.env.ROTATED_SEGMENT_FIX;
    const { downstream, synchronizer } = await setup();
    await interruptWithLateTextFlush(synchronizer, downstream);
    await playTurn(synchronizer, downstream, 'turn-two-text', false);
    const third = await playTurn(synchronizer, downstream, 'turn-three-text', true);
    // When this fails, upstream has fixed #2566: drop the hunk and this flag.
    expect(third.synchronizedTranscript).toContain('turn-two');
    await synchronizer.close();
  });
});
