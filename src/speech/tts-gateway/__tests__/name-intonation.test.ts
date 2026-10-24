import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioFrame } from '@livekit/rtc-node';
import { createContinuationTTS } from '../continuation-tts.js';
import { fallingVocative, WAIT, withFallingVocative } from '../name-intonation.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { getSSMLProcessor } from '../ssml/processor.js';

describe('fallingVocative', () => {
  it.each([
    ["Hey Seth, how's it going?", "Hey Seth. How's it going?"],
    ['Hi Sam — up late tonight?', 'Hi Sam. Up late tonight?'],
    ['Hey Seth! Good to hear you.', 'Hey Seth. Good to hear you.'],
    [
      'Morning, Seth, did you tackle that mail yet?',
      'Hey Seth. Morning. Did you tackle that mail yet?',
    ],
    ['Morning, Seth. Did you finally tackle it?', 'Hey Seth. Morning. Did you finally tackle it?'],
    ['Good evening, Sam, how was the shift?', 'Hey Sam. Good evening. How was the shift?'],
    ['<emotion value="calm"/>Hey Seth, rough day?', '<emotion value="calm"/>Hey Seth. Rough day?'],
  ])('ends the opening name on its own sentence: %s', (input, expected) => {
    expect(fallingVocative(input, false)).toBe(expected);
  });

  it('rewrites a reply that is only the greeting once it is complete', () => {
    expect(fallingVocative('Morning, Seth.', true)).toBe('Hey Seth. Morning.');
    expect(fallingVocative('Hey Seth', true)).toBe('Hey Seth.');
  });

  it.each([
    "So, how's it going?",
    "Hey, how's it going?",
    'Hey there, Seth.',
    'Hey I was thinking about that.',
    'Hey, Look, it happens to everyone.',
    'Hey Seth? You still there?',
    "That's rough, Sam.",
    'Morning routines help.',
  ])('leaves other openings alone: %s', (input) => {
    expect(fallingVocative(input, false)).toBe(input);
  });

  it('waits while the opening could still be a greeting with a name', () => {
    for (const partial of [
      '',
      'Mor',
      'Good',
      'Morning, ',
      'Morning, Se',
      'Hey Seth,',
      'Hey Seth, ',
    ]) {
      expect(fallingVocative(partial, false)).toBe(WAIT);
    }
  });
});

describe('fallingVocative with NAME_FALLING_SPLIT', () => {
  const split = { name: 'Seth' };

  it.each([
    ['Oh hey Seth, how was the run?', 'Hey Seth. How was the run?'],
    ['Ah, hey Seth, good to hear you.', 'Hey Seth. Good to hear you.'],
    ["Well, hi Seth, what's new?", "Hi Seth. What's new?"],
    ["Okay hey Seth, what's up?", "Hey Seth. What's up?"],
    ['Oh, morning Seth, sleep okay?', 'Hey Seth. Morning. Sleep okay?'],
  ])('drops the reaction word before a hello with the name: %s', (input, expected) => {
    expect(fallingVocative(input, false, split)).toBe(expected);
    expect(fallingVocative(input, false)).toBe(input);
  });

  it.each([
    ['Seth, good to hear your voice.', 'Seth. Good to hear your voice.'],
    ["Seth, morning. How'd you sleep?", "Seth. Morning. How'd you sleep?"],
    ["Seth — how's it going?", "Seth. How's it going?"],
  ])('ends a name that opens the reply on its own sentence: %s', (input, expected) => {
    expect(fallingVocative(input, false, split)).toBe(expected);
    expect(fallingVocative(input, false)).toBe(input);
  });

  it.each([
    'Seth, Jo and I went.',
    'Seth, Jo, Mia, and I went.',
    'Seth, and the kids, are coming.',
    'Oh hey Seth, Jo, and Mia!',
    'Seth. Good to hear you.',
    "Seth's here.",
    'Sethany, hi.',
    "Oh hey, that's cool.",
    "Oh, that's rough.",
    'Well, I think so.',
    'Sam, good to hear you.',
  ])('leaves other openings alone: %s', (input) => {
    expect(fallingVocative(input, false, split)).toBe(input);
  });

  it('changes nothing for another name, or when the caller has none', () => {
    expect(fallingVocative('Oh hey Sam, how was the run?', false, split)).toBe(
      'Oh hey Sam, how was the run?'
    );
    expect(fallingVocative('Oh hey Seth, how was it?', false, { name: null })).toBe(
      'Oh hey Seth, how was it?'
    );
  });

  it.each([
    ['Hey, morning.', 'Morning.'],
    ["Hey morning, how'd you sleep?", "Morning, how'd you sleep?"],
    ['Hi, good evening.', 'Good evening.'],
  ])('drops a hello the name gate left before a greeting: %s', (input, expected) => {
    expect(fallingVocative(input, false, split)).toBe(expected);
    expect(fallingVocative(input, false)).toBe(input);
  });

  it('keeps a hello before other words', () => {
    expect(fallingVocative('Hey, mornings are rough.', false, split)).toBe(
      'Hey, mornings are rough.'
    );
    expect(fallingVocative('Hey, mor', false, split)).toBe(WAIT);
  });

  it('waits while a reaction word or the name may still open the reply', () => {
    for (const partial of ['O', 'Oh', 'Oh,', 'Oh ', 'Oh he', 'Se', 'Seth', 'Seth, ']) {
      expect(fallingVocative(partial, false, split)).toBe(WAIT);
    }
    expect(fallingVocative('Seth,', true, split)).toBe('Seth.');
  });
});

/** A reply stream that records what would be sent to Cartesia. */
class FakeReply implements ReplyStream {
  pushes: string[] = [];
  push(text: string) {
    this.pushes.push(text);
  }
  end() {}
  cancel() {}
  async *[Symbol.asyncIterator]() {}
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

/** Run a streamed reply through the production continuation path and return the pushes. */
async function pushesFor(pieces: string[]): Promise<string[]> {
  const reply = new FakeReply();
  const stream = createContinuationTTS({
    textStream: textStream(pieces),
    reply,
    sanitize: (chunk) => {
      const r = processor.parse(chunk);
      return { text: r.cleanText.trim(), prosody: r.prosody };
    },
    openingTags: prosodyTags,
    toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
    onFirstAudio: () => undefined,
    onError: (e) => {
      throw e;
    },
  });
  for await (const _ of stream) {
    /* drain */
  }
  return reply.pushes;
}

describe('NAME_FALLING_INTONATION on the continuation path', () => {
  beforeEach(() => vi.stubEnv('CASCADE_SENTENCE_BREAK_MS', '0'));
  afterEach(() => vi.unstubAllEnvs());

  it('off: the opening name runs on into the question (the measured rising shape)', async () => {
    vi.stubEnv('NAME_FALLING_INTONATION', 'off');
    expect(await pushesFor(["Hey Seth, how's it going?"])).toEqual(["Hey Seth, how's it going? "]);
  });

  it('on: the name ends its own Cartesia piece', async () => {
    vi.stubEnv('NAME_FALLING_INTONATION', 'on');
    expect(await pushesFor(["Hey Seth, how's it going?"])).toEqual([
      'Hey Seth. ',
      "How's it going? ",
    ]);
  });

  it('on: a streamed "Morning, Seth, ..." never sends the name before it is decided', async () => {
    vi.stubEnv('NAME_FALLING_INTONATION', 'on');
    const pushes = await pushesFor([
      'Morning',
      ', Se',
      'th, ',
      'did you ',
      'tackle that mail yet?',
    ]);
    expect(pushes).toEqual(['Hey Seth. ', 'Morning. ', 'Did you tackle that mail yet? ']);
  });

  it('on: a reply that does not open on a greeting is pushed exactly as with the flag off', async () => {
    const reply = ["That's rough, Sam. ", 'Long shift?'];
    vi.stubEnv('NAME_FALLING_INTONATION', 'off');
    const off = await pushesFor(reply);
    vi.stubEnv('NAME_FALLING_INTONATION', 'on');
    expect(await pushesFor(reply)).toEqual(off);
    expect(off.join('')).toContain('Sam.');
  });
});

describe('withFallingVocative', () => {
  afterEach(() => vi.unstubAllEnvs());

  const on = { NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: 'on' };
  /** Pieces in, with when each piece came out (ms after the first went in). */
  async function timed(pieces: Array<[number, string]>, onText?: (at: number) => void) {
    const t0 = Date.now();
    const input = new ReadableStream<string>({
      async start(c) {
        for (const [at, p] of pieces) {
          await new Promise((r) => {
            setTimeout(r, Math.max(0, at - (Date.now() - t0)));
          });
          c.enqueue(p);
        }
        c.close();
      },
    });
    const out: Array<[number, string]> = [];
    for await (const p of withFallingVocative(input, on, 'Seth', { onText, holdMs: 50 }))
      out.push([Date.now() - t0, p]);
    return out;
  }

  it('lets a hold only NAME_FALLING_SPLIT asked for go as main would, after holdMs', async () => {
    const out = await timed([
      [0, 'Okay,'],
      [200, " let's go."],
    ]);
    expect(out.map(([, p]) => p).join('')).toBe("Okay, let's go.");
    expect(out[0][1]).toBe('Okay,');
    expect(out[0][0]).toBeLessThan(150);
  });

  it("reports when the reply's text began only for the split's own holds", async () => {
    const seen: number[] = [];
    await timed(
      [
        [0, 'Okay,'],
        [20, ' sure.'],
      ],
      (at) => seen.push(at)
    );
    await timed(
      [
        [0, 'Hey'],
        [20, ' Seth, hi.'],
      ],
      (at) => seen.push(at)
    );
    expect(seen).toHaveLength(1);
  });

  it('returns the same stream when the flag is off', () => {
    const stream = textStream(['Hey Seth, hi.']);
    expect(withFallingVocative(stream, { NAME_FALLING_INTONATION: 'off' })).toBe(stream);
  });
});
