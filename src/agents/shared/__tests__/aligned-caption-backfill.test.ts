import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { CaptionBackfill, captionsFromFrameTimings } from '../aligned-caption-backfill.js';

const KEY = USERDATA_TIMED_TRANSCRIPT;
/** 20 ms at 24 kHz, optionally carrying timings. */
const frame = (timed?: voice.TimedString[]) =>
  new AudioFrame(new Int16Array(480), 24000, 1, 480, timed ? { [KEY]: timed } : {});

async function run(text: string[], frames: AudioFrame[]) {
  const backfill = new CaptionBackfill();
  // The TTS reads the text before the audio comes back.
  for await (const _ of backfill.tapText(
    ReadableStream.from(text)
  ) as never as AsyncIterable<string>);
  const out: AudioFrame[] = [];
  for await (const f of backfill.wrapAudio(
    ReadableStream.from(frames)
  )! as never as AsyncIterable<AudioFrame>) {
    out.push(f);
  }
  const captions = out.flatMap((f) => (f.userdata[KEY] as Array<string | voice.TimedString>) ?? []);
  return { out, captions };
}

describe('CaptionBackfill', () => {
  it('passes timed frames through untouched and adds nothing', async () => {
    const timed = [
      frame([voice.createTimedString({ text: 'Hi ', startTime: 0, endTime: 0.2 })]),
      frame(),
    ];
    const { out } = await run(['Hi.'], timed);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(timed[0]);
    expect(out[1]).toBe(timed[1]);
  });

  it('a short reply with no timings keeps its words on a trailing silent frame', async () => {
    const plain = [frame(), frame(), frame()];
    const { out, captions } = await run(['Hello ', 'there.'], plain);
    expect(captions).toEqual(['Hello there.']);
    expect(out).toHaveLength(4);
    const tail = out[3];
    expect(tail.sampleRate).toBe(24000);
    expect(tail.samplesPerChannel).toBe(240);
    expect(Array.from(tail.data).every((s) => s === 0)).toBe(true);
    expect(plain.every((f) => f.userdata[KEY] === undefined)).toBe(true); // inputs not mutated
  });

  it('after a second with no timings the words ride the audio, and late timings are dropped', async () => {
    const late = voice.createTimedString({ text: 'Hello ', startTime: 1.2, endTime: 1.4 });
    const frames = Array.from({ length: 70 }, (_, i) => (i === 60 ? frame([late]) : frame()));
    const { out, captions } = await run(['Hello ', 'there, ', 'friend.'], frames);
    expect(out).toHaveLength(70); // nothing left for a trailing frame
    expect(captions).toEqual(['Hello there, friend.']);
    expect(out.findIndex((f) => f.userdata[KEY] !== undefined)).toBe(49); // 50 x 20 ms = 1 s
  });
});

describe('captionsFromFrameTimings', () => {
  const withTts = (agentTts: unknown, sessionTts: unknown) =>
    ({ tts: agentTts, session: { tts: sessionTts } }) as unknown as voice.Agent;
  it('follows the TTS the SDK uses: the agent own, else the session', () => {
    const on = { capabilities: { streaming: true, alignedTranscript: true } };
    const off = { capabilities: { streaming: true } };
    expect(captionsFromFrameTimings(withTts(undefined, on))).toBe(true);
    expect(captionsFromFrameTimings(withTts(off, on))).toBe(false);
    expect(captionsFromFrameTimings(withTts(undefined, off))).toBe(false);
  });
});
