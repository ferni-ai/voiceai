/**
 * Spoken punctuation on the live reply path: every reply the agent speaks goes
 * through wrappedTtsNode, and with SPOKEN_PUNCTUATION_NORMALIZE on the text it
 * hands to the TTS node (the gateway, or the legacy cache-aware node) has no
 * ellipses or em dashes left.
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
  delete process.env.SPOKEN_PUNCTUATION_NORMALIZE;
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
    { sessionContext: { sessionId: 'punctuation-1', personaId: 'ferni', turnNumber: 3 } }
  );
  expect(spoken).toHaveLength(1);
  return spoken[0];
}

// "Just..." split mid-ellipsis, as a tokenizer can split it.
const REPLY = ['Just..', '. talk.', ' The night was', ' long — really long', '...'];
const ELLIPSIS_OR_DASH = /\.\.\.|…|—/;
// The interrupt-aware stage adds <break time="80ms"/> after sentence marks ("Just...").
const words = (text: string): string => text.replace(/<[^>]*>/g, '');

describe('tts-wrapper: spoken punctuation reaches TTS normalized', () => {
  it('flag on, gateway path: no ellipsis or em dash reaches TTS', async () => {
    process.env.SPOKEN_PUNCTUATION_NORMALIZE = 'on';
    const out = await speak(REPLY);
    expect(out).not.toMatch(ELLIPSIS_OR_DASH);
    // The upstream 80 ms break after "Just..." merged into the one 300 ms break.
    expect(out).toContain('Just<break time="300ms"/> talk.');
    expect(out).toContain('long, really long.');
  });

  it('flag on, legacy cache-aware path: the same', async () => {
    process.env.SPOKEN_PUNCTUATION_NORMALIZE = 'on';
    gateway.on = false;
    const out = await speak(REPLY);
    expect(out).not.toMatch(ELLIPSIS_OR_DASH);
    expect(out).toContain('Just<break time="300ms"/> talk.');
  });

  it('flag off (default): the ellipses and dash reach TTS as written', async () => {
    const out = words(await speak(REPLY));
    expect(out).toBe('Just... talk. The night was long — really long...');
  });
});
