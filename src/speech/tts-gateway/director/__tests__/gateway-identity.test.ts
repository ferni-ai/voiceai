/**
 * SPEECH_DIRECTOR off must leave the live gateway path byte-identical.
 *
 * Drives the real createGatewayTTSNode → continuation → SSML processor →
 * prosodyTags path with a provider whose reply stream records exactly what
 * would be sent to Cartesia. GOLDEN was captured on the base commit
 * (fix/tts-expression-1003 @ cbc042741) before the Director existed.
 */

import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import type { ITTSProvider } from '../../types.js';

class RecordingReply implements ReplyStream {
  pushes: string[] = [];
  ended = false;
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {
    this.ended = true;
  }
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {
    yield new ArrayBuffer(960);
  }
}

const replies: RecordingReply[] = [];
const provider: ITTSProvider = {
  name: 'cartesia',
  synthesize: vi.fn().mockResolvedValue(new ArrayBuffer(4800)),
  synthesizeStream: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
  estimateDuration: vi.fn().mockReturnValue(100),
  openReplyStream: () => {
    const reply = new RecordingReply();
    replies.push(reply);
    return reply;
  },
};

vi.mock('../../providers/index.js', () => ({
  getTTSProvider: () => provider,
  getCartesiaProvider: () => provider,
}));

vi.mock('@livekit/rtc-node', () => ({
  AudioFrame: class {
    constructor(
      public data: Int16Array,
      public sampleRate: number,
      public channels: number,
      public samplesPerChannel: number
    ) {}
  },
}));

/** LLM output as it streams: markup, numbers, abbreviations, a long clause run. */
const PIECES = [
  '<emotion value="sympathetic"/>Oh, I hear you. ',
  'Mrs. Johnson said the bill was $4,200 on 10/3, ',
  'and honestly that is a lot of money to find in a single month when you are already stretched ',
  'thin and trying to keep everything together for the kids. ',
  '[sighs] Here\'s the thing, you did the right thing. <break time="600ms"/>',
  'Call at 3:30 p.m. if you can. [laughs] We\'ll figure it out.',
];

/** Captured on the base commit; see the module comment. */
const GOLDEN = [
  '<emotion value="sympathetic"/>Oh, I hear you. ',
  // The 80-char fallback cut lands mid-phrase ("a lot of | money"): the gap
  // the Director's phrasing closes in live mode.
  'Mrs. Johnson said the bill was $4,200 on 10/3, and honestly that is a lot of ',
  'money to find in a single month when you are already stretched thin and trying to keep everything together for the kids. ',
  "Here's the thing, you did the right thing. ",
  'Call at 3:30 p.m. if you can. ',
  "[laughter] We'll figure it out. ",
];

async function runGateway(): Promise<RecordingReply> {
  const { createGatewayTTSNode } = await import('../../gateway-tts-node.js');
  const node = createGatewayTTSNode({
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId: 'identity-session',
    personaId: 'ferni',
    enableCache: false,
  });
  const text = new ReadableStream<string>({
    start(c) {
      for (const p of PIECES) c.enqueue(p);
      c.close();
    },
  });
  const audio = await node(text);
  expect(audio).not.toBeNull();
  for await (const _frame of audio!) {
    /* drain */
  }
  const reply = replies.at(-1)!;
  expect(reply.ended).toBe(true);
  return reply;
}

describe('SPEECH_DIRECTOR on the live gateway path', () => {
  afterEach(() => {
    delete process.env.SPEECH_DIRECTOR;
  });

  it('pushes the golden text with the gate unset (default off)', async () => {
    delete process.env.SPEECH_DIRECTOR;
    expect((await runGateway()).pushes).toEqual(GOLDEN);
  });

  it('pushes the golden text with SPEECH_DIRECTOR=off', async () => {
    process.env.SPEECH_DIRECTOR = 'off';
    expect((await runGateway()).pushes).toEqual(GOLDEN);
  });

  it('pushes the golden text with SPEECH_DIRECTOR=shadow (plans, never changes audio)', async () => {
    process.env.SPEECH_DIRECTOR = 'shadow';
    expect((await runGateway()).pushes).toEqual(GOLDEN);
  });
});
