/**
 * Lost-reply repro (2026-10-13), local and deterministic: a real LiveKit
 * AgentSession (@livekit/agents 1.5.1 + Ferni's patch) with the real
 * TranscriptionSynchronizer in front of a room output whose code is copied
 * from room_io/_output.js ParticipantAudioOutput (only the rtc AudioSource is
 * faked: a 1 s queue that plays in real time).
 *
 * Shape: reply 1 plays normally. Reply 2 is created, the caller starts talking
 * while it is still "thinking" (pause), its first TTS frame arrives while the
 * room output is paused, then the caller's words come (final transcript ->
 * cancelSpeechPause). Replies 3..5 are plain turns. Each reply's
 * conversation_item_added text should be its own text.
 *
 * "dev" puts ResumeBufferOutput (NEVER_SILENT=on) in front, as dev and prod run
 * today; "prod" is the chain without it (005ecee44). Live repro and timelines:
 * voiceai-evidence/lost-replies-repro-2026-10-13.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, tts, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { interruptionOverrides } from '../interruption-config.js';
import { ensureResumeBuffer } from '../resume-buffer.js';

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
const { Future, Task } = (await import(join(dirname(sdkDist), 'utils.js'))) as {
  Future: new () => { done: boolean; await: Promise<unknown>; resolve(v?: unknown): void };
  Task: {
    from(fn: (c: AbortController) => Promise<void>): {
      done: boolean;
      result: Promise<void>;
      cancel(): void;
    };
  };
};

const SAMPLE_RATE = 24_000;
const FRAME_MS = 20;
const MS_PER_CHAR = 70;
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

/** TTS whose first frame comes `firstMs` after the text (TTS latency / PAUSE_HOLD). */
class SlowStartTTS extends tts.TTS {
  label = 'slow-start-tts';
  constructor(private readonly firstMs: () => number) {
    super(SAMPLE_RATE, 1, { streaming: false });
  }
  synthesize(text: string): tts.ChunkedStream {
    return new SlowChunked(text, this, this.firstMs());
  }
  stream(): tts.SynthesizeStream {
    throw new Error('not streaming');
  }
}
class SlowChunked extends tts.ChunkedStream {
  label = 'slow-start-tts';
  constructor(
    text: string,
    model: tts.TTS,
    private readonly firstMs: number
  ) {
    super(text, model, { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 });
  }
  protected async run(): Promise<void> {
    await sleep(this.firstMs);
    const frames = Math.max(1, Math.round((this.inputText.length * MS_PER_CHAR) / FRAME_MS));
    const samples = (SAMPLE_RATE * FRAME_MS) / 1000;
    for (let i = 0; i < frames; i++) {
      const frame = new AudioFrame(new Int16Array(samples), SAMPLE_RATE, 1, samples);
      this.queue.put({ requestId: 'r', segmentId: 's', frame, final: i === frames - 1 });
    }
  }
}

/** rtc AudioSource stand-in: a 1 s queue drained in real time, same waiter semantics. */
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

/** room_io/_output.js ParticipantAudioOutput (1.5.1), verbatim apart from the source and start. */
class RoomAudioOutput extends voice.AudioOutput {
  audioSource = new FakeAudioSource();
  flushTask?: { done: boolean; result: Promise<void>; cancel(): void };
  flushPushedDuration?: number;
  pushedDuration = 0;
  startedFuture = new Future();
  interruptedFuture = new Future();
  firstFrameEmitted = false;
  playbackEnabledFuture = new Future();
  constructor() {
    super(SAMPLE_RATE, undefined, { pause: true });
    this.playbackEnabledFuture.resolve();
    this.startedFuture.resolve();
  }
  pause(): void {
    if (this.playbackEnabledFuture.done) this.playbackEnabledFuture = new Future();
    this.audioSource.clearQueue();
    super.pause();
  }
  resume(): void {
    if (!this.playbackEnabledFuture.done) this.playbackEnabledFuture.resolve();
    this.firstFrameEmitted = false;
    super.resume();
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    await this.startedFuture.await;
    if (!this.playbackEnabledFuture.done) {
      this.audioSource.clearQueue();
      await Promise.race([this.playbackEnabledFuture.await, this.interruptedFuture.await]);
      if (this.interruptedFuture.done) return;
    }
    void super.captureFrame(frame);
    if (!this.firstFrameEmitted) {
      this.firstFrameEmitted = true;
      this.onPlaybackStarted(Date.now());
    }
    this.pushedDuration += frame.samplesPerChannel / frame.sampleRate;
    await this.audioSource.captureFrame(frame);
  }
  async waitForPlayoutTask(abortController: AbortController): Promise<void> {
    const accountedDuration = this.pushedDuration;
    const abortFuture = new Future();
    this.interruptedFuture = new Future();
    const resolveAbort = () => {
      if (!abortFuture.done) abortFuture.resolve(true);
    };
    abortController.signal.addEventListener('abort', resolveAbort);
    void this.audioSource.waitForPlayout().finally(() => {
      abortController.signal.removeEventListener('abort', resolveAbort);
      if (!abortFuture.done) abortFuture.resolve(false);
    });
    const aborted = await Promise.race([
      abortFuture.await,
      this.interruptedFuture.await.then(() => true),
    ]);
    const interrupted = this.interruptedFuture.done || Boolean(aborted);
    let pushedDuration = accountedDuration;
    if (interrupted) {
      pushedDuration = Math.max(accountedDuration - this.audioSource.queuedDuration / 1e3, 0);
      this.audioSource.clearQueue();
    }
    this.pushedDuration = 0;
    this.firstFrameEmitted = false;
    this.onPlaybackFinished({ playbackPosition: pushedDuration, interrupted });
  }
  flush(): void {
    super.flush();
    if (!this.pushedDuration) return;
    if (this.flushTask && !this.flushTask.done) {
      if (this.flushPushedDuration === this.pushedDuration) return;
      flushErrors += 1; // "flush called while playback is in progress"
      this.flushTask.cancel();
    }
    this.flushPushedDuration = this.pushedDuration;
    const flushTask = Task.from((controller) => this.waitForPlayoutTask(controller));
    this.flushTask = flushTask;
    void flushTask.result
      .finally(() => {
        if (this.flushTask === flushTask) this.flushPushedDuration = undefined;
      })
      .catch(() => undefined);
  }
  clearBuffer(): void {
    if (!this.interruptedFuture.done) this.interruptedFuture.resolve();
  }
}
let flushErrors = 0;

class TextSink {
  text = '';
  async captureText(t: string | { text: string }): Promise<void> {
    this.text += typeof t === 'string' ? t : t.text;
  }
  flush(): void {}
  onAttached(): void {}
  onDetached(): void {}
}

const REPLIES = [
  'Grew up out in Wyoming, actually.',
  'Tom must be a good guy, then.',
  'Nah, we did not meet out there.',
  'Ha, mostly hiking on weekends.',
  'Pasta, quick and easy.',
];

class ScriptLLM extends llm.LLM {
  n = 0;
  label(): string {
    return 'script';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    const text = REPLIES[this.n++ % REPLIES.length];
    return new ScriptStream(this, text, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class ScriptStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly text: string,
    o: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, o);
  }
  protected async run(): Promise<void> {
    await sleep(150);
    this.queue.put({ id: 'r', delta: { role: 'assistant', content: this.text } });
  }
}

interface Activity {
  isInterruptionByAudioActivityEnabled: boolean;
  onStartOfSpeech(ev: { speechDuration: number }): void;
  onEndOfSpeech(): void;
  cancelSpeechPause(): Promise<void>;
}

const cleanups: Array<() => Promise<void> | void> = [];

async function run(
  chain: 'prod' | 'dev',
  overlap: { pauseAt: number; wordsAt: number; firstMs: number; endAt?: number; how?: 'interrupt' },
  guard: 'on' | 'off'
) {
  flushErrors = 0;
  let firstMs = 300;
  const session = new voice.AgentSession({
    llm: new ScriptLLM(),
    tts: new SlowStartTTS(() => firstMs),
    turnHandling: {
      interruption: interruptionOverrides({ NEVER_SILENT: chain === 'dev' ? 'on' : 'off' }),
    },
  } as never);
  const room = new RoomAudioOutput();
  const sink = new TextSink();
  const sync = new TranscriptionSynchronizer(room, sink);
  session.output.audio = sync.audioOutput;
  session.output.transcription = sync.textOutput as never;
  if (chain === 'dev')
    ensureResumeBuffer(session as never, undefined, { PLAYOUT_DRIFT_GUARD: guard });
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  cleanups.push(
    () => room.audioSource.close(),
    () => session.close().catch(() => undefined)
  );
  await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
  const t0 = Date.now();
  const items: Array<{ t: number; text: string; interrupted: boolean }> = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const it = ev.item as {
      type: string;
      role?: string;
      textContent?: string;
      interrupted?: boolean;
    };
    if (it.type === 'message' && it.role === 'assistant')
      items.push({
        t: Date.now() - t0,
        text: it.textContent ?? '',
        interrupted: Boolean(it.interrupted),
      });
  });
  const states: Array<{ t: number; s: string }> = [];
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) =>
    states.push({ t: Date.now() - t0, s: ev.newState })
  );
  const act = () => (session as unknown as { _activity: Activity })._activity;

  // Reply 1: plain.
  session.generateReply({ userInput: 'Where did you grow up?' });
  await sleep(4000);
  // Reply 2: caller talks while it is thinking; first audio lands in the pause; then words.
  firstMs = overlap.firstMs;
  session.generateReply({ userInput: 'Do you know my friend Tom?' });
  await sleep(overlap.pauseAt);
  act().isInterruptionByAudioActivityEnabled = true;
  (session as unknown as { _aecWarmupRemaining: number })._aecWarmupRemaining = 0;
  act().onStartOfSpeech({ speechDuration: 0 }); // VAD: caller started, agent "thinking" -> pause
  if (overlap.endAt !== undefined) {
    await sleep(overlap.endAt - overlap.pauseAt);
    act().onEndOfSpeech(); // VAD end first: false-interruption timer (timeout 0) may resume
    await sleep(overlap.wordsAt - overlap.endAt);
    await act().cancelSpeechPause();
  } else {
    await sleep(overlap.wordsAt - overlap.pauseAt);
    if (overlap.how === 'interrupt')
      void session.interrupt(); // a Ferni-side interrupt (no clearBuffer, no resume)
    else await act().cancelSpeechPause(); // final transcript with real words
    act().onEndOfSpeech();
  }
  firstMs = 300;
  // Replies 3..5: plain turns, each after the previous one played.
  for (const q of [
    'Did you meet him out there?',
    'What do you do on weekends?',
    'What should I cook?',
  ]) {
    session.generateReply({ userInput: q });
    await sleep(4500);
  }
  await sleep(1500);
  return { items, states, flushErrors, syncTextSeen: sink.text };
}

type Overlap = Parameters<typeof run>[1];
/** First frame waits at the paused gate, then the caller's words cut the reply. */
const CUT_AT_GATE: Overlap = { pauseAt: 200, wordsAt: 900, firstMs: 600 };

describe('lost-reply drift (real AgentSession + real synchronizer)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });
  const later = (r: Awaited<ReturnType<typeof run>>) =>
    REPLIES.slice(2).map((text) => r.items.find((i) => i.text === text));

  it('guard off: a reply cut at the resume buffer gate leaves every later reply unrecorded', async () => {
    const r = await run('dev', CUT_AT_GATE, 'off');
    expect(later(r)).toEqual([undefined, undefined, undefined]);
  }, 30_000);

  it.each([
    ['cut at the gate', CUT_AT_GATE],
    ['words before the first frame', { pauseAt: 200, wordsAt: 500, firstMs: 900 }],
    ['session.interrupt() while the frame waits', { ...CUT_AT_GATE, how: 'interrupt' as const }],
  ])(
    'PLAYOUT_DRIFT_GUARD=on, %s: each later reply is recorded with its own text',
    async (_n, o) => {
      const r = await run('dev', o, 'on');
      for (const item of later(r)) expect(item?.interrupted).toBe(false);
    },
    30_000
  );

  it('control, no resume buffer: LiveKit settles the drift itself', async () => {
    const r = await run('prod', CUT_AT_GATE, 'off');
    for (const item of later(r)) expect(item?.interrupted).toBe(false);
  }, 30_000);
});
