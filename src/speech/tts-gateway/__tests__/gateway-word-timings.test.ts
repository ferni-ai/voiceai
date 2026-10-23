import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { createContinuationTTS } from '../continuation-tts.js';
import { CartesiaSocket, type SocketLike } from '../providers/cartesia-socket.js';
import { CartesiaReplyStream } from '../providers/cartesia-reply-stream.js';
import { CartesiaTTSProvider, prosodyTags } from '../providers/cartesia.js';
import { parseWordTimestamps } from '../word-timings.js';
import { gatewayWordTimings } from '../../tts/aligned-transcript.js';
import { directSpeech } from '../director/reply-director.js';
import { DirectorSessions } from '../director/session-state.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { CaptionBackfill } from '../../../agents/shared/aligned-caption-backfill.js';

const KEY = USERDATA_TIMED_TRANSCRIPT;
const RATE = 24000;
const tick = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });
/** Let the reply's audio loop take what the wire delivered. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

/** A fake ws: records requests, replays Cartesia messages. */
class FakeWs extends EventEmitter {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  reply(message: object) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

/** One gateway reply: real socket routing, reply stream and continuation, fake wire. */
function gatewayReply(wordTimings: boolean, text = ['Oh that is great.']) {
  const ws = new FakeWs();
  const socket = new CartesiaSocket(
    () => 'wss://test',
    1000,
    () => {
      process.nextTick(() => {
        ws.readyState = 1;
        ws.emit('open');
      });
      return ws as unknown as SocketLike;
    }
  );
  const reply = new CartesiaReplyStream(socket, (transcript, more, context_id) => ({
    transcript,
    continue: more,
    context_id,
  }));
  const stream = createContinuationTTS({
    textStream: ReadableStream.from(text),
    reply,
    sanitize: (chunk) => ({ text: chunk.trim(), prosody: {} }),
    openingTags: prosodyTags,
    trimLeadSilence: false,
    // Main's framing (gateway-tts-node.ts splitIntoFrames): 20 ms frames.
    toFrames: (pcm) => frames(pcm),
    onFirstAudio: () => undefined,
    onError: (e) => {
      throw e;
    },
    wordTimings,
  });
  const ctx = reply.contextId;
  const pcm = (ms: number, fill = 0) =>
    Buffer.from(new Int16Array((RATE * ms) / 1000).fill(fill).buffer).toString('base64');
  return {
    stream,
    ws,
    chunk: async (ms: number, fill?: number) => {
      ws.reply({ context_id: ctx, type: 'chunk', data: pcm(ms, fill) });
      await settle();
    },
    words: async (word_timestamps: unknown) => {
      ws.reply({ context_id: ctx, type: 'timestamps', word_timestamps });
      await settle();
    },
    done: () => ws.reply({ context_id: ctx, type: 'done', done: true }),
  };
}

function* frames(pcm: ArrayBuffer): Generator<AudioFrame> {
  const size = (RATE * 20) / 1000;
  const all = new Int16Array(pcm);
  for (let off = 0; off < all.length; off += size) {
    const data = all.slice(off, off + size);
    yield new AudioFrame(data, RATE, 1, data.length);
  }
}

async function drain(stream: ReadableStream<AudioFrame>) {
  const out: AudioFrame[] = [];
  for await (const f of stream) out.push(f);
  return out;
}

const timingsOf = (out: AudioFrame[]) =>
  out.flatMap((f) => ((f.userdata[KEY] as voice.TimedString[]) ?? []).map((t) => t));

/** Wait until the reply stream has sent its first request on the fake wire. */
async function sent(ws: FakeWs) {
  for (let i = 0; i < 50 && ws.sent.length === 0; i++) await tick();
  expect(ws.sent.length).toBeGreaterThan(0);
}

beforeEach(() => vi.stubEnv('CASCADE_SENTENCE_BREAK_MS', '0'));
afterEach(() => vi.unstubAllEnvs());

describe('gateway Cartesia request', () => {
  /** The body the provider's reply stream sends for its first piece. */
  async function firstRequest(flag: string) {
    vi.stubEnv('TTS_ALIGNED_TRANSCRIPT', flag);
    const provider = new CartesiaTTSProvider();
    const requests: Array<Record<string, unknown>> = [];
    (provider as unknown as { socket: unknown }).socket = {
      send: async (_id: string, request: Record<string, unknown>) => void requests.push(request),
      cancel: () => undefined,
      release: () => undefined,
      close: () => undefined,
    };
    provider.openReplyStream('voice-a').push('Hello there.');
    await tick();
    provider.close();
    return requests[0];
  }

  it('asks for add_timestamps only when TTS_ALIGNED_TRANSCRIPT is on', async () => {
    expect((await firstRequest('on')).add_timestamps).toBe(true);
    const off = await firstRequest('off');
    expect('add_timestamps' in off).toBe(false);
    // Flag off sends main's body, key for key.
    expect(Object.keys(off).sort()).toEqual(
      [
        'context_id',
        'continue',
        'language',
        'max_buffer_delay_ms',
        'model_id',
        'output_format',
        'transcript',
        'voice',
        ...Object.keys(off).filter((k) => k.startsWith('pronunciation')),
      ].sort()
    );
  });
});

describe('gateway word timings on frames', () => {
  it('puts Cartesia word timings on the frames, with start and end, in order', async () => {
    const r = gatewayReply(true);
    const out = drain(r.stream as never);
    await sent(r.ws);
    await r.chunk(100);
    await r.words({ words: ['Oh', 'that'], start: [0.02, 0.21], end: [0.2, 0.4] });
    await r.chunk(200);
    await r.words({ words: ['is', 'great.'], start: [0.4, 0.5], end: [0.5, 0.9] });
    await r.chunk(700);
    r.done();
    const got = await out;
    const timed = timingsOf(got);
    expect(timed.every((t) => voice.isTimedString(t))).toBe(true);
    expect(timed.map((t) => [t.text, t.startTime, t.endTime])).toEqual([
      ['Oh ', 0.02, 0.2],
      ['that ', 0.21, 0.4],
      ['is ', 0.4, 0.5],
      ['great. ', 0.5, 0.9],
    ]);
    // Each batch rides the first frame after it arrived (chunks start at frames 5 and 15).
    expect(got.flatMap((f, i) => (f.userdata[KEY] ? [i] : []))).toEqual([5, 15]);
    expect(got).toHaveLength(50); // 1 s of 20 ms frames, nothing added
  });

  it('timings that arrive after the last audio ride a 10 ms silent frame', async () => {
    const r = gatewayReply(true);
    const out = drain(r.stream as never);
    await sent(r.ws);
    await r.chunk(100);
    await r.words({ words: ['Hi.'], start: [0], end: [0.1] });
    r.done();
    const got = await out;
    expect(got).toHaveLength(6);
    expect(got[5].samplesPerChannel).toBe(240);
    expect(timingsOf(got).map((t) => t.text)).toEqual(['Hi. ']);
  });

  it('flag off: byte-identical frames to main, no timings, even if Cartesia sent some', async () => {
    const r = gatewayReply(false);
    const out = drain(r.stream as never);
    await sent(r.ws);
    await r.chunk(100, 7);
    await r.words({ words: ['Hi.'], start: [0], end: [0.1] });
    await r.chunk(60, -3);
    r.done();
    const off = await out;
    const main = [
      ...frames(new Int16Array(2400).fill(7).buffer),
      ...frames(new Int16Array(1440).fill(-3).buffer),
    ];
    expect(off).toHaveLength(main.length);
    off.forEach((f, i) => {
      expect(Array.from(f.data)).toEqual(Array.from(main[i].data));
      expect(f.userdata).toEqual({});
    });
  });

  it('malformed timestamps are dropped and the reply still gets its caption', async () => {
    expect(
      parseWordTimestamps({
        words: ['ok', '', 'bad', 'back'],
        start: [0, 0.1, 'x', 0.5],
        end: [0.1, 0.2, 0.3, 0.4],
      })
    ).toEqual([{ word: 'ok', start: 0, end: 0.1 }]);
    expect(parseWordTimestamps(null)).toEqual([]);
    expect(parseWordTimestamps({ words: 'oops' })).toEqual([]);

    const r = gatewayReply(true, ['Hello ', 'there.']);
    const backfill = new CaptionBackfill(); // as ferni-agent.ts ttsNode wraps the gateway audio
    for await (const _ of backfill.tapText(
      ReadableStream.from(['Hello ', 'there.'])
    ) as never as AsyncIterable<string>);
    const out = drain(backfill.wrapAudio(r.stream as never)! as never);
    await sent(r.ws);
    await r.chunk(100);
    await r.words({ words: ['Hello', 'there.'], start: ['0', null], end: [0.3] });
    await r.words('not an object');
    await r.chunk(100);
    r.done();
    const got = await out;
    expect(timingsOf(got).some((t) => voice.isTimedString(t))).toBe(false);
    const captions = got.flatMap((f) => (f.userdata[KEY] as string[]) ?? []);
    expect(captions.join('')).toBe('Hello there.');
  });

  it('a second context and trimmed lead silence shift timings into reply time', async () => {
    const { ReplyWordTimings } = await import('../word-timings.js');
    const t = new ReplyWordTimings();
    t.startContext();
    t.trimmed(100);
    t.add([{ word: 'Oh', start: 0.12, end: 0.3 }]);
    const first = [...t.place(frames(new ArrayBuffer(48000)), 48000)]; // 1 s
    t.startContext();
    t.add([{ word: 'wow', start: 0.05, end: 0.4 }]);
    // A start that goes backwards inside a context continues from its last word.
    t.add([{ word: 'yes', start: 0.0, end: 0.2 }]);
    const second = [...t.place(frames(new ArrayBuffer(4800)), 4800)];
    const all = timingsOf([...first, ...second]).map((s) => [
      s.text,
      +s.startTime!.toFixed(3),
      +s.endTime!.toFixed(3),
    ]);
    expect(all).toEqual([
      ['Oh ', 0.02, 0.2],
      ['wow ', 1.05, 1.4],
      ['yes ', 1.4, 1.6],
    ]);
  });
});

describe('the speech director', () => {
  it.each(['shadow', 'live'])('passes the reply stream timings through (%s)', (mode) => {
    const words = [{ word: 'Hi.', start: 0, end: 0.2 }];
    const inner: ReplyStream = {
      push: () => undefined,
      end: () => undefined,
      cancel: () => undefined,
      takeWordTimings: () => words,
      async *[Symbol.asyncIterator]() {},
    };
    const { reply } = directSpeech(inner, {
      textStream: ReadableStream.from(['Hi.']) as never,
      voiceId: 'voice-a',
      sessionId: 'word-timings',
      personaId: 'ferni',
      env: { SPEECH_DIRECTOR: mode },
      sessions: new DirectorSessions(),
      onPlan: () => undefined,
    } as never);
    expect(reply).not.toBe(inner); // the director wraps it
    expect(reply.takeWordTimings?.()).toEqual(words);
  });
});

describe('non-Cartesia gateway providers', () => {
  it('declare no word timings, so captions stay on the SDK estimate', () => {
    const replyStream = () => undefined;
    expect(gatewayWordTimings({ name: 'cartesia', openReplyStream: replyStream }, {})).toBe(true);
    expect(gatewayWordTimings({ name: 'sonata' }, {})).toBe(false);
    expect(gatewayWordTimings({ name: 'sonata', openReplyStream: replyStream }, {})).toBe(false);
  });
});
