/**
 * The caller's name reaches the continuation path from tts-wrapper's session
 * context (turnContext.userName), so NAME_FALLING_SPLIT can find a name that
 * opens the reply.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReplyStream } from '../providers/cartesia-reply-stream.js';

const pushes: string[] = [];
const replyStream = (): ReplyStream => ({
  push: (text: string) => void pushes.push(text),
  end: () => undefined,
  cancel: () => undefined,
  async *[Symbol.asyncIterator]() {},
});

vi.mock('../providers/index.js', () => {
  const provider = {
    name: 'cartesia',
    synthesize: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    estimateDuration: vi.fn().mockReturnValue(100),
    openReplyStream: () => replyStream(),
  };
  return { getTTSProvider: () => provider, getCartesiaProvider: () => provider };
});

vi.mock('@livekit/rtc-node', () => ({ AudioFrame: class {} }));

const { createGatewayTTSNode } = await import('../gateway-tts-node.js');

async function sent(split: 'on' | 'off'): Promise<string[]> {
  pushes.length = 0;
  vi.stubEnv('SPEECH_DIRECTOR', 'off');
  vi.stubEnv('NAME_FALLING_INTONATION', 'on');
  vi.stubEnv('NAME_FALLING_SPLIT', split);
  const node = createGatewayTTSNode({
    voiceId: 'v',
    sessionId: 's',
    turnContext: { userName: 'seth ford' },
  });
  const text = new ReadableStream<string>({
    start(c) {
      c.enqueue('Seth, good to hear your voice.');
      c.close();
    },
  });
  const audio = await node(text);
  for await (const _ of audio ?? []) {
    /* drain */
  }
  return [...pushes];
}

describe('gateway TTS node: the caller name', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reaches the opening rewrite from the session context', async () => {
    expect(await sent('off')).toEqual(['Seth, good to hear your voice. ']);
    expect(await sent('on')).toEqual(['Seth. ', 'Good to hear your voice. ']);
  });
});
