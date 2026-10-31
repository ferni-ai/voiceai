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

/** A reply as a call voices it: the name gate (hello or mid-call), then the continuation path. */
async function voiced(reply: string, split: 'on' | 'off', hello = true): Promise<string[]> {
  vi.stubEnv('NAME_FALLING_SPLIT', split);
  const env = { NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: split };
  return pushesFor(await gatePieces(tokens(reply), 'Seth', hello, env), 'Seth');
}

describe('NAME_FALLING_SPLIT: what Cartesia is sent', () => {
  beforeEach(() => vi.stubEnv('NAME_FALLING_INTONATION', 'on'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    // [reply, pushes with the flag off, with it on]
    [
      'Oh hey Seth, how was the run?',
      ['Oh hey Seth, ', 'how was the run? '],
      ['Hey Seth. ', 'How was the run? '],
    ],
  ])('%s', async (reply, off, on) => {
    expect(await voiced(reply, 'off')).toEqual(off);
    expect(await voiced(reply, 'on')).toEqual(on);
  });

  it('mid-call, drops the hello with the name, as main does for the whole reply', async () => {
    expect(await voiced('Hey Seth, morning.', 'off', false)).toEqual(['Hey, morning. ']);
    expect(await voiced('Hey Seth, morning.', 'on', false)).toEqual(['Morning. ']);
  });

  it('ends a name-first opening that skipped the name gate (session.say)', async () => {
    vi.stubEnv('NAME_FALLING_SPLIT', 'off');
    const said = tokens('Seth, good to hear your voice.');
    expect(await pushesFor(said, 'Seth')).toEqual(['Seth, good to hear your voice. ']);
    vi.stubEnv('NAME_FALLING_SPLIT', 'on');
    expect(await pushesFor(said, 'Seth')).toEqual(['Seth. ', 'Good to hear your voice. ']);
    expect(await pushesFor(said)).toEqual(['Seth, good to hear your voice. ']);
  });

  it.each([
    // Shapes that already fall.
    'Catch you later, Seth.',
    "That's rough, Seth.",
    "Seth, morning. How'd you sleep?",
    // A short goodbye before ", Seth, and": the name falls inside the first push already.
    'Take care, Seth, and let me know how it goes.',
    'See you, Seth, and say hi to Jo.',
    'Bye, Seth, and thanks again.',
    'Good night, Seth, and sleep well.',
    'Talk soon, Seth, and good luck tomorrow.',
    // Lists and appositions: the name is not (clearly) said to the caller.
    'Say hi to Jo, Seth, and the kids for me.',
    'Invite Jo, Seth, and her sister.',
    'I saw Jo, Seth, and the kids.',
    'It was me, Seth, and the dog.',
    'Remember Tom, Seth, and his boat?',
    'Between you, Seth, and me, it is fine.',
    'Thanks to you, Seth, and the whole team.',
    'Me, Seth, and Jo went.',
    'Jo, Seth, and I went to the lake.',
    'We invited Mom, Seth, and the neighbors.',
    'Dinner with Jo, Seth, and the twins was fun.',
    'Like Jo, Seth, and everyone else, you deserve a break.',
    'I packed snacks for Jo, Seth, and the kids.',
    'It is between Tom, Seth, and Ali now.',
    'Tell Jo, Seth, and Ali I said hi.',
    'She called him, Seth, and then hung up.',
    'Ask them, Seth, and see what they say.',
    'I hear you, Seth, and the kids too.',
    'My friend, Seth, and I went.',
    'Our coach, Seth, and his wife came.',
    'The new guy, Seth, and his dog moved in.',
    'Seth, Jo, and the kids are here.',
    'You, Seth, and Jo are the best.',
    'It was between you, Seth, and I.',
    'It was me, Seth, and it was over.',
    'Mom, Seth, and the kids are coming.',
    'Alex, Seth, and I went.',
    'Grandma, Seth, and the dog are asleep.',
    '"Thanks, Seth, and good luck," she said.',
    '"Thanks, Seth, and you take care," she said.',
    // A hello before the name: dropping the name would strand it ("Hey, and welcome back!").
    'Hey, Seth, and welcome back!',
    'Hi, Seth, and thanks for calling.',
    'Hey there, Seth, and welcome!',
    'Hey, Seth, keep it up!',
    // Another name than the caller's.
    'Oh hey Sam, how was the run?',
    // The caller greeted as one of several (round-2 verify).
    'Oh hey, Seth, and Jo!',
    'Oh hey Seth, Jo, and Mia!',
    'Oh hi Seth, Jo, and everyone, welcome.',
    'Ah hey Seth, Jo, and I were just talking.',
    'Oh hey Seth, and thanks for calling.',
  ])('leaves it as main sends it, at hello and mid-call: %s', async (reply) => {
    for (const hello of [true, false]) {
      expect(await voiced(reply, 'on', hello)).toEqual(await voiced(reply, 'off', hello));
    }
  });

  // Round 2 (#2726) blockers 1, 2, 4 and 5: with the flag on, Cartesia gets what main sends.
  it.each([
    // 1: a list that opens the sentence
    'The twins, Seth, and I went to the lake.',
    'My parents, Seth, and I drove up Friday.',
    'My cousins, Seth, and I went.',
    'Both kids, Seth, and we left early.',
    'The movers, Seth, and I carried it up.',
    'jo, seth, and i went hiking.',
    'the twins, seth, and i went.',
    // 2: single quotes
    "'Thanks, Seth, and I mean it,' she said.",
    '‘Thanks, Seth, and I mean it,’ she told him.',
    "'Honestly, Seth, and I say this kindly, you're late,' she said.",
    // 4: a hello and a greeting, no name
    "Hey, morning! How'd you sleep?",
    'Hi, good morning, how are you?',
    'Hey, evening already?',
    'Hello, afternoon crew!',
    // 5: a short opener before ", Seth, and"
    'Thanks, Seth, and take your time.',
    'Sorry, Seth, and I mean that.',
    'Right, Seth, and that is fine.',
    // the rule they came from
    'That sounds like a lot, Seth, and you handled it well.',
    'Catch you later, Seth, have a good one.',
  ])('round-2 blocker shape goes as main sends it: %s', async (reply) => {
    for (const hello of [true, false]) {
      expect(await voiced(reply, 'on', hello)).toEqual(await voiced(reply, 'off', hello));
    }
    vi.stubEnv('NAME_FALLING_SPLIT', 'off');
    const said = await pushesFor(tokens(reply), 'Seth');
    vi.stubEnv('NAME_FALLING_SPLIT', 'on');
    expect(await pushesFor(tokens(reply), 'Seth')).toEqual(said); // session.say
  });

  // Round 2 blocker 3: a caller whose name is also a word, on the LLM path and on session.say.
  it.each([
    ['Will', 'Will, as a word, means a lot to me.'],
    ['will smith', 'Will, I think, is the key.'],
    ['HOPE', 'Hope, for me, is a daily practice.'],
    ['Hope', 'Hope, honestly, is what keeps me going.'],
    ['Grace', 'Grace, in a moment like that, is everything.'],
  ])('caller %s: a name that is also a word goes as main sends it: %s', async (caller, reply) => {
    const pieces = tokens(reply);
    const first = caller
      .split(' ')[0]
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());
    const sent = async (split: 'on' | 'off', hello?: boolean): Promise<string[]> => {
      vi.stubEnv('NAME_FALLING_SPLIT', split);
      const env = { NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: split };
      const text = hello === undefined ? pieces : await gatePieces(pieces, first, hello, env);
      return pushesFor(text, caller);
    };
    for (const hello of [undefined, true, false]) {
      expect(await sent('on', hello)).toEqual(await sent('off', hello));
    }
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
/**
 * Between LLM tokens; a hold of one token is 60 ms, so a 15 ms tolerance catches it.
 * The latency tests run on a fake clock (setTimeout and Date.now, which is all the
 * gate and the continuation path read), so the times are exact and take no wall time.
 */
const GAP = 60;
const TOLERANCE = 15;
const MID_CALL = [
  { role: 'user', textContent: 'hi' },
  { role: 'assistant', textContent: 'Hello there.' },
  { role: 'user', textContent: 'so anyway' },
];

/** The first push of `reply`, its tokens `gaps[i]` ms apart, through gate and gateway. */
async function firstPush(
  reply: string,
  hello: boolean,
  split: 'on' | 'off',
  gap: (i: number) => number = () => GAP
): Promise<{ at: number; text: string }> {
  vi.stubEnv('NAME_FALLING_SPLIT', split);
  const t0 = Date.now();
  const llm = new ReadableStream<string>({
    async start(c) {
      for (const [i, tok] of tokens(reply).entries()) {
        c.enqueue(tok);
        await new Promise((r) => {
          setTimeout(r, gap(i));
        });
      }
      c.close();
    },
  });
  const env = { NAME_GATE: 'on', NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: split };
  const gated = withNameGate(llm, { name: 'Seth', history: hello ? [] : MID_CALL, env });
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
  const drained = (async () => {
    for await (const _ of stream) {
      /* drain */
    }
  })();
  await vi.runAllTimersAsync();
  await drained;
  return out.pushes[0];
}

describe('NAME_FALLING_SPLIT latency', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.stubEnv('NAME_FALLING_INTONATION', 'on');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ['That sounds really hard, and I am here for it.', false],
    ['That sounds really hard, and I am here for it.', true],
    ["Okay, let's go over it together.", true],
    ['Well, I did not see that coming.', true],
    ['Oh, that is rough.', true],
    ["Hey, that's wild, honestly.", false],
    ['Hey there, how was the walk today?', true],
    ['Hey there, how was the walk today?', false],
    ['Sure thing, I can do that.', false],
    ["Hey, morning! How'd you sleep?", false],
    ["Hey, morning! How'd you sleep?", true],
    ['Hi, good morning, how are you?', false],
    // "Oh" is a reaction, never held as a hello.
    ["Oh hey, that's cool.", false],
    ["Oh hey, that's cool.", true],
  ])('a reply without the name goes out exactly when it did: %s', async (reply, hello) => {
    const off = await firstPush(reply, hello, 'off');
    const on = await firstPush(reply, hello, 'on');
    expect(on.text).toBe(off.text);
    expect(Math.abs(on.at - off.at)).toBeLessThan(TOLERANCE);
  });

  it('a slow model: a held "Okay," goes no later than it did', async () => {
    const slow = (i: number): number => (i === 0 ? 250 : GAP);
    const off = await firstPush("Okay, let's go over it together.", true, 'off', slow);
    const on = await firstPush("Okay, let's go over it together.", true, 'on', slow);
    expect(on.text).toBe(off.text);
    expect(Math.abs(on.at - off.at)).toBeLessThan(TOLERANCE);
  });

  // Round 2 blocker 5: ", Seth, and <clause>" after a short opener waited 2-3 tokens mid-call.
  it.each([
    ['Thanks, Seth, and take your time.', false],
    ['Sorry, Seth, and I mean that.', false],
    ['Right, Seth, and that is fine.', false],
    ['Thanks, Seth, and take your time.', true],
  ])('a ", Seth, and" reply goes out as and when it did: %s', async (reply, hello) => {
    const off = await firstPush(reply, hello, 'off');
    const on = await firstPush(reply, hello, 'on');
    expect(on.text).toBe(off.text);
    expect(Math.abs(on.at - off.at)).toBeLessThan(TOLERANCE);
  });

  // Round 3 blocker 1: a mid-call hello was held until the next sentence when the name ended its own.
  it.each([
    ['Hey Seth! Good to hear you.', false],
    ['Hey Seth. How was the run?', false],
    ['Hey Seth? You there?', false],
    ['Hey Seth! Long time.', false],
  ])(
    'a name that ends its sentence: the hello goes as and when it did: %s',
    async (reply, hello) => {
      const off = await firstPush(reply, hello, 'off');
      const on = await firstPush(reply, hello, 'on');
      expect(on.text).toBe(off.text);
      expect(Math.abs(on.at - off.at)).toBeLessThan(TOLERANCE);
    }
  );

  it.each([
    ["Hey Seth, morning. How'd you sleep?", false],
    ["Hey Seth, how's it going?", false],
    ['Seth, good to hear your voice.', true],
    ['Oh hey Seth, how was the run?', true],
  ])(
    'a name reply waits at most the name token, never cut mid-phrase: %s',
    async (reply, hello) => {
      const off = await firstPush(reply, hello, 'off');
      const on = await firstPush(reply, hello, 'on');
      expect(on.at).toBeLessThanOrEqual(off.at + GAP + TOLERANCE);
      // Cut where main cut it (at 60 ms a token main's own word cut may go first) or at a phrase end.
      if (on.text !== off.text) expect(on.text).toMatch(/[,.!?] $/);
    }
  );
});
