import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioFrame } from '@livekit/rtc-node';
import { createContinuationTTS, sentenceBreakMs } from '../continuation-tts.js';
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

// The tests below pin exact pushes; the sentence pause has its own tests at the end.
beforeEach(() => vi.stubEnv('CASCADE_SENTENCE_BREAK_MS', '0'));
afterEach(() => vi.unstubAllEnvs());
function run(
  pieces: string[],
  reply: FakeReply,
  emotion?: string,
  openReply?: () => FakeReply,
  baseSpeed?: number
) {
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
    openReply,
    baseSpeed,
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

  it('marks the first LLM text and the first push once each, text first', async () => {
    const stages: string[] = [];
    const reply = new FakeReply([4]);
    const stream = createContinuationTTS({
      textStream: textStream(['Oh', ' no, not the keyboard again. ', 'Is it still working?']),
      reply,
      sanitize: (chunk) => ({ text: chunk.trim(), prosody: {} }),
      openingTags: () => '',
      toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
      onFirstAudio: () => undefined,
      onStage: (stage) => stages.push(stage),
      onError: () => undefined,
    });
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(stages).toEqual(['text', 'push']);
  });

  it('sends the first words at a word boundary when no clause break comes soon', async () => {
    const reply = new FakeReply([4]);
    let pushedBeforeRest = '';
    const slow = new ReadableStream<string>({
      async start(c) {
        c.enqueue('Honestly I think that the keyb');
        await new Promise((r) => setTimeout(r, 120));
        pushedBeforeRest = reply.pushes.join('');
        c.enqueue('oard is gone for good. ');
        c.close();
      },
    });
    const stream = createContinuationTTS({
      textStream: slow,
      reply,
      sanitize: (chunk) => ({ text: chunk.trim(), prosody: {} }),
      openingTags: () => '',
      toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
      onFirstAudio: () => undefined,
      onError: () => undefined,
      firstChunkWaitMs: 20,
    });
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(pushedBeforeRest).toBe('Honestly I think that the ');
    expect(reply.pushes.join('')).toBe('Honestly I think that the keyboard is gone for good. ');
  });

  // A short opening ("Yeah, la") under the 12-character minimum used to sit
  // until the next token arrived, after the wait had already expired.
  it('sends a short opening once the wait expires instead of holding it for the next token', async () => {
    const reply = new FakeReply([4]);
    let pushedBeforeRest = '';
    const slow = new ReadableStream<string>({
      async start(c) {
        c.enqueue('Yeah, la');
        await new Promise((r) => setTimeout(r, 120));
        pushedBeforeRest = reply.pushes.join('');
        c.enqueue('ter tonight works. ');
        c.close();
      },
    });
    const stream = createContinuationTTS({
      textStream: slow,
      reply,
      sanitize: (chunk) => ({ text: chunk.trim(), prosody: {} }),
      openingTags: () => '',
      toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
      onFirstAudio: () => undefined,
      onError: () => undefined,
      firstChunkWaitMs: 20,
    });
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(pushedBeforeRest).toBe('Yeah, ');
    expect(reply.pushes.join('')).toBe('Yeah, later tonight works. ');
  });

  it('falls back to the session emotion when the reply names none', async () => {
    const reply = new FakeReply([4]);
    const { stream } = run(['That sounds like a really long week.'], reply, 'sympathetic');
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[0]).toBe(
      '<emotion value="sympathetic"/>That sounds like a really long week. '
    );
  });

  // The session emotion is the CALLER's detected mood (turn-handler sets
  // userData.currentEmotion). Ferni answers it; he does not mirror it.
  it.each([
    ['a sad caller gets a sympathetic Ferni', 'sad', 'That sounds like a really long week.', 'sympathetic'],
    ['an anxious caller gets a sympathetic Ferni', 'anxious', 'Okay, let us take it one step at a time.', 'sympathetic'],
    ['a happy caller gets a content Ferni', 'happy', 'Tell me everything.', 'content'],
    ['words veto a mood they contradict', 'happy', "Oh no, I'm so sorry to hear that.", 'sympathetic'],
    ['an unmapped mood leaves it to the words', 'trust', 'Congratulations, that is amazing!', 'content'],
  ])('%s', async (_name, callerMood, line, expected) => {
    const reply = new FakeReply([4]);
    const { stream } = run([line], reply, callerMood);
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[0].startsWith(`<emotion value="${expected}"/>`)).toBe(true);
  });

  it('adds no emotion when neither the mood nor the words call for one', async () => {
    const reply = new FakeReply([4]);
    const { stream } = run(['I went to the store today.'], reply, 'trust');
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[0]).not.toContain('<emotion');
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

  it('drops big emotions (unstable pitch, #180) but passes a stable change mid-reply', async () => {
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
    expect(reply.pushes[0]).not.toContain('excited');
    const later = reply.pushes.find((p) => p.includes('timing'));
    expect(later).toBe('<emotion value="sympathetic"/>But I know the timing is hard. ');
    expect(reply.pushes.filter((p) => p.includes('<emotion'))).toHaveLength(1);
  });

  it('speaks at the session pace, with reply speed tags relative to it', async () => {
    const reply = new FakeReply([10]);
    const { stream } = run(
      ['That deadline is a lot to absorb this week. ', '<speed ratio="0.9"/>Take a breath first. '],
      reply,
      undefined,
      undefined,
      1.06
    );
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    expect(reply.pushes[0]).toContain('<speed ratio="1.06"/>');
    expect(reply.pushes[1]).toContain('<speed ratio="0.95"/>');
  });

  it('continues on a fresh generation when the emotion shifts, playing audio in order', async () => {
    // Cartesia: emotion shifts inside one generation are highly experimental;
    // use a separate context per emotion.
    const first = new FakeReply([3]);
    const second = new FakeReply([5]);
    const opened: FakeReply[] = [];
    const { stream } = run(
      [
        '<emotion value="curious"/>You got the job? ',
        'Tell me everything. ',
        '<emotion value="sympathetic"/>I know the last month was hard, though.',
      ],
      first,
      undefined,
      () => {
        opened.push(second);
        return second;
      }
    );
    const frames = (await drain(
      stream as unknown as ReadableStream<AudioFrame>
    )) as unknown as Array<{
      bytes: number;
    }>;
    expect(opened).toHaveLength(1);
    expect(first.ended).toBe(true);
    expect(first.pushes.join('')).not.toContain('sympathetic');
    expect(second.pushes[0].startsWith('<emotion value="sympathetic"/>I know')).toBe(true);
    expect(second.ended).toBe(true);
    expect(frames.map((f) => f.bytes)).toEqual([3, 5]);
  });

  it('keeps one generation when the emotion does not change', async () => {
    const reply = new FakeReply([4]);
    let opened = 0;
    await drain(
      run(['<emotion value="calm"/>Okay. ', 'Take your time.'], reply, undefined, () => {
        opened++;
        return new FakeReply();
      }).stream as unknown as ReadableStream<AudioFrame>
    );
    expect(opened).toBe(0);
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

describe('sentence pause (Ma)', () => {
  async function pushesFor(pieces: string[], breakMs: number): Promise<string[]> {
    const reply = new FakeReply([4]);
    const stream = createContinuationTTS({
      textStream: textStream(pieces),
      reply,
      sanitize: (chunk) => ({ text: chunk.trim(), prosody: {} }),
      openingTags: () => '',
      toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
      onFirstAudio: () => undefined,
      onError: () => undefined,
      sentenceBreakMs: breakMs,
    });
    await drain(stream as unknown as ReadableStream<AudioFrame>);
    return reply.pushes;
  }

  it('pauses between sentences, never before the first or after the last', async () => {
    const pushes = await pushesFor(
      ['That makes sense to me. ', 'Tell me more about it. ', 'What happened next?'],
      300
    );
    const spoken = pushes.join('');
    expect(spoken.match(/<break time="300ms"\/>/g)).toHaveLength(2);
    expect(spoken.startsWith('<break')).toBe(false);
    expect(spoken.trimEnd().endsWith('next?')).toBe(true);
  });

  it('does not pause after a clause that ends mid-sentence', async () => {
    const pushes = await pushesFor(
      ['Oh, well, honestly, ', 'that is a great question for later. '],
      300
    );
    expect(pushes.join('')).not.toContain('<break');
  });

  it('does not pause after an ellipsis, which often runs on mid-sentence', async () => {
    const pushes = await pushesFor(['The light outside my window... ', 'reminds me of the lake back home. '], 300);
    expect(pushes.join('')).not.toContain('<break');
  });

  it('can be turned off', async () => {
    const pushes = await pushesFor(['First thing here. ', 'Second thing here.'], 0);
    expect(pushes.join('')).not.toContain('<break');
  });
});

describe('sentenceBreakMs', () => {
  it('defaults to 300 ms, honours 0, caps at 2 s and ignores garbage', () => {
    expect(sentenceBreakMs({})).toBe(300);
    expect(sentenceBreakMs({ CASCADE_SENTENCE_BREAK_MS: '0' })).toBe(0);
    expect(sentenceBreakMs({ CASCADE_SENTENCE_BREAK_MS: '450' })).toBe(450);
    expect(sentenceBreakMs({ CASCADE_SENTENCE_BREAK_MS: '9000' })).toBe(2000);
    expect(sentenceBreakMs({ CASCADE_SENTENCE_BREAK_MS: 'soon' })).toBe(300);
  });
});
