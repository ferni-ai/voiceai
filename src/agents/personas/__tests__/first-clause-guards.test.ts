/**
 * FIRST_CLAUSE_TTS (speech/tts-gateway/first-clause-release.ts) cuts the first
 * TTS piece at a clause, but only of text the reply guards have let through:
 * the name gate and the action-claim guard run before TTS, so the earlier cut
 * never speaks what they hold or drop.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGatewayTTSNode } from '../../../speech/tts-gateway/gateway-tts-node.js';
import type { ITTSProvider } from '../../../speech/tts-gateway/types.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { withNameGate } from '../name-gate.js';

const synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(4800));
const mockProvider: ITTSProvider = {
  name: 'mock-cartesia',
  synthesize,
  synthesizeStream: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
  estimateDuration: vi.fn().mockReturnValue(100),
};

vi.mock('../../../speech/tts-gateway/providers/index.js', () => ({
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

function tokens(parts: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
}

/** The texts sent to TTS, in order, for this reply text stream. */
async function spoken(text: ReadableStream<unknown>): Promise<string[]> {
  const node = createGatewayTTSNode({ voiceId: 'voice', sessionId: 's', enableCache: false });
  const audio = await node(text as ReadableStream<string>);
  if (audio) for await (const frame of audio) void frame;
  return synthesize.mock.calls.map((call) => String(call[0]));
}

// Mid-call: Ferni has replied before, so a vocative name is dropped (name-gate.ts).
const HISTORY = [
  { type: 'message', role: 'user', textContent: 'Hi there.' },
  { type: 'message', role: 'assistant', textContent: 'Hey, good to hear you.' },
  { type: 'message', role: 'user', textContent: 'I had a rough day at work.' },
];
const NAMED = ['Honestly, ', 'Seth, ', 'that sounds ', 'really hard, ', 'and I get it. '];
const CLAIM = ["I'm calling ", 'her right now, ', "and I'll let you know. "];

describe('FIRST_CLAUSE_TTS behind the reply guards', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    synthesize.mockClear();
    process.env.FIRST_CLAUSE_TTS = 'on';
    delete process.env.NAME_GATE;
    delete process.env.ACTION_CLAIM_GUARD;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('without the name gate the first clause would carry the name', async () => {
    expect((await spoken(tokens(NAMED)))[0]).toBe('Honestly, Seth,');
  });

  it('a name the gate drops is never in the early first piece', async () => {
    const gated = withNameGate(tokens(NAMED), { name: 'Seth', history: HISTORY });
    const texts = await spoken(gated);
    expect(texts[0]).toBe('Honestly, that sounds really hard,');
    expect(texts.join(' ')).not.toMatch(/Seth/);
  });

  it('without the claim guard the first clause would claim the call', async () => {
    expect((await spoken(tokens(CLAIM)))[0]).toBe("I'm calling her right now,");
  });

  it('a claim the guard drops is never in the early first piece', async () => {
    const guarded = await withActionClaimCheck(tokens(CLAIM), { items: [] }, { functionTools: {} });
    const texts = await spoken(guarded);
    expect(texts[0]).toBe("I can't actually make calls for you,");
    expect(texts.join(' ')).not.toMatch(/calling her/);
  });
});
