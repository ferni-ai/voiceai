/**
 * The 988 crisis line on the live reply path: every reply the agent speaks
 * goes through wrappedTtsNode, and the text it hands to the TTS node (the
 * gateway, or the legacy cache-aware node) says the line as "nine eight eight".
 */
import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const gateway = { on: true };
const spoken: string[] = [];

async function drain(text: NodeReadableStream<string>): Promise<null> {
  let all = '';
  for await (const chunk of text) all += chunk;
  spoken.push(all);
  return null;
}

vi.mock('../../../speech/tts-gateway/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/tts-gateway/index.js')>()),
  isTTSGatewayEnabled: () => gateway.on,
  createGatewayTTSNode: () => drain,
}));

vi.mock('../performance/cache-aware-tts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../performance/cache-aware-tts.js')>()),
  createCacheAwareTTSNode: () => (_agent: unknown, text: NodeReadableStream<string>) => drain(text),
}));

afterEach(() => {
  delete process.env.SPEAK_988_DIGITS;
  gateway.on = true;
  spoken.length = 0;
});

/** Speak a model reply streamed in token-sized chunks; return what reached TTS. */
async function speak(chunks: string[]): Promise<string> {
  const { wrappedTtsNode } = await import('../tts-wrapper.js');
  await wrappedTtsNode(
    {} as voice.Agent,
    new ReadableStream<string>({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    }),
    {} as voice.ModelSettings,
    { sessionContext: { sessionId: 'crisis-line-1', personaId: 'ferni', turnNumber: 3 } }
  );
  expect(spoken).toHaveLength(1);
  return spoken[0];
}

const REPLY = ['You can call or text', ' ninety', '-eight', '-eight any time', ', day or night.'];
// Other stages may add pauses (<break/>) to what reaches TTS; the words are what count.
const words = (text: string): string => text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');

describe('tts-wrapper: the crisis line reaches TTS as "nine eight eight"', () => {
  it('a spelled-out wrong form split across chunks is rewritten (gateway path)', async () => {
    expect(words(await speak(REPLY))).toBe(
      'You can call or text nine eight eight any time, day or night.'
    );
  });

  it('the legacy cache-aware path gets the same text', async () => {
    gateway.on = false;
    expect(words(await speak(REPLY))).toBe(
      'You can call or text nine eight eight any time, day or night.'
    );
  });

  it('the scripted "988" next to a cue is spoken the same way', async () => {
    const out = words(await speak(['You can call 9', '88. They are there', ' for you.']));
    expect(out).toBe('You can call nine eight eight. They are there for you.');
  });

  it('a 988 that is not the crisis line is left alone', async () => {
    expect(words(await speak(['It was 988', ' miles away.']))).toBe('It was 988 miles away.');
  });

  it('with SPEAK_988_DIGITS off the text reaches TTS unchanged', async () => {
    process.env.SPEAK_988_DIGITS = 'off';
    expect(words(await speak(REPLY))).toBe(
      'You can call or text ninety-eight-eight any time, day or night.'
    );
  });
});
