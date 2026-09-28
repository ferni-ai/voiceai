import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import type { AudioFrame } from '@livekit/rtc-node';
import { createContinuationTTS } from '../continuation-tts.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { getSSMLProcessor } from '../ssml/processor.js';

/** A reply stream that records pushes and plays back scripted audio. */
class FakeReply implements ReplyStream {
  pushes: string[] = [];
  ended = false;
  cancelled = false;
  private release: (() => void) | null = null;
  constructor(
    private readonly audio: number[] = [],
    private readonly holdOpen = false
  ) {}
  push(text: string) {
    this.pushes.push(text);
  }
  end() {
    this.ended = true;
  }
  cancel() {
    this.cancelled = true;
    this.release?.();
  }
  async *[Symbol.asyncIterator]() {
    for (const n of this.audio) yield new ArrayBuffer(n);
    if (this.holdOpen) await new Promise<void>((r) => (this.release = r));
  }
}

function textStream(pieces: string[]) {
  return new ReadableStream<string>({
    start(c) {
      for (const p of pieces) c.enqueue(p);
      c.close();
    },
  });
}

const processor = getSSMLProcessor();
function run(pieces: string[], reply: FakeReply, emotion?: string) {
  let firstAudio = 0;
  const errors: unknown[] = [];
  const stream = createContinuationTTS({
    textStream: textStream(pieces),
    reply,
    sanitize: (chunk) => {
      const r = processor.parse(chunk);
      return { text: r.cleanText.trim(), prosody: r.prosody };
    },
    openingTags: prosodyTags,
    emotion,
    toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
    onFirstAudio: () => firstAudio++,
    onError: (e) => errors.push(e),
  });
  return { stream, firstAudio: () => firstAudio, errors };
}

async function drain(stream: ReadableStream<AudioFrame>) {
  const frames: AudioFrame[] = [];
  for await (const f of stream) frames.push(f);
  return frames;
}

describe('createContinuationTTS', () => {
  it('voices the whole reply on one stream, emotion once at the start, no tag text', async () => {
    const reply = new FakeReply([8, 8]);
    const { stream, firstAudio } = run(
      [
        '<emotion value="affectionate"/><break time="200ms"/>You caught me. ',
        'Guilty as charged.<break time="80ms"/> I guess that is my default',
        " state, isn't it?",
      ],
      reply
    );
    const frames = await drain(stream as unknown as ReadableStream<AudioFrame>);

    expect(frames).toHaveLength(2);
    expect(firstAudio()).toBe(1);
    expect(reply.ended).toBe(true);
    expect(reply.pushes[0].startsWith('<emotion value="affectionate"/>')).toBe(true);
    const spoken = reply.pushes.join('');
    expect(spoken.match(/<emotion/g)).toHaveLength(1);
    expect(spoken).not.toMatch(/<break|ratio|time=/);
    expect(spoken).toContain("Guilty as charged. I guess that is my default state, isn't it?");
  });

  it('falls back to the session emotion when the reply names none', async () => {
    const reply = new FakeReply([4]);
    const { stream } = run(['That sounds like a really long week.'], reply, 'sympathetic');
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[0]).toBe(
      '<emotion value="sympathetic"/>That sounds like a really long week. '
    );
  });

  it('keeps a reply softer and slower until the reply changes it', async () => {
    // The humanization layer's pace and volume used to survive only the first
    // sentence; now they hold, and a later tag (e.g. the end of an interrupt
    // soft start) returns the voice to normal.
    const reply = new FakeReply([4]);
    const { stream } = run(
      [
        '<volume ratio="0.8"/><speed ratio="0.92"/>Oh, I hear you. ',
        'That sounds like a lot. ',
        '<speed ratio="1"/><volume ratio="1"/>Want to talk it through?',
      ],
      reply
    );
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[0]).toContain('<volume ratio="0.8"/>');
    expect(reply.pushes[1]).toBe('That sounds like a lot. ');
    expect(reply.pushes[2].startsWith('<speed ratio="1"/><volume ratio="1"/>')).toBe(true);
  });

  it("passes the reply's own emotion, including big ones, and a change mid-reply", async () => {
    const reply = new FakeReply([4]);
    await drain(
      run(
        [
          '<emotion value="excited"/>Wait, a life coach?! That is so cool. ',
          '<emotion value="sympathetic"/>But I know the timing is hard.',
        ],
        reply
      ).stream as unknown as ReadableStream<AudioFrame>
    );
    expect(reply.pushes[0]).toContain('<emotion value="excited"/>');
    const later = reply.pushes.find((p) => p.includes('timing'));
    expect(later).toBe('<emotion value="sympathetic"/>But I know the timing is hard. ');
    expect(reply.pushes.filter((p) => p.includes('<emotion'))).toHaveLength(2);
  });

  it('adds no reset when the reply opened at normal speed and volume', async () => {
    const reply = new FakeReply([4]);
    const { stream } = run(['First sentence here. ', 'Second sentence here.'], reply);
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[1]).toBe('Second sentence here. ');
  });

  it('cancels the provider when playback is interrupted', async () => {
    const reply = new FakeReply([8], true);
    const { stream } = run(['A long reply the user talks over.'], reply);
    const r = (stream as unknown as ReadableStream<AudioFrame>).getReader();
    await r.read();
    await r.cancel();
    expect(reply.cancelled).toBe(true);
  });
});
