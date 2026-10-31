/**
 * #3200, end to end: with TTS_ALIGNED_TRANSCRIPT's aligned transcript declared,
 * a reply whose later sentences come back from Cartesia without word timings
 * keeps every sentence in its caption AND in the assistant message saved to
 * history.
 *
 * Real pieces: a LiveKit AgentSession (Ferni's patched SDK) with the real
 * TranscriptionSynchronizer, the gateway's continuation TTS, Cartesia socket and
 * reply streams, and CaptionBackfill wrapped exactly as ferni-agent.ts ttsNode
 * does. Fake: the Cartesia wire (a ws that answers each context with PCM and,
 * per context, word timestamps or none) and the room's audio source (a 1 s
 * queue drained in real time, as in lost-reply-drift.sdk.test.ts). All text is
 * fictional.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, tts, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createContinuationTTS } from '../../../speech/tts-gateway/continuation-tts.js';
import {
  CartesiaSocket,
  type SocketLike,
} from '../../../speech/tts-gateway/providers/cartesia-socket.js';
import { CartesiaReplyStream } from '../../../speech/tts-gateway/providers/cartesia-reply-stream.js';
import { prosodyTags } from '../../../speech/tts-gateway/providers/cartesia.js';
import { CaptionBackfill, captionsFromFrameTimings } from '../aligned-caption-backfill.js';

const require_ = createRequire(import.meta.url);
const sdkDist = join(dirname(require_.resolve('@livekit/agents')), 'voice');
const { TranscriptionSynchronizer } = (await import(
  join(sdkDist, 'transcription/synchronizer.js')
)) as {
  TranscriptionSynchronizer: new (
    a: unknown,
    t: unknown
  ) => { audioOutput: voice.AudioOutput; textOutput: unknown };
};
const { Future } = (await import(join(dirname(sdkDist), 'utils.js'))) as {
  Future: new () => { done: boolean; await: Promise<unknown>; resolve(v?: unknown): void };
};

const RATE = 24_000;
const FRAME_MS = 20;
/** Audio per character: ~4.8 syllables/s, a little faster than the SDK's 3.83 estimate. */
const MS_PER_CHAR = 70;
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

/** Which Cartesia contexts (by play order) come back with word timestamps. */
type Timed = (context: number) => boolean;

/** The Cartesia wire: each push is answered with its audio, then (if timed) its words spread over it. */
class FakeCartesia extends EventEmitter {
  readyState = 0;
  contexts: string[] = [];
  constructor(private readonly timed: Timed) {
    super();
  }
  send(data: string) {
    const req = JSON.parse(data) as {
      context_id: string;
      transcript?: string;
      continue?: boolean;
      cancel?: boolean;
    };
    if (req.cancel) return;
    if (!this.contexts.includes(req.context_id)) this.contexts.push(req.context_id);
    const context = this.contexts.indexOf(req.context_id);
    setTimeout(() => {
      const spoken = String(req.transcript ?? '')
        .replace(/<[^>]*>/g, '')
        .trim();
      if (spoken) {
        const s = (spoken.length * MS_PER_CHAR) / 1000;
        const pcm = new Int16Array(Math.round(RATE * s)).fill(100);
        this.reply({
          context_id: req.context_id,
          type: 'chunk',
          data: Buffer.from(pcm.buffer).toString('base64'),
        });
        if (this.timed(context)) {
          const words = spoken.split(/\s+/);
          const step = s / words.length;
          this.reply({
            context_id: req.context_id,
            type: 'timestamps',
            word_timestamps: {
              words,
              start: words.map((_, i) => i * step),
              end: words.map((_, i) => (i + 1) * step),
            },
          });
        }
      }
      if (req.continue === false)
        this.reply({ context_id: req.context_id, type: 'done', done: true });
    }, 0);
  }
  close() {
    this.readyState = 3;
  }
  private reply(message: object) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

function* toFrames(pcm: ArrayBuffer): Generator<AudioFrame> {
  const size = (RATE * FRAME_MS) / 1000;
  const all = new Int16Array(pcm);
  for (let off = 0; off < all.length; off += size) {
    const data = all.slice(off, off + size);
    yield new AudioFrame(data, RATE, 1, data.length);
  }
}

/** A TTS that declares the aligned transcript, as PersonaAwareTTS does with the flag on. */
class AlignedTTS extends tts.TTS {
  label = 'aligned-test-tts';
  constructor() {
    super(RATE, 1, { streaming: true, alignedTranscript: true });
  }
  synthesize(): tts.ChunkedStream {
    throw new Error('ttsNode is overridden');
  }
  stream(): tts.SynthesizeStream {
    throw new Error('ttsNode is overridden');
  }
}

/** The gateway reply path behind ferni-agent.ts ttsNode, on the fake wire. */
class GatewayAgent extends voice.Agent {
  wire?: FakeCartesia;
  constructor(private readonly timed: Timed) {
    super({ instructions: 'test' });
  }
  async ttsNode(text: NodeReadableStream<string>): Promise<NodeReadableStream<AudioFrame> | null> {
    const ws = new FakeCartesia(this.timed);
    this.wire = ws;
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
    const open = () =>
      new CartesiaReplyStream(socket, (transcript, more, context_id) => ({
        transcript,
        continue: more,
        context_id,
      }));
    // Each sentence a different emotion, so each is its own Cartesia context.
    let n = 0;
    // As ferni-agent.ts ttsNode: the backfill only when captions come from frame timings.
    const backfill = captionsFromFrameTimings(this) ? new CaptionBackfill() : null;
    const audio = createContinuationTTS({
      textStream: backfill ? backfill.tapText(text) : text,
      reply: open(),
      openReply: open,
      sanitize: (chunk) => ({
        text: chunk.trim(),
        prosody: { emotion: n++ % 2 ? 'curious' : 'calm' },
      }),
      openingTags: prosodyTags,
      trimLeadSilence: false,
      sentenceBreakMs: 0,
      firstChunkWaitMs: 0,
      toFrames,
      onFirstAudio: () => undefined,
      onError: () => undefined,
      wordTimings: true,
    });
    cleanups.push(() => socket.close?.());
    return backfill ? backfill.wrapAudio(audio) : audio;
  }
}

/** rtc AudioSource stand-in: a 1 s queue drained in real time. */
class FakeAudioSource {
  private queuedMs = 0;
  private promise?: Promise<void>;
  private resolveP?: () => void;
  private readonly ticker = setInterval(() => {
    if (this.queuedMs > 0) this.queuedMs = Math.max(0, this.queuedMs - FRAME_MS);
    if (this.queuedMs === 0) this.release();
  }, FRAME_MS);
  get queuedDuration(): number {
    return this.queuedMs;
  }
  private release(): void {
    if (!this.promise) return;
    this.resolveP?.();
    this.promise = undefined;
    this.resolveP = undefined;
  }
  clearQueue(): void {
    this.queuedMs = 0;
    this.release();
  }
  async waitForPlayout(): Promise<void> {
    if (this.promise) await this.promise;
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    while (this.queuedMs >= 1000) await sleep(FRAME_MS);
    this.queuedMs += (frame.samplesPerChannel / frame.sampleRate) * 1000;
    if (!this.promise)
      this.promise = new Promise((r) => {
        this.resolveP = r;
      });
  }
  close(): void {
    clearInterval(this.ticker);
  }
}

/** room_io ParticipantAudioOutput's playout accounting, on the fake source. */
class RoomAudioOutput extends voice.AudioOutput {
  audioSource = new FakeAudioSource();
  pushedDuration = 0;
  interruptedFuture = new Future();
  firstFrameEmitted = false;
  constructor() {
    super(RATE, undefined, { pause: false });
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    void super.captureFrame(frame);
    if (!this.firstFrameEmitted) {
      this.firstFrameEmitted = true;
      this.onPlaybackStarted(Date.now());
    }
    this.pushedDuration += frame.samplesPerChannel / frame.sampleRate;
    await this.audioSource.captureFrame(frame);
  }
  flush(): void {
    super.flush();
    if (!this.pushedDuration) return;
    void this.waitForPlayoutTask();
  }
  private async waitForPlayoutTask(): Promise<void> {
    const accounted = this.pushedDuration;
    this.interruptedFuture = new Future();
    await Promise.race([this.audioSource.waitForPlayout(), this.interruptedFuture.await]);
    const interrupted = this.interruptedFuture.done;
    let position = accounted;
    if (interrupted) {
      position = Math.max(accounted - this.audioSource.queuedDuration / 1e3, 0);
      this.audioSource.clearQueue();
    }
    this.pushedDuration = 0;
    this.firstFrameEmitted = false;
    this.onPlaybackFinished({ playbackPosition: position, interrupted });
  }
  clearBuffer(): void {
    if (!this.interruptedFuture.done) this.interruptedFuture.resolve();
  }
}

class CaptionSink {
  text = '';
  async captureText(t: string | { text: string }): Promise<void> {
    this.text += typeof t === 'string' ? t : t.text;
  }
  flush(): void {}
  onAttached(): void {}
  onDetached(): void {}
}

class ScriptLLM extends llm.LLM {
  constructor(private readonly sentences: string[]) {
    super();
  }
  label(): string {
    return 'script';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new ScriptStream(this, this.sentences, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class ScriptStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly sentences: string[],
    o: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, o);
  }
  protected async run(): Promise<void> {
    for (const s of this.sentences) {
      this.queue.put({ id: 'r', delta: { role: 'assistant', content: s } });
      await sleep(5);
    }
  }
}

const cleanups: Array<() => Promise<void> | void> = [];

/** One reply on a real session; `interruptAtMs` cuts it that long after playback starts. */
async function reply(sentences: string[], timed: Timed, interruptAtMs?: number) {
  const session = new voice.AgentSession({
    llm: new ScriptLLM(sentences),
    tts: new AlignedTTS(),
  } as never);
  const room = new RoomAudioOutput();
  const captions = new CaptionSink();
  const sync = new TranscriptionSynchronizer(room, captions);
  session.output.audio = sync.audioOutput;
  session.output.transcription = sync.textOutput as never;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  cleanups.push(
    () => room.audioSource.close(),
    () => session.close().catch(() => undefined)
  );
  const agent = new GatewayAgent(timed);
  await session.start({ agent });
  const history: Array<{ text: string; interrupted: boolean }> = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const item = ev.item as {
      type: string;
      role?: string;
      textContent?: string;
      interrupted?: boolean;
    };
    if (item.type === 'message' && item.role === 'assistant')
      history.push({ text: item.textContent ?? '', interrupted: Boolean(item.interrupted) });
  });
  let startedAt = 0;
  room.on(voice.AudioOutput.EVENT_PLAYBACK_STARTED, () => (startedAt ||= Date.now()));
  session.generateReply({ userInput: 'hello' });
  const fullMs = sentences.join('').length * MS_PER_CHAR;
  if (interruptAtMs !== undefined) {
    while (!startedAt) await sleep(10);
    await sleep(interruptAtMs - (Date.now() - startedAt));
    void session.interrupt();
    await sleep(800);
  } else {
    for (let waited = 0; history.length === 0 && waited < fullMs + 6000; waited += 50)
      await sleep(50);
  }
  return { history, captions: captions.text, contexts: agent.wire?.contexts.length };
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const onlyFirst: Timed = (c) => c === 0;

const FOUR = [
  'Hi there. ',
  'That is amazing to hear. ',
  'I am so sorry it was hard. ',
  'See you soon, take care.',
];
// Synthetic, fictional crisis-shaped reply: the 988 line second.
const CRISIS = [
  'I am really glad you told me that. ',
  'You can call or text 988 any time, day or night. ',
  'I am right here with you.',
];

describe('#3200 aligned transcript: no sentence lost (real session + synchronizer, fake wire)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });

  it('only the first context has timestamps: all four sentences in captions and history, in order, once', async () => {
    const r = await reply(FOUR, onlyFirst);
    expect(r.contexts).toBe(4); // each sentence was its own Cartesia context
    expect(r.history).toHaveLength(1);
    expect(norm(r.history[0].text)).toBe(norm(FOUR.join('')));
    expect(r.history[0].interrupted).toBe(false);
    expect(norm(r.captions)).toBe(norm(FOUR.join('')));
  }, 30_000);

  it('crisis-shaped reply, the 988 sentence untimed: it is in the caption and the saved reply', async () => {
    const r = await reply(CRISIS, (c) => c !== 1);
    expect(r.contexts).toBe(3);
    expect(r.history[0].text).toContain('You can call or text 988 any time, day or night.');
    expect(norm(r.history[0].text)).toBe(norm(CRISIS.join('')));
    expect(norm(r.captions)).toBe(norm(CRISIS.join('')));
  }, 30_000);

  it('no timestamps at all: the full reply is captioned and saved', async () => {
    const r = await reply(FOUR, () => false);
    expect(norm(r.history[0].text)).toBe(norm(FOUR.join('')));
    expect(norm(r.captions)).toBe(norm(FOUR.join('')));
  }, 30_000);

  it('an interrupt mid-reply saves only what was spoken: a prefix, never an unplayed sentence', async () => {
    // Sentence 1 (timed) plays 0-0.7 s, sentence 2 (untimed) 0.7-2.5 s; cut at 2.2 s.
    const r = await reply(FOUR, onlyFirst, 2200);
    expect(r.history).toHaveLength(1);
    const saved = norm(r.history[0].text);
    expect(r.history[0].interrupted).toBe(true);
    expect(norm(FOUR.join('')).startsWith(saved)).toBe(true);
    expect(saved).toContain('Hi there.');
    expect(saved).not.toContain('sorry'); // sentence 3 never started playing
    expect(saved).not.toContain('See you');
  }, 30_000);
});
