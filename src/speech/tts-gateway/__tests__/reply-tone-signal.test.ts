import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioFrame } from '@livekit/rtc-node';
import { createContinuationTTS } from '../continuation-tts.js';
import { replyToneEnabled, sendReplyTone } from '../reply-tone-signal.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { getSSMLProcessor } from '../ssml/processor.js';
import { initFrontendSignal, resetFrontendSignal } from '../../../services/frontend-signal.js';

type Sent = { type: string; data?: Record<string, unknown> };

class FakeReply implements ReplyStream {
  pushes: string[] = [];
  push(text: string) {
    this.pushes.push(text);
  }
  end() {}
  cancel() {}
  async *[Symbol.asyncIterator]() {
    yield new ArrayBuffer(4);
  }
}

const processor = getSSMLProcessor();
/** The send runs in the background; let it settle. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
let sent: Sent[];

function listen(sessionId: string): void {
  initFrontendSignal(sessionId, async (type, data) => {
    sent.push({ type, data });
  });
}

async function speak(
  pieces: string[],
  opts: { sessionId?: string; emotion?: string; baseSpeed?: number }
) {
  const stream = createContinuationTTS({
    textStream: new ReadableStream<string>({
      start(c) {
        for (const p of pieces) c.enqueue(p);
        c.close();
      },
    }),
    reply: new FakeReply(),
    sanitize: (chunk) => {
      const r = processor.parse(chunk);
      return { text: r.cleanText.trim(), prosody: r.prosody };
    },
    openingTags: prosodyTags,
    toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
    onFirstAudio: () => undefined,
    onError: () => undefined,
    ...opts,
  });
  for await (const _ of stream) void _;
  await settle();
}

beforeEach(() => {
  sent = [];
  vi.stubEnv('CASCADE_SENTENCE_BREAK_MS', '0');
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetFrontendSignal();
});

describe('replyToneEnabled', () => {
  it('is off unless AVATAR_REPLY_TONE=on', () => {
    expect(replyToneEnabled({})).toBe(false);
    expect(replyToneEnabled({ AVATAR_REPLY_TONE: 'off' })).toBe(false);
    expect(replyToneEnabled({ AVATAR_REPLY_TONE: 'on' })).toBe(true);
  });
});

describe('sendReplyTone', () => {
  it('sends nothing when the flag is off', async () => {
    listen('s1');
    sendReplyTone({ emotion: 'calm', speed: 1 }, 's1', {});
    await settle();
    expect(sent).toEqual([]);
  });

  it('sends nothing without a session, so another call never gets it', async () => {
    listen('s1');
    sendReplyTone({ emotion: 'calm', speed: 1 }, undefined, { AVATAR_REPLY_TONE: 'on' });
    await settle();
    expect(sent).toEqual([]);
  });

  it('sends a null emotion when the voice takes its tone from the words', async () => {
    listen('s1');
    sendReplyTone({ speed: 0.95 }, 's1', { AVATAR_REPLY_TONE: 'on' });
    await settle();
    expect(sent).toEqual([{ type: 'reply_tone', data: { emotion: null, speed: 0.95 } }]);
  });
});

describe('continuation TTS reply tone', () => {
  it('sends the opening emotion and speed once per reply when the flag is on', async () => {
    vi.stubEnv('AVATAR_REPLY_TONE', 'on');
    listen('s1');
    await speak(
      [
        '<emotion value="affectionate"/><speed ratio="0.9"/>You caught me. ',
        '<emotion value="sympathetic"/>That part is hard. And it is late.',
      ],
      { sessionId: 's1', baseSpeed: 1 }
    );
    expect(sent).toEqual([{ type: 'reply_tone', data: { emotion: 'affectionate', speed: 0.9 } }]);
  });

  it('uses the emotion decided from the caller mood when the reply names none', async () => {
    vi.stubEnv('AVATAR_REPLY_TONE', 'on');
    listen('s1');
    await speak(['That sounds like a really long week. '], { sessionId: 's1', emotion: 'sad' });
    expect(sent).toEqual([{ type: 'reply_tone', data: { emotion: 'sympathetic', speed: 1 } }]);
  });

  it('sends nothing when the flag is off', async () => {
    listen('s1');
    await speak(['<emotion value="affectionate"/>You caught me. '], { sessionId: 's1' });
    expect(sent).toEqual([]);
  });
});
