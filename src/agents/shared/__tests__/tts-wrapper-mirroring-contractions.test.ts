/**
 * Mirroring on the live reply path contracts by the shared spoken rule (#2347). The
 * wrapper tells it what the reply said before each chunk; without that, a chunk's
 * opening pair is never contracted (its start could be mid-sentence). Upstream
 * buffering hands mirroring whole sentences here, so the stranded pair below arrives
 * inside one chunk.
 */
import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

import { getLinguisticMirroring } from '../../../conversation/superhuman/linguistic-mirroring.js';

const spoken: string[] = [];

async function drain(text: NodeReadableStream<string>): Promise<null> {
  let all = '';
  for await (const chunk of text) all += chunk;
  spoken.push(all);
  return null;
}

vi.mock('../../../speech/tts-gateway/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/tts-gateway/index.js')>()),
  isTTSGatewayEnabled: () => true,
  createGatewayTTSNode: () => drain,
}));

describe('tts-wrapper: mirroring contracts with the reply so far', () => {
  it('keeps a stranded pair, and contracts the pair opening a later chunk', async () => {
    const userId = 'mirroring-contractions-user';
    const engine = getLinguisticMirroring(userId);
    for (const line of ["I'm good.", "we're hanging out", "it's fine, don't worry"]) {
      engine.analyzeMessage(line);
    }
    const { wrappedTtsNode } = await import('../tts-wrapper.js');
    const chunks = ['I can see how worried ', 'you are about this', '. ', 'It is late now.'];
    await wrappedTtsNode(
      {} as voice.Agent,
      new ReadableStream<string>({
        start(c) {
          for (const chunk of chunks) c.enqueue(chunk);
          c.close();
        },
      }),
      {} as voice.ModelSettings,
      { sessionContext: { sessionId: 'mirroring-1', personaId: 'ferni', turnNumber: 3, userId } }
    );
    expect(spoken).toHaveLength(1);
    const words = spoken[0].replace(/<[^>]*>/g, '');
    expect(words).toContain('how worried you are about this');
    expect(words).toContain("It's late now.");
  });
});
