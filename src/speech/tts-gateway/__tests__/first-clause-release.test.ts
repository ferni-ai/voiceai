/**
 * FIRST_CLAUSE_TTS (first-clause-release.ts): the first TTS piece of a reply
 * goes at its first clause break; later pieces stay sentence-cut.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findChunkEnd } from '../chunk-boundary.js';
import {
  FIRST_CLAUSE_MIN_CHARS,
  findFirstClauseEnd,
  findFirstReleaseEnd,
} from '../first-clause-release.js';
import { createGatewayTTSNode } from '../gateway-tts-node.js';
import type { ITTSProvider } from '../types.js';

const synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(4800));
const mockProvider: ITTSProvider = {
  name: 'mock-cartesia',
  synthesize,
  synthesizeStream: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
  estimateDuration: vi.fn().mockReturnValue(100),
};

vi.mock('../providers/index.js', () => ({
  getTTSProvider: () => mockProvider,
  getCartesiaProvider: () => mockProvider,
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

const ON = { FIRST_CLAUSE_TTS: 'on' };
const OFF = { FIRST_CLAUSE_TTS: 'off' };

/** The texts sent to TTS, in order, for a reply streamed as these tokens. */
async function spoken(tokens: string[]): Promise<string[]> {
  const text = new ReadableStream<string>({
    start(controller) {
      for (const t of tokens) controller.enqueue(t);
      controller.close();
    },
  });
  const node = createGatewayTTSNode({ voiceId: 'voice', sessionId: 's', enableCache: false });
  const audio = await node(text);
  if (audio) for await (const frame of audio) void frame;
  return synthesize.mock.calls.map((call) => String(call[0]));
}

const REPLY = ['Honestly, ', 'that sounds ', 'really hard, ', 'and I get why, truly. ', 'Go slow.'];

describe('findFirstReleaseEnd', () => {
  it('flag off: cuts exactly where the sentence cut does', () => {
    for (const buffer of [
      'Honestly, that sounds really hard, and',
      'Honestly, that sounds really hard, and I get why. Next',
      'Oh, sure. That works for me.',
      'It costs $1,000 a month, which adds up.',
    ]) {
      expect(findFirstReleaseEnd(buffer, 20, OFF)).toBe(findChunkEnd(buffer, 20));
      expect(findFirstReleaseEnd(buffer, 20, {})).toBe(findChunkEnd(buffer, 20));
    }
  });

  it('flag on: cuts at the first clause break past the minimum', () => {
    const buffer = 'Honestly, that sounds really hard, and';
    expect(findFirstReleaseEnd(buffer, 20, OFF)).toBeNull();
    expect(buffer.slice(0, findFirstReleaseEnd(buffer, 20, ON) ?? 0)).toBe(
      'Honestly, that sounds really hard, '
    );
  });

  it('never releases a clause shorter than the minimum', () => {
    expect(FIRST_CLAUSE_MIN_CHARS).toBe(12);
    expect(findFirstReleaseEnd('Oh, wow, okay', 20, ON)).toBeNull();
    expect(findFirstClauseEnd('Honestly, ')).toBeNull(); // 9 spoken characters
    expect(findFirstClauseEnd('<emotion value="calm"/>Oh, wow, ')).toBeNull();
    expect(findFirstClauseEnd('Oh, wow, that is big, ')).toBe('Oh, wow, that is big, '.length);
  });

  it('never splits a number, a decimal or a time', () => {
    expect(findFirstClauseEnd('It costs about $1,')).toBeNull(); // "$1,000" may be next
    expect(findFirstClauseEnd('It costs about $1,000 a month')).toBeNull();
    expect(findFirstClauseEnd('Rates sit near 4.25 percent today')).toBeNull();
    expect(findFirstClauseEnd("Let's meet at 7:30 tomorrow morning")).toBeNull();
    const buffer = 'It costs about $1,000 a month, which';
    expect(buffer.slice(0, findFirstClauseEnd(buffer) ?? 0)).toBe(
      'It costs about $1,000 a month, '
    );
  });

  it('takes a short sentence end that comes before any clause', () => {
    const buffer = 'That is a great question. Well, honestly, it depends';
    expect(findFirstReleaseEnd(buffer, 20, ON)).toBe(findChunkEnd(buffer, 20));
  });
});

describe('gateway sentence-overlap path with FIRST_CLAUSE_TTS', () => {
  const saved = process.env.FIRST_CLAUSE_TTS;
  beforeEach(() => synthesize.mockClear());
  afterEach(() => {
    if (saved === undefined) delete process.env.FIRST_CLAUSE_TTS;
    else process.env.FIRST_CLAUSE_TTS = saved;
  });

  it('flag off: the first piece waits for the sentence end', async () => {
    delete process.env.FIRST_CLAUSE_TTS;
    expect(await spoken(REPLY)).toEqual([
      'Honestly, that sounds really hard, and I get why, truly.',
      'Go slow.',
    ]);
  });

  it('flag on: the first piece goes at its first clause, later pieces by sentence', async () => {
    process.env.FIRST_CLAUSE_TTS = 'on';
    expect(await spoken(REPLY)).toEqual([
      'Honestly, that sounds really hard,',
      'and I get why, truly.',
      'Go slow.',
    ]);
  });

  it('flag on: a number split across tokens stays whole', async () => {
    process.env.FIRST_CLAUSE_TTS = 'on';
    const texts = await spoken(['It costs about $1,', '000 a month, ', 'which adds up. ']);
    expect(texts[0]).toBe('It costs about $1,000 a month,');
  });
});
