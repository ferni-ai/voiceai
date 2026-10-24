import type { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withNameGate } from '../../../agents/personas/name-gate.js';
import { createContinuationTTS } from '../continuation-tts.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { getSSMLProcessor } from '../ssml/processor.js';
import { gatePieces, pushesFor } from './name-push-corpus.js';

/** LLM-like tokens: each word with the space before it. */
const tokens = (t: string): string[] => t.split(/(?=\s)/);

/** A reply as a call voices it at hello: the name gate, then the continuation path. */
async function hello(reply: string, split: 'on' | 'off'): Promise<string[]> {
  vi.stubEnv('NAME_FALLING_SPLIT', split);
  const env = { NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: split };
  return pushesFor(await gatePieces(tokens(reply), 'Seth', true, env), 'Seth');
}

describe('NAME_FALLING_SPLIT: what Cartesia is sent', () => {
  beforeEach(() => vi.stubEnv('NAME_FALLING_INTONATION', 'on'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    // [reply, pushes with the flag off, with it on]
    [
      'That sounds like a lot, Seth, and you handled it well.',
      ['That sounds like a lot, ', 'Seth, and you handled it well. '],
      ['That sounds like a lot, ', 'Seth. ', 'And you handled it well. '],
    ],
    [
      'Take care, Seth, and let me know how it goes.',
      ['Take care, Seth, ', 'and let me know how it goes. '],
      ['Take care, Seth. ', 'And let me know how it goes. '],
    ],
    [
      'Catch you later, Seth, have a good one.',
      ['Catch you later, ', 'Seth, have a good one. '],
      ['Catch you later, ', 'Seth. ', 'Have a good one. '],
    ],
    [
      'Oh hey Seth, how was the run?',
      ['Oh hey Seth, ', 'how was the run? '],
      ['Hey Seth. ', 'How was the run? '],
    ],
  ])('%s', async (reply, off, on) => {
    expect(await hello(reply, 'off')).toEqual(off);
    expect(await hello(reply, 'on')).toEqual(on);
  });

  it.each([
    ['Catch you later, Seth.', ['Catch you later, ', 'Seth. ']],
    ["That's rough, Seth.", ["That's rough, ", 'Seth. ']],
    ["Seth, morning. How'd you sleep?", ['Seth. ', 'Morning. ', "How'd you sleep? "]],
    ["Hey Seth, how's it going?", ['Hey Seth. ', "How's it going? "]],
  ])('leaves shapes that already fall as they are: %s', async (reply, pushes) => {
    expect(await hello(reply, 'off')).toEqual(pushes);
    expect(await hello(reply, 'on')).toEqual(pushes);
  });

  it('ends a name-first opening that skipped the name gate (session.say)', async () => {
    vi.stubEnv('NAME_FALLING_SPLIT', 'off');
    const said = tokens('Seth, good to hear your voice.');
    expect(await pushesFor(said, 'Seth')).toEqual(['Seth, good to hear your voice. ']);
    vi.stubEnv('NAME_FALLING_SPLIT', 'on');
    expect(await pushesFor(said, 'Seth')).toEqual(['Seth. ', 'Good to hear your voice. ']);
    expect(await pushesFor(said)).toEqual(['Seth, good to hear your voice. ']);
  });
});

/** A reply stream that notes when each push went out. */
class TimedReply implements ReplyStream {
  pushes: Array<{ at: number; text: string }> = [];
  constructor(private readonly t0: number) {}
  push(text: string): void {
    this.pushes.push({ at: Date.now() - this.t0, text });
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

const processor = getSSMLProcessor();
/** Between LLM tokens, and timer slack on a loaded CI runner. */
const GAP = 30;
const SLACK = 40;

/** The first push of `reply` streamed a token every GAP ms through gate and gateway, and when. */
async function firstPush(
  reply: string,
  history: Array<{ role: string; textContent: string }>,
  split: 'on' | 'off'
): Promise<{ at: number; text: string }> {
  vi.stubEnv('NAME_FALLING_SPLIT', split);
  const t0 = Date.now();
  const llm = new ReadableStream<string>({
    async start(c) {
      for (const tok of tokens(reply)) {
        c.enqueue(tok);
        await new Promise((r) => {
          setTimeout(r, GAP);
        });
      }
      c.close();
    },
  });
  const env = { NAME_GATE: 'on', NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: split };
  const gated = withNameGate(llm, { name: 'Seth', history, env });
  const out = new TimedReply(t0);
  const stream = createContinuationTTS({
    textStream: gated as unknown as ReadableStream<string>,
    reply: out,
    callerName: 'Seth',
    sanitize: (chunk) => {
      const r = processor.parse(chunk);
      return { text: r.cleanText.trim(), prosody: r.prosody };
    },
    openingTags: prosodyTags,
    sentenceBreakMs: 0,
    toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
    onFirstAudio: () => undefined,
    onError: (e) => {
      throw e;
    },
  });
  for await (const _ of stream) {
    /* drain */
  }
  return out.pushes[0];
}

const MID_CALL = [
  { role: 'user', textContent: 'hi' },
  { role: 'assistant', textContent: 'Hello there.' },
  { role: 'user', textContent: 'so anyway' },
];

describe('NAME_FALLING_SPLIT latency', () => {
  beforeEach(() => vi.stubEnv('NAME_FALLING_INTONATION', 'on'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['Oh hey Seth, how was the run?', []],
    ['Seth, good to hear your voice.', []],
    ['That sounds like a lot, Seth, and you handled it well.', []],
    ["Hey Seth, morning. How's it going?", MID_CALL],
    ["That's rough, Seth. Long shift?", MID_CALL],
  ])('first audio waits at most one more token: %s', async (reply, history) => {
    const off = await firstPush(reply, history, 'off');
    const on = await firstPush(reply, history, 'on');
    expect(on.at).toBeLessThanOrEqual(off.at + GAP + SLACK);
  });

  it('a reply without the name goes out as before', async () => {
    const reply = 'That sounds really hard, and I am here for it.';
    const off = await firstPush(reply, MID_CALL, 'off');
    const on = await firstPush(reply, MID_CALL, 'on');
    expect(on.text).toBe(off.text);
    expect(Math.abs(on.at - off.at)).toBeLessThan(SLACK);
  });
});
