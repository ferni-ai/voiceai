/**
 * The turn reaches the Director through the real gateway node: tts-wrapper
 * passes its session context as `turnContext` (used for the user's words and
 * laughter cooldowns), and the Stage 2 plan the Director sets is keyed by
 * the reply id the gateway node generates and tags onto the returned audio
 * stream (`reply-audio-id.ts`), never by turnNumber (review H2).
 */
import type { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VOICE_IDS } from '../../../../config/voice-ids.js';
import { clearReplyAudioPlan, takeReplyAudioPlan } from '../../../reply-audio-plan.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import type { ITTSProvider } from '../../types.js';

const pushes: string[] = [];
const provider: ITTSProvider = {
  name: 'cartesia',
  synthesize: vi.fn().mockResolvedValue(new ArrayBuffer(4800)),
  synthesizeStream: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
  estimateDuration: vi.fn().mockReturnValue(100),
  openReplyStream: (): ReplyStream => ({
    push: (t: string) => void pushes.push(t),
    end: () => undefined,
    cancel: () => undefined,
    async *[Symbol.asyncIterator]() {
      yield new ArrayBuffer(960);
    },
  }),
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

const SESSION = 'turn-context-session';

afterEach(() => {
  delete process.env.SPEECH_DIRECTOR;
  clearReplyAudioPlan(SESSION);
  pushes.length = 0;
});

async function speak(
  turnNumber: number | undefined
): Promise<NodeReadableStream<AudioFrame> | null> {
  const { createGatewayTTSNode } = await import('../../gateway-tts-node.js');
  const node = createGatewayTTSNode({
    voiceId: VOICE_IDS.FERNI,
    sessionId: SESSION,
    personaId: 'ferni',
    turnContext: { turnNumber, userRequest: 'my dog died last night' },
    enableCache: false,
  });
  const audio = await node(
    new ReadableStream<string>({
      start(c) {
        c.enqueue('<speed ratio="0.9"/>I am so sorry. That is so hard. ');
        c.close();
      },
    })
  );
  for await (const _ of audio!) {
    /* drain */
  }
  return audio;
}

describe('gateway → Director turn wiring', () => {
  it('keys the Stage 2 plan by the reply id the gateway node generated', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    const { getReplyAudioId } = await import('../../reply-audio-id.js');
    const audio = await speak(9);
    const replyId = getReplyAudioId(audio);
    expect(replyId).toBeDefined();
    expect(takeReplyAudioPlan(SESSION, replyId)?.tempo).toBeLessThan(1);
    expect(pushes.join('')).not.toMatch(/<\/?(?:speed|emotion|volume)\b/);
  });

  it('plans even without a turnNumber (the reply id never depends on it), and none with the Director off', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    const { getReplyAudioId } = await import('../../reply-audio-id.js');
    const audio1 = await speak(undefined);
    const replyId1 = getReplyAudioId(audio1);
    expect(takeReplyAudioPlan(SESSION, replyId1)?.tempo).toBeLessThan(1);

    process.env.SPEECH_DIRECTOR = 'off';
    const audio2 = await speak(3);
    const replyId2 = getReplyAudioId(audio2);
    expect(takeReplyAudioPlan(SESSION, replyId2)).toBeUndefined();
    expect(pushes.at(-1)).toBeDefined();
  });
});
