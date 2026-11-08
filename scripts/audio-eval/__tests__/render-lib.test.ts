import { describe, expect, it, vi } from 'vitest';

// Only the TTS network edge and the post-TTS stage are stubbed, so the test
// sees exactly what renderReply hands them.
const calls = vi.hoisted(() => ({
  node: [] as unknown[],
  chunks: [] as string[],
  post: [] as unknown[],
  rate: 24000,
}));

vi.mock('../../../src/speech/tts-gateway/gateway-tts-node.js', () => ({
  createGatewayTTSNode: (opts: unknown) => {
    calls.node.push(opts);
    return async (stream: ReadableStream<string>) => {
      for await (const c of stream as unknown as AsyncIterable<string>) calls.chunks.push(c);
      return 'audio';
    };
  },
}));
vi.mock('../../../src/speech/tts-gateway/reply-audio-id.js', () => ({
  getReplyAudioId: () => 'reply-id',
}));
vi.mock('../../../src/agents/shared/performance/post-tts-transform.js', async (orig) => ({
  ...(await orig<object>()),
  applyPostTTSEnhancement: async (audio: unknown, config: unknown, id: unknown) => {
    calls.post.push([audio, config, id]);
    const data = Int16Array.from([16384, -16384]);
    return (async function* () {
      yield { sampleRate: calls.rate, data, samplesPerChannel: 2 };
    })();
  },
}));

import { PostTTSPresets } from '../../../src/agents/shared/performance/post-tts-transform.js';
import { RENDER_RATE, renderReply } from '../render-lib.js';

const reply = {
  text: 'one two three four five',
  personaId: 'ferni',
  voiceId: 'voice-x',
  sessionId: 'blind-A-1',
  userText: 'ugh. long day.',
};

describe('renderReply', () => {
  it('calls the TTS node and post-TTS with what phone-voice-blind passed before the move', async () => {
    const pcm = await renderReply(reply);
    // The literal options phone-voice-blind.ts built inline before render-lib existed.
    expect(calls.node).toEqual([
      {
        voiceId: 'voice-x',
        sessionId: 'blind-A-1',
        personaId: 'ferni',
        turnContext: { turnNumber: 3, userRequest: 'ugh. long day.' },
        sampleRate: 24000,
        frameDurationMs: 20,
        enableCache: false,
      },
    ]);
    expect(calls.chunks).toEqual(['one two three ', 'four five ']);
    expect(calls.post).toEqual([
      [
        'audio',
        { ...PostTTSPresets.betterThanHuman, sessionId: 'blind-A-1', personaId: 'ferni' },
        'reply-id',
      ],
    ]);
    expect(Array.from(pcm)).toEqual([0.5, -0.5]);
    expect(RENDER_RATE).toBe(24000);
  });

  it('refuses audio at any other sample rate', async () => {
    calls.rate = 16000;
    await expect(renderReply(reply)).rejects.toThrow(/unexpected rate 16000/);
    calls.rate = 24000;
  });
});
