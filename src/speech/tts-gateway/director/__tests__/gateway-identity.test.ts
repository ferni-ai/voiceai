/**
 * SPEECH_DIRECTOR off must leave the live gateway path byte-identical.
 *
 * Drives the real createGatewayTTSNode → continuation → SSML processor →
 * prosodyTags path with a provider whose reply stream records exactly what
 * would be sent to Cartesia. GOLDEN was captured on the base commit
 * (fix/tts-expression-1003 @ cbc042741) before the Director existed.
 */

import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import type { ITTSProvider } from '../../types.js';
import { directorSessions } from '../session-state.js';

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
  "Call at 3:30 p.m. if you can. [laughs] We'll figure it out.",
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

async function runGateway(pieces: readonly string[] = PIECES): Promise<RecordingReply> {
  const { createGatewayTTSNode } = await import('../../gateway-tts-node.js');
  const node = createGatewayTTSNode({
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId: 'identity-session',
    personaId: 'ferni',
    enableCache: false,
  });
  const text = new ReadableStream<string>({
    start(c) {
      for (const p of pieces) c.enqueue(p);
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
  beforeEach(() => {
    directorSessions.clear('identity-session');
  });
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
    // ...and the Director really ran on this path: it carried its plan forward.
    expect(directorSessions.get('identity-session', 'ferni').emotion).toBe('sympathetic');
  });

  it('never runs the Director when off', async () => {
    process.env.SPEECH_DIRECTOR = 'off';
    await runGateway();
    expect(directorSessions.get('identity-session', 'ferni')).toEqual({ speed: 1 });
  });

  it('changes what reaches Cartesia with SPEECH_DIRECTOR=live (the wiring is reached)', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    const { pushes } = await runGateway();
    expect(pushes).not.toEqual(GOLDEN);
    const all = pushes.join('');
    // Conventional forms are Cartesia's to read; only the edge cases change.
    // A bare date in date context is one (Sonic read "10/3" as "10 thirds").
    expect(all).toContain('$4,200 on October 3,');
    expect(all).toContain('Call at 3:30 PM if you can.');
    expect(pushes.some((p) => p.trim().endsWith('a lot of'))).toBe(false);
    expect(pushes[0]).toContain('<emotion value="sympathetic"/>');
  });
});

/**
 * The measured cause of mid-sentence breaks on dev (2026-10-03): the LLM's
 * mid-sentence "...", which Cartesia voices as a 230-790 ms pause. These are
 * the exact phrases from the measured calls.
 */
describe('mid-sentence ellipses on the live gateway path', () => {
  const ELLIPSIS_REPLY = [
    "Oh wow, that's just... huge news for you and the whole family. ",
    'The light outside my window... reminds me of the lake back home.',
  ];
  const hasMidSentenceEllipsis = (text: string): boolean => /(?:\.\.\.|…)\s*[a-z]/.test(text);

  afterEach(() => {
    delete process.env.SPEECH_DIRECTOR;
  });

  it('reach Cartesia unchanged with the Director off', async () => {
    delete process.env.SPEECH_DIRECTOR;
    const all = (await runGateway(ELLIPSIS_REPLY)).pushes.join('');
    expect(all).toContain("that's just...");
    expect(all).toContain('window...');
  });

  it('are taken out with SPEECH_DIRECTOR=live after the opening, keeping every word', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    const { pushes } = await runGateway(ELLIPSIS_REPLY);
    // The opening piece is never held (time to first audio, review M3), so a
    // "..." that ends it reaches Cartesia; every later one is taken out.
    expect(pushes[0]).toContain("Oh wow, that's just...");
    const rest = pushes.slice(1).join('');
    expect(rest).not.toMatch(/\.\.\.|…/);
    expect(rest).toContain('my window reminds me');
  });

  it('are counted but left in with SPEECH_DIRECTOR=shadow', async () => {
    process.env.SPEECH_DIRECTOR = 'shadow';
    const all = (await runGateway(ELLIPSIS_REPLY)).pushes.join('');
    expect(hasMidSentenceEllipsis(all)).toBe(true);
  });
});

/**
 * Deliberate change to the default path (stream D item 4): asterisk stage
 * directions used to reach Cartesia verbatim with the Director off, so the
 * voice said "smiles". Before this fix the pushes were exactly
 * BEFORE_FIX_PUSHES; now the directions are dropped on every setting, and
 * nothing else in the reply changes.
 */
describe('asterisk stage directions on the live gateway path', () => {
  const REPLY = ['*smiles* That is great news. ', 'Okay *laughs* so 5*3 is 15, f*** yes.'];
  const BEFORE_FIX_PUSHES = [
    '*smiles* That is great news. ',
    'Okay *laughs* so 5*3 is 15, f*** yes. ',
  ];

  afterEach(() => {
    delete process.env.SPEECH_DIRECTOR;
  });

  for (const mode of [undefined, 'off', 'shadow', 'live']) {
    it(`are never spoken (SPEECH_DIRECTOR=${mode ?? 'unset'})`, async () => {
      if (mode) process.env.SPEECH_DIRECTOR = mode;
      const { pushes } = await runGateway(REPLY);
      const all = pushes.join('');
      expect(all).not.toMatch(/smiles|laughs/);
      expect(all).toContain('5*3 is 15, f*** yes.');
    });
  }

  it('changes only the directions on the default path', async () => {
    delete process.env.SPEECH_DIRECTOR;
    const { pushes } = await runGateway(REPLY);
    expect(pushes).toEqual(
      BEFORE_FIX_PUSHES.map((p) => p.replace('*smiles* ', '').replace(' *laughs*', ''))
    );
  });
});
