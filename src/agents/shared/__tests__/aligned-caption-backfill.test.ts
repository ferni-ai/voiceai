import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { CaptionBackfill, captionsFromFrameTimings } from '../aligned-caption-backfill.js';
import { USERDATA_UNTIMED } from '../frame-timings.js';

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

const at = (text: string, startTime: number, endTime = startTime + 0.2) =>
  voice.createTimedString({ text, startTime, endTime });
const textOf = (captions: Array<string | voice.TimedString>) =>
  captions.map((c) => (typeof c === 'string' ? c : c.text)).join('');
const times = (captions: Array<string | voice.TimedString>) =>
  captions.map((c) => (typeof c === 'string' ? [c] : [c.text, c.startTime]));

describe('CaptionBackfill', () => {
  it('timed frames: the caption is the reply text, placed by the timings', async () => {
    const input = [frame([at('Hi ', 0), at('there ', 0.3)]), frame()];
    const { out, captions } = await run(['Hi there.'], input);
    expect(out).toHaveLength(2);
    expect(out[0].data).toBe(input[0].data); // same audio
    expect(out[1]).toBe(input[1]); // a frame with no timings passes untouched
    expect(times(captions)).toEqual([
      ['Hi ', 0],
      ['there.', 0.3],
    ]);
  });

  it('#3200: sentences after a timed one that bring no timings are kept, in order, once', async () => {
    const text = ['Hi there. ', 'That is amazing! ', 'I am so sorry. ', 'See you soon.'];
    const input = [
      frame([at('Hi ', 0), at('there ', 0.1)]),
      ...Array.from({ length: 10 }, () => frame()),
    ];
    const { captions } = await run(text, input);
    expect(textOf(captions)).toBe(text.join(''));
  });

  it('untimed words between timed ones ride the next timed word, never dropped', async () => {
    const text = ['Okay. ', 'You matter to me. ', 'Call or text now.'];
    // Context 2 (four words) came back with no timings; context 3 did.
    const input = [
      frame([at('Okay ', 0)]),
      frame(),
      frame([at('Call ', 1.4), at('or ', 1.6)]),
      frame(),
    ];
    const { captions } = await run(text, input);
    expect(times(captions)).toEqual([
      ['Okay. ', 0],
      ['You matter to me. Call ', 1.4],
      ['or ', 1.6],
      ['text now.'],
    ]);
    expect(textOf(captions)).toBe(text.join(''));
  });

  it('a second of untimed audio after the last timed word: the rest rides the audio, untimed', async () => {
    const text = ['Hi there. ', 'Take a slow breath with me.'];
    const input = [
      frame([at('Hi ', 0), at('there ', 0.1, 0.3)]),
      ...Array.from({ length: 80 }, () => frame()),
    ];
    const { out, captions } = await run(text, input);
    expect(out).toHaveLength(81); // went out on the audio, nothing left for a trailing frame
    expect(textOf(captions)).toBe(text.join(''));
    // 0.3 s (end of "there") + 1 s: the 65th frame (65 x 20 ms = 1.3 s).
    const untimedAt = out.findIndex((f, i) => i > 0 && f.userdata[KEY] !== undefined);
    expect(untimedAt).toBe(64);
    expect(out[untimedAt].userdata[KEY]).toEqual(['Take a slow breath with me.']);
  });

  it('a word Cartesia spelled differently adds no text of its own: no duplicate, no loss', async () => {
    const text = ['Please call 988 now.'];
    const words = ['Please ', 'call ', 'nine ', 'eight ', 'eight ', 'now '];
    const input = [frame(words.map((w, i) => at(w, i * 0.2))), frame()];
    const { captions } = await run(text, input);
    expect(textOf(captions)).toBe('Please call 988 now.');
    expect(times(captions).at(-1)).toEqual(['988 now.', 1]);
  });

  it('inline tags are skipped to match words and kept in the text for the caption filter', async () => {
    const text = ['<emotion value="curious"/>That is [laughter] great.'];
    const input = [frame([at('That ', 0), at('is ', 0.2), at('great ', 0.4)])];
    const { captions } = await run(text, input);
    expect(times(captions)).toEqual([
      ['<emotion value="curious"/>That ', 0],
      ['is ', 0.2],
      ['[laughter] great.', 0.4],
    ]);
  });

  it('a frame marked untimed (a step dropped its timings) switches to the text at once', async () => {
    const marked = new AudioFrame(new Int16Array(480), 24000, 1, 480, { [USERDATA_UNTIMED]: true });
    const { out, captions } = await run(['Hello ', 'there.'], [frame(), marked, frame()]);
    expect(out[0].userdata[KEY]).toBeUndefined();
    expect(out[1].userdata[KEY]).toEqual(['Hello there.']);
    expect(textOf(captions)).toBe('Hello there.');
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
