/**
 * TTS latency checkpoints: ttsFirstByte keeps its meaning (first frame of any
 * kind); ttsFirstSpeech marks the first frame that isn't a Stage 2 opening.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it } from 'vitest';

import { setReplyAudioPlan } from '../../../../speech/reply-audio-plan.js';
import { createReplyAudioStage } from '../reply-audio-stage.js';
import { wrapWithTTSCheckpoints, type MarkTurnCheckpoint } from '../tts-checkpoints.js';

const marks: string[] = [];
const mark: MarkTurnCheckpoint = (_sid, _turn, name) => {
  marks.push(name);
};

const SID = 'checkpoints-test';

function speech(n: number): AudioFrame[] {
  return Array.from(
    { length: n },
    () => new AudioFrame(new Int16Array(480).fill(1000), 24000, 1, 480)
  );
}

/** Records which frame index each checkpoint fired on. */
async function run(stream: NodeReadableStream<AudioFrame>, turn: number | undefined = 3) {
  const at: Record<string, number> = {};
  const wrapped = wrapWithTTSCheckpoints(stream, SID, turn, mark);
  let i = 0;
  for await (const _ of wrapped as NodeReadableStream<AudioFrame>) {
    for (const m of marks.splice(0)) at[m] = i;
    i++;
  }
  for (const m of marks.splice(0)) at[m] = i; // flush
  return { at, frames: i };
}

function streamOf(frames: AudioFrame[]): NodeReadableStream<AudioFrame> {
  return new NodeReadableStream<AudioFrame>({
    start(c) {
      frames.forEach((f) => c.enqueue(f));
      c.close();
    },
  });
}

const fakeNative = {
  renderNonverbal: (_k: string, _d: number, _i: number, _s: number, sr: number) =>
    new Float32Array(Math.round(0.35 * sr)).fill(0.2),
  NativeTempoStretcher: class {
    process(f: Float32Array) {
      return f;
    }
    flush() {
      return new Float32Array(0);
    }
  },
};

describe('wrapWithTTSCheckpoints', () => {
  beforeEach(() => marks.splice(0));

  it('no opening: first byte and first speech are the same frame', async () => {
    const { at, frames } = await run(streamOf(speech(3)));
    expect(at).toEqual({ ttsFirstByte: 0, ttsFirstSpeech: 0, ttsComplete: frames });
  });

  it('with an opening breath: first byte is the breath, first speech is after it', async () => {
    setReplyAudioPlan(SID, 3, { opening: { kind: 'breath', intensity: 0.5 } });
    const stage = createReplyAudioStage({
      sessionId: SID,
      turn: 3,
      native: fakeNative,
      gates: { nonverbal: true, tempo: false },
    });
    const { at, frames } = await run(streamOf(speech(3)).pipeThrough(stage));
    const leadFrames = Math.ceil((0.35 * 24000 + 0.06 * 24000) / 480); // 350 ms breath + 60 ms gap
    expect(at.ttsFirstByte).toBe(0);
    expect(at.ttsFirstSpeech).toBe(leadFrames);
    expect(frames).toBe(leadFrames + 3);
  });

  it('no session id or turn: no checkpoints, stream untouched', async () => {
    const s = streamOf(speech(1));
    expect(wrapWithTTSCheckpoints(s, 'unknown', 3, mark)).toBe(s);
    expect(wrapWithTTSCheckpoints(s, SID, undefined, mark)).toBe(s);
    expect(wrapWithTTSCheckpoints(null, SID, 3, mark)).toBeNull();
  });
});
