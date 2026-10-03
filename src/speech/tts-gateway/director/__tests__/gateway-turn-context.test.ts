/**
 * The turn reaches the Director through the real gateway node: tts-wrapper
 * passes its session context as `turnContext`, and the Stage 2 plan the
 * Director sets is keyed by exactly that (sessionId, turnNumber).
 */
import { ReadableStream } from 'node:stream/web';
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

async function speak(turnNumber: number | undefined): Promise<void> {
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
}

describe('gateway → Director turn wiring', () => {
  it('keys the Stage 2 plan by the turn tts-wrapper passed', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    await speak(9);
    expect(takeReplyAudioPlan(SESSION, 9)?.tempo).toBeLessThan(1);
    expect(pushes.join('')).not.toMatch(/<\/?(?:speed|emotion|volume)\b/);
  });

  it('sets no plan without a turn, and none with the Director off', async () => {
    process.env.SPEECH_DIRECTOR = 'live';
    await speak(undefined);
    expect(takeReplyAudioPlan(SESSION, 0)).toBeUndefined();
    process.env.SPEECH_DIRECTOR = 'off';
    await speak(3);
    expect(takeReplyAudioPlan(SESSION, 3)).toBeUndefined();
    expect(pushes.at(-1)).toBeDefined();
  });
});
